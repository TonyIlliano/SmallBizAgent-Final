/**
 * Heartland/Genius Restaurant POS Integration Service
 *
 * Handles API key validation, menu syncing, and order creation
 * for restaurants using Heartland POS (formerly Genius POS).
 * SmallBizAgent acts as an add-on that bridges the AI phone
 * receptionist to the restaurant's existing Heartland system.
 *
 * Flow:
 * 1. Restaurant enters their Heartland API key (provided by their Heartland rep)
 * 2. We validate the key by calling a test endpoint
 * 3. We pull their menu from Heartland and cache it locally
 * 4. AI takes phone orders using cached menu data
 * 5. Orders are created directly in Heartland via POST /v2/orders
 *
 * Auth Model:
 * - Two headers on every request:
 *   X-Api-Key: <restaurant's location API key> (stored per-business in DB)
 *   Authentication: <SmallBizAgent partner key> (from HEARTLAND_PARTNER_KEY env var)
 */

import { storage } from '../storage';
import { db } from '../db';
import { businesses } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { Business } from '@shared/schema';
import type {
  CachedMenu, CachedMenuCategory, CachedMenuItem,
  CachedModifierGroup, CachedModifier,
} from './cloverService';

// Re-export CachedMenu types for consumers
export type { CachedMenu, CachedMenuCategory, CachedMenuItem, CachedModifierGroup, CachedModifier };

// ============================================
// Heartland API Configuration
// ============================================

const HEARTLAND_BASE_URL = 'https://api.hrpos.heartland.us';

// ============================================
// Types for Heartland API Responses
// ============================================

interface HeartlandSection {
  id: string;
  name: string;
  sortOrder?: number;
  itemIds?: string[];
}

interface HeartlandItem {
  id: string;
  name: string;
  price?: number;
  description?: string;
  hidden?: boolean;
  deleted?: boolean;
  sectionIds?: string[];
  sizeIds?: string[];
  modifierIds?: string[];
  tags?: string[];
}

interface HeartlandModifierGroup {
  id: string;
  name: string;
  minRequired?: number;
  maxAllowed?: number;
  ingredients?: HeartlandIngredient[];
}

interface HeartlandIngredient {
  id: string;
  name: string;
  price?: number;
}

interface HeartlandSize {
  id: string;
  name: string;
  price?: number;
}

// Order types
export interface HeartlandOrderItem {
  itemId: string;
  quantity: number;
  sizeId?: string;
  modifiers?: { modifierId: string }[];
  notes?: string;
}

export interface HeartlandCreateOrderRequest {
  items: HeartlandOrderItem[];
  callerPhone?: string;
  callerName?: string;
  orderType?: 'pickup' | 'delivery' | 'dine_in';
  orderNotes?: string;
  vapiCallId?: string;
}

// ============================================
// Price Formatting
// ============================================

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ============================================
// API Request Helper
// ============================================

/**
 * Make an authenticated request to the Heartland API.
 * Uses two-header auth model: restaurant API key + partner key.
 */
async function heartlandApiRequest(
  apiKey: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const partnerKey = process.env.HEARTLAND_PARTNER_KEY;
  if (!partnerKey) {
    throw new Error('HEARTLAND_PARTNER_KEY environment variable is not configured');
  }

  const url = `${HEARTLAND_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Api-Key': apiKey,
      'Authentication': partnerKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 429) {
    // Rate limited — wait and retry once
    const retryAfter = parseInt(response.headers.get('retry-after') || '2');
    console.warn(`Heartland rate limit hit, waiting ${retryAfter}s...`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return heartlandApiRequest(apiKey, endpoint, options);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Heartland API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Convenience wrapper — looks up the API key from the business record.
 */
async function heartlandApiRequestForBusiness(
  businessId: number,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const business = await storage.getBusiness(businessId);
  if (!business?.heartlandApiKey) {
    throw new Error('Business is not connected to Heartland');
  }
  return heartlandApiRequest(business.heartlandApiKey, endpoint, options);
}

// ============================================
// API Key Validation & Connection
// ============================================

/**
 * Validate a Heartland API key by calling a lightweight endpoint.
 * Returns valid/invalid + location info if successful.
 */
export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean;
  locationName?: string;
  error?: string;
}> {
  try {
    // Use the settings endpoint to validate — also gives us location info
    const settings = await heartlandApiRequest(apiKey, '/v2/setup/settings');
    const locationName = settings?.name || settings?.locationName || 'Heartland Restaurant';
    return { valid: true, locationName };
  } catch (error: any) {
    console.error('Heartland API key validation failed:', error.message);
    return { valid: false, error: error.message };
  }
}

/**
 * Connect a business to Heartland POS.
 * Validates the key, saves it to the business record, and auto-syncs the menu.
 */
export async function connectHeartland(businessId: number, apiKey: string): Promise<Business> {
  // Validate the API key first
  const validation = await validateApiKey(apiKey);
  if (!validation.valid) {
    throw new Error(`Invalid Heartland API key: ${validation.error}`);
  }

  // Save to business record
  const [updated] = await db.update(businesses)
    .set({
      heartlandApiKey: apiKey,
      heartlandLocationName: validation.locationName || null,
      heartlandEnvironment: 'production',
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))
    .returning();

  console.log(`Heartland connected for business ${businessId} (${validation.locationName})`);

  // Auto-sync menu
  try {
    await syncMenu(businessId);
  } catch (e: any) {
    console.error(`Failed to auto-sync Heartland menu for business ${businessId}:`, e.message);
  }

  return updated;
}

// ============================================
// Menu Sync
// ============================================

/**
 * Sync the restaurant's menu from Heartland and cache it locally.
 * Fetches sections, items, modifiers, and sizes, then normalizes
 * to the shared CachedMenu format for the VAPI prompt.
 */
export async function syncMenu(businessId: number): Promise<CachedMenu> {
  const business = await storage.getBusiness(businessId);
  if (!business?.heartlandApiKey) {
    throw new Error('Business is not connected to Heartland');
  }
  const apiKey = business.heartlandApiKey;

  console.log(`Syncing Heartland menu for business ${businessId}...`);

  // Fetch all menu data in parallel
  const [sectionsRes, itemsRes, modifiersRes, sizesRes] = await Promise.all([
    heartlandApiRequest(apiKey, '/v2/menu/sections').catch(() => []),
    heartlandApiRequest(apiKey, '/v2/menu/items').catch(() => []),
    heartlandApiRequest(apiKey, '/v2/menu/modifiers').catch(() => []),
    heartlandApiRequest(apiKey, '/v2/menu/sizes').catch(() => []),
  ]);

  // Normalize API responses to arrays
  const sections: HeartlandSection[] = Array.isArray(sectionsRes) ? sectionsRes : (sectionsRes?.elements || sectionsRes?.data || []);
  const items: HeartlandItem[] = (Array.isArray(itemsRes) ? itemsRes : (itemsRes?.elements || itemsRes?.data || []))
    .filter((item: HeartlandItem) => !item.hidden && !item.deleted);
  const modifiers: HeartlandModifierGroup[] = Array.isArray(modifiersRes) ? modifiersRes : (modifiersRes?.elements || modifiersRes?.data || []);
  const sizes: HeartlandSize[] = Array.isArray(sizesRes) ? sizesRes : (sizesRes?.elements || sizesRes?.data || []);

  // Build lookup maps
  const modifierMap = new Map<string, HeartlandModifierGroup>();
  for (const mod of modifiers) {
    modifierMap.set(mod.id, mod);
  }

  const sizeMap = new Map<string, HeartlandSize>();
  for (const size of sizes) {
    sizeMap.set(size.id, size);
  }

  // Build a map of items by ID for quick lookup
  const itemMap = new Map<string, HeartlandItem>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Organize items into sections
  const menuCategories: CachedMenuCategory[] = [];
  const categorizedItemIds = new Set<string>();

  for (const section of sections) {
    // Items in this section — check both section.itemIds and item.sectionIds
    const sectionItems = items.filter(item => {
      if (section.itemIds?.includes(item.id)) return true;
      if (item.sectionIds?.includes(section.id)) return true;
      return false;
    });

    if (sectionItems.length > 0) {
      menuCategories.push({
        id: section.id,
        name: section.name,
        sortOrder: section.sortOrder || 0,
        items: sectionItems.map(item => {
          categorizedItemIds.add(item.id);
          return formatHeartlandItem(item, modifierMap, sizeMap);
        }),
      });
    }
  }

  // Add uncategorized items to an "Other" category
  const uncategorizedItems = items.filter(item => !categorizedItemIds.has(item.id));
  if (uncategorizedItems.length > 0) {
    menuCategories.push({
      id: 'uncategorized',
      name: 'Other',
      sortOrder: 999,
      items: uncategorizedItems.map(item =>
        formatHeartlandItem(item, modifierMap, sizeMap)
      ),
    });
  }

  // Sort categories by sortOrder
  menuCategories.sort((a, b) => a.sortOrder - b.sortOrder);

  const cachedMenu: CachedMenu = {
    categories: menuCategories,
    syncedAt: new Date().toISOString(),
  };

  // Save to database cache
  await storage.upsertHeartlandMenuCache(businessId, cachedMenu);

  const totalItems = menuCategories.reduce((sum, cat) => sum + cat.items.length, 0);
  console.log(`Heartland menu synced for business ${businessId}: ${menuCategories.length} categories, ${totalItems} items`);

  return cachedMenu;
}

/**
 * Format a Heartland item into our cached format.
 * Handles sizes as synthetic modifier groups (same approach as Square variations).
 */
function formatHeartlandItem(
  item: HeartlandItem,
  modifierMap: Map<string, HeartlandModifierGroup>,
  sizeMap: Map<string, HeartlandSize>
): CachedMenuItem {
  const modifierGroups: CachedModifierGroup[] = [];

  // Handle sizes — create a synthetic "Size" modifier group if item has multiple sizes
  const itemSizes = (item.sizeIds || [])
    .map(id => sizeMap.get(id))
    .filter(Boolean) as HeartlandSize[];

  if (itemSizes.length > 1) {
    modifierGroups.push({
      id: `sizes-${item.id}`,
      name: 'Size',
      minRequired: 1,
      maxAllowed: 1,
      modifiers: itemSizes.map(size => ({
        id: size.id,
        name: size.name,
        price: size.price || 0,
        priceFormatted: size.price ? formatPrice(size.price) : 'no charge',
      })),
    });
  }

  // Handle modifier groups
  const itemModifierIds = item.modifierIds || [];
  for (const modId of itemModifierIds) {
    const group = modifierMap.get(modId);
    if (group) {
      modifierGroups.push({
        id: group.id,
        name: group.name,
        minRequired: group.minRequired,
        maxAllowed: group.maxAllowed,
        modifiers: (group.ingredients || []).map(ing => ({
          id: ing.id,
          name: ing.name,
          price: ing.price || 0,
          priceFormatted: ing.price ? `+${formatPrice(ing.price)}` : 'no charge',
        })),
      });
    }
  }

  // Price: if item has a single size, use that size's price. Otherwise use item price.
  const itemPrice = itemSizes.length === 1
    ? (itemSizes[0].price || item.price || 0)
    : (item.price || 0);

  return {
    id: item.id,
    name: item.name,
    price: itemPrice,
    priceFormatted: formatPrice(itemPrice),
    modifierGroups,
  };
}

/**
 * Get the cached menu for a business (for VAPI prompt)
 */
export async function getCachedMenu(businessId: number): Promise<CachedMenu | null> {
  const cache = await storage.getHeartlandMenuCache(businessId);
  if (!cache?.menuData) return null;
  return cache.menuData as unknown as CachedMenu;
}

// ============================================
// Order Creation
// ============================================

/**
 * Create an order in Heartland using the POST /v2/orders API.
 * The order appears on the restaurant's POS device immediately.
 */
export async function createOrder(
  businessId: number,
  orderRequest: HeartlandCreateOrderRequest
): Promise<{ success: boolean; orderId?: string; orderTotal?: number; error?: string }> {
  console.log(`Creating Heartland order for business ${businessId}:`, JSON.stringify(orderRequest, null, 2));

  try {
    const business = await storage.getBusiness(businessId);
    if (!business?.heartlandApiKey) {
      throw new Error('Business is not connected to Heartland');
    }

    // Map our order type to Heartland's expected format
    const heartlandOrderType = mapOrderType(orderRequest.orderType);

    // Build the Heartland order payload per POST /v2/orders spec
    const orderPayload: any = {
      orderType: heartlandOrderType,
      customer: {
        firstName: (orderRequest.callerName || 'Phone Order').split(' ')[0],
        lastName: (orderRequest.callerName || '').split(' ').slice(1).join(' ') || '',
        phone: orderRequest.callerPhone || '',
      },
      items: orderRequest.items.map(item => {
        const orderItem: any = {
          itemId: item.itemId,
          quantity: item.quantity,
        };
        if (item.sizeId) {
          orderItem.sizeId = item.sizeId;
        }
        if (item.modifiers && item.modifiers.length > 0) {
          orderItem.modifiers = item.modifiers.map(m => ({
            modifierId: m.modifierId,
          }));
        }
        if (item.notes) {
          orderItem.specialRequest = item.notes;
        }
        return orderItem;
      }),
    };

    // Add special instructions
    if (orderRequest.orderNotes) {
      orderPayload.specialInstructions = orderRequest.orderNotes;
    }

    // Create the order
    const result = await heartlandApiRequest(
      business.heartlandApiKey,
      '/v2/orders',
      { method: 'POST', body: JSON.stringify(orderPayload) }
    );

    const orderId = result.id || result.orderId || result.orderNumber;
    const orderTotal = result.total || result.totalAmount || result.subTotal;

    // Log success
    await storage.createHeartlandOrderLog({
      businessId,
      heartlandOrderId: orderId ? String(orderId) : null,
      callerPhone: orderRequest.callerPhone || null,
      callerName: orderRequest.callerName || null,
      items: orderRequest.items as any,
      totalAmount: orderTotal || null,
      status: 'created',
      vapiCallId: orderRequest.vapiCallId || null,
      orderType: orderRequest.orderType || null,
      errorMessage: null,
    });

    console.log(`Order created successfully in Heartland: ${orderId}, total: ${orderTotal ? formatPrice(orderTotal) : 'N/A'}`);

    return {
      success: true,
      orderId: orderId ? String(orderId) : undefined,
      orderTotal: orderTotal || undefined,
    };

  } catch (error: any) {
    console.error(`Failed to create Heartland order for business ${businessId}:`, error);

    // Log the failed order
    await storage.createHeartlandOrderLog({
      businessId,
      heartlandOrderId: null,
      callerPhone: orderRequest.callerPhone || null,
      callerName: orderRequest.callerName || null,
      items: orderRequest.items as any,
      totalAmount: null,
      status: 'failed',
      vapiCallId: orderRequest.vapiCallId || null,
      orderType: orderRequest.orderType || null,
      errorMessage: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Map our order type to Heartland's expected format
 */
function mapOrderType(type?: string): string {
  switch (type) {
    case 'delivery': return 'delivery';
    case 'dine_in': return 'eat-in';
    case 'pickup':
    default: return 'carryout';
  }
}

// ============================================
// Connection Status
// ============================================

/**
 * Check if a business has Heartland connected and return status info
 */
export async function getHeartlandStatus(businessId: number): Promise<{
  connected: boolean;
  locationName?: string;
  environment?: string;
  lastMenuSync?: string;
  menuItemCount?: number;
}> {
  const business = await storage.getBusiness(businessId);
  if (!business?.heartlandApiKey) {
    return { connected: false };
  }

  const cache = await storage.getHeartlandMenuCache(businessId);
  const menu = cache?.menuData as unknown as CachedMenu | null;

  return {
    connected: true,
    locationName: business.heartlandLocationName || undefined,
    environment: business.heartlandEnvironment || 'production',
    lastMenuSync: cache?.lastSyncedAt?.toISOString(),
    menuItemCount: menu?.categories?.reduce((sum, cat) => sum + cat.items.length, 0) || 0,
  };
}

/**
 * Disconnect a business from Heartland
 */
export async function disconnectHeartland(businessId: number): Promise<void> {
  await storage.clearBusinessHeartlandConnection(businessId);
  console.log(`Heartland disconnected for business ${businessId}`);
}
