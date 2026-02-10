/**
 * Clover POS Integration Service
 *
 * Handles OAuth authentication, menu syncing, and order creation
 * for restaurants using Clover POS. SmallBizAgent acts as an add-on
 * that bridges the AI phone receptionist to the restaurant's existing
 * Clover system.
 *
 * Flow:
 * 1. Restaurant connects Clover via OAuth
 * 2. We pull their menu from Clover and cache it locally
 * 3. AI takes phone orders using cached menu data
 * 4. Orders are created directly in Clover via Atomic Order API
 */

import { storage } from '../storage';
import type { Business } from '@shared/schema';

// Clover API base URLs by environment
const CLOVER_URLS = {
  sandbox: {
    api: 'https://apisandbox.dev.clover.com',
    auth: 'https://sandbox.dev.clover.com',
    web: 'https://sandbox.dev.clover.com',
  },
  production: {
    api: 'https://api.clover.com',
    auth: 'https://www.clover.com',
    web: 'https://www.clover.com',
  },
};

// Types for Clover API responses
interface CloverItem {
  id: string;
  name: string;
  price: number; // In cents
  priceType?: string;
  hidden?: boolean;
  available?: boolean;
  categories?: { elements: CloverCategory[] };
  modifierGroups?: { elements: CloverModifierGroup[] };
}

interface CloverCategory {
  id: string;
  name: string;
  sortOrder?: number;
  items?: { elements: CloverItem[] };
}

interface CloverModifierGroup {
  id: string;
  name: string;
  minRequired?: number;
  maxAllowed?: number;
  modifiers?: { elements: CloverModifier[] };
}

interface CloverModifier {
  id: string;
  name: string;
  price?: number; // In cents
  available?: boolean;
}

// Our structured menu format (cached locally for VAPI prompts)
export interface CachedMenu {
  categories: CachedMenuCategory[];
  syncedAt: string;
  merchantName?: string;
}

export interface CachedMenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  items: CachedMenuItem[];
}

export interface CachedMenuItem {
  id: string;
  name: string;
  price: number; // In cents
  priceFormatted: string; // "$9.99"
  modifierGroups: CachedModifierGroup[];
}

export interface CachedModifierGroup {
  id: string;
  name: string;
  minRequired?: number;
  maxAllowed?: number;
  modifiers: CachedModifier[];
}

export interface CachedModifier {
  id: string;
  name: string;
  price: number; // In cents
  priceFormatted: string; // "+$1.50" or "$0.00"
}

// Order item structure for creating orders
export interface OrderItem {
  cloverItemId: string;
  quantity: number;
  modifiers?: { cloverId: string }[];
  notes?: string;
}

export interface CreateOrderRequest {
  items: OrderItem[];
  callerPhone?: string;
  callerName?: string;
  orderType?: 'pickup' | 'delivery' | 'dine_in';
  orderNotes?: string;
  vapiCallId?: string;
}

/**
 * Get the Clover environment URLs for a business
 */
function getCloverUrls(environment: string = 'sandbox') {
  return CLOVER_URLS[environment as keyof typeof CLOVER_URLS] || CLOVER_URLS.sandbox;
}

/**
 * Format cents to dollar string
 */
function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ============================================
// OAuth Flow
// ============================================

/**
 * Generate the Clover OAuth authorization URL
 * The restaurant owner clicks this to connect their Clover account
 */
export function getCloverAuthUrl(businessId: number, environment: string = 'sandbox'): string {
  const appId = process.env.CLOVER_APP_ID;
  if (!appId) {
    throw new Error('CLOVER_APP_ID environment variable is not configured');
  }

  const urls = getCloverUrls(environment);
  const redirectUri = `${process.env.APP_URL || 'http://localhost:5000'}/api/integrations/clover/callback`;

  // State parameter encodes businessId and environment for the callback
  const state = Buffer.from(JSON.stringify({ businessId, environment })).toString('base64');

  return `${urls.auth}/oauth/v2/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
}

/**
 * Handle the OAuth callback — exchange authorization code for tokens
 */
export async function handleCloverOAuthCallback(
  code: string,
  merchantId: string,
  state: string
): Promise<Business> {
  const appId = process.env.CLOVER_APP_ID;
  const appSecret = process.env.CLOVER_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('CLOVER_APP_ID and CLOVER_APP_SECRET must be configured');
  }

  // Decode state to get businessId and environment
  let stateData: { businessId: number; environment: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString());
  } catch (e) {
    throw new Error('Invalid OAuth state parameter');
  }

  const urls = getCloverUrls(stateData.environment);

  // Exchange code for tokens
  const tokenResponse = await fetch(`${urls.api}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      code,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Clover token exchange failed: ${error}`);
  }

  const tokenData = await tokenResponse.json() as {
    access_token: string;
    access_token_expiration: number;
    refresh_token: string;
  };

  // Save tokens to business record
  const business = await storage.updateBusinessCloverTokens(stateData.businessId, {
    cloverMerchantId: merchantId,
    cloverAccessToken: tokenData.access_token,
    cloverRefreshToken: tokenData.refresh_token,
    cloverTokenExpiry: new Date(tokenData.access_token_expiration * 1000),
    cloverEnvironment: stateData.environment,
  });

  console.log(`Clover connected for business ${stateData.businessId}, merchant ${merchantId}`);

  // Automatically sync menu after connecting
  try {
    await syncMenu(stateData.businessId);
    console.log(`Menu auto-synced for business ${stateData.businessId}`);
  } catch (e) {
    console.error(`Failed to auto-sync menu for business ${stateData.businessId}:`, e);
  }

  return business;
}

/**
 * Refresh the access token using the refresh token
 * Clover access tokens expire every ~30 minutes
 */
export async function refreshCloverToken(businessId: number): Promise<string> {
  const business = await storage.getBusiness(businessId);
  if (!business?.cloverRefreshToken || !business?.cloverEnvironment) {
    throw new Error('Business is not connected to Clover');
  }

  const appId = process.env.CLOVER_APP_ID;
  if (!appId) {
    throw new Error('CLOVER_APP_ID not configured');
  }

  const urls = getCloverUrls(business.cloverEnvironment);

  const response = await fetch(`${urls.api}/oauth/v2/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      refresh_token: business.cloverRefreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Clover token refresh failed: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    access_token_expiration: number;
  };

  await storage.updateBusinessCloverTokens(businessId, {
    cloverAccessToken: data.access_token,
    cloverTokenExpiry: new Date(data.access_token_expiration * 1000),
  });

  return data.access_token;
}

/**
 * Get a valid access token, refreshing if needed
 */
export async function getValidCloverToken(businessId: number): Promise<string> {
  const business = await storage.getBusiness(businessId);
  if (!business?.cloverAccessToken) {
    throw new Error('Business is not connected to Clover');
  }

  // Check if token is expired (with 5 minute buffer)
  if (business.cloverTokenExpiry) {
    const expiresAt = new Date(business.cloverTokenExpiry).getTime();
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (Date.now() >= expiresAt - bufferMs) {
      console.log(`Clover token expired for business ${businessId}, refreshing...`);
      return refreshCloverToken(businessId);
    }
  }

  return business.cloverAccessToken;
}

/**
 * Make an authenticated request to Clover API
 */
async function cloverApiRequest(
  businessId: number,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const business = await storage.getBusiness(businessId);
  if (!business?.cloverMerchantId || !business?.cloverEnvironment) {
    throw new Error('Business is not connected to Clover');
  }

  const token = await getValidCloverToken(businessId);
  const urls = getCloverUrls(business.cloverEnvironment);
  const url = `${urls.api}/v3/merchants/${business.cloverMerchantId}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 429) {
    // Rate limited — wait and retry once
    const retryAfter = parseInt(response.headers.get('retry-after') || '2');
    console.warn(`Clover rate limit hit, waiting ${retryAfter}s...`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return cloverApiRequest(businessId, endpoint, options);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Clover API error (${response.status}): ${error}`);
  }

  return response.json();
}

// ============================================
// Menu Sync
// ============================================

/**
 * Sync the restaurant's menu from Clover and cache it locally.
 * This pulls categories, items, modifier groups, and modifiers,
 * then structures them into a clean format for the VAPI prompt.
 */
export async function syncMenu(businessId: number): Promise<CachedMenu> {
  console.log(`Syncing Clover menu for business ${businessId}...`);

  // Step 1: Get all categories
  const categoriesResponse = await cloverApiRequest(businessId, '/categories?orderBy=sortOrder');
  const categories: CloverCategory[] = categoriesResponse.elements || [];

  // Step 2: Get all items with expanded categories and modifier groups
  const itemsResponse = await cloverApiRequest(
    businessId,
    '/items?expand=categories%2CmodifierGroups.modifiers&filter=hidden%3Dfalse&orderBy=name&limit=500'
  );
  const items: CloverItem[] = (itemsResponse.elements || []).filter(
    (item: CloverItem) => !item.hidden && item.available !== false
  );

  // Step 3: Organize items into categories
  const menuCategories: CachedMenuCategory[] = [];
  const categorizedItemIds = new Set<string>();

  for (const category of categories) {
    const categoryItems = items.filter(item => {
      const itemCategories = item.categories?.elements || [];
      return itemCategories.some(cat => cat.id === category.id);
    });

    if (categoryItems.length > 0) {
      menuCategories.push({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder || 0,
        items: categoryItems.map(item => {
          categorizedItemIds.add(item.id);
          return formatMenuItem(item);
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
      items: uncategorizedItems.map(formatMenuItem),
    });
  }

  // Sort categories by sortOrder
  menuCategories.sort((a, b) => a.sortOrder - b.sortOrder);

  const cachedMenu: CachedMenu = {
    categories: menuCategories,
    syncedAt: new Date().toISOString(),
  };

  // Save to database cache
  await storage.upsertCloverMenuCache(businessId, cachedMenu);

  const totalItems = menuCategories.reduce((sum, cat) => sum + cat.items.length, 0);
  console.log(`Menu synced for business ${businessId}: ${menuCategories.length} categories, ${totalItems} items`);

  return cachedMenu;
}

/**
 * Format a Clover item into our cached format
 */
function formatMenuItem(item: CloverItem): CachedMenuItem {
  const modifierGroups = (item.modifierGroups?.elements || []).map(group => ({
    id: group.id,
    name: group.name,
    minRequired: group.minRequired,
    maxAllowed: group.maxAllowed,
    modifiers: (group.modifiers?.elements || [])
      .filter(mod => mod.available !== false)
      .map(mod => ({
        id: mod.id,
        name: mod.name,
        price: mod.price || 0,
        priceFormatted: mod.price ? `+${formatPrice(mod.price)}` : 'no charge',
      })),
  }));

  return {
    id: item.id,
    name: item.name,
    price: item.price,
    priceFormatted: formatPrice(item.price),
    modifierGroups,
  };
}

/**
 * Get the cached menu for a business (for VAPI prompt)
 */
export async function getCachedMenu(businessId: number): Promise<CachedMenu | null> {
  const cache = await storage.getCloverMenuCache(businessId);
  if (!cache?.menuData) return null;
  return cache.menuData as unknown as CachedMenu;
}

/**
 * Format the cached menu as a readable text string for the VAPI system prompt
 */
export function formatMenuForPrompt(menu: CachedMenu): string {
  const lines: string[] = ['RESTAURANT MENU:'];

  for (const category of menu.categories) {
    lines.push(`\n--- ${category.name.toUpperCase()} ---`);

    for (const item of category.items) {
      lines.push(`• ${item.name} — ${item.priceFormatted}`);

      for (const group of item.modifierGroups) {
        const required = group.minRequired && group.minRequired > 0 ? ' (REQUIRED)' : '';
        lines.push(`  ${group.name}${required}:`);
        for (const mod of group.modifiers) {
          lines.push(`    - ${mod.name} ${mod.price > 0 ? mod.priceFormatted : ''}`);
        }
      }
    }
  }

  return lines.join('\n');
}

// ============================================
// Order Creation
// ============================================

/**
 * Create an order in Clover using the Atomic Order API.
 * This creates the full order in one API call and it appears
 * on the restaurant's Clover POS device immediately.
 */
export async function createOrder(
  businessId: number,
  orderRequest: CreateOrderRequest
): Promise<{ success: boolean; orderId?: string; orderTotal?: number; error?: string }> {
  console.log(`Creating Clover order for business ${businessId}:`, JSON.stringify(orderRequest, null, 2));

  try {
    // Build the atomic order payload
    const lineItems = orderRequest.items.map(item => {
      const lineItem: any = {
        item: { id: item.cloverItemId },
      };

      // Add modifiers if present
      if (item.modifiers && item.modifiers.length > 0) {
        lineItem.modifications = item.modifiers.map(mod => ({
          modifier: { id: mod.cloverId },
        }));
      }

      // Add note if present
      if (item.notes) {
        lineItem.note = item.notes;
      }

      // Handle quantity > 1 by duplicating line items (Clover's atomic API doesn't have quantity)
      return Array(item.quantity).fill(lineItem);
    }).flat();

    const orderPayload: any = {
      orderCart: {
        lineItems,
      },
    };

    // Add a note with caller info
    if (orderRequest.callerName || orderRequest.callerPhone) {
      const noteLines = [];
      if (orderRequest.callerName) noteLines.push(`Name: ${orderRequest.callerName}`);
      if (orderRequest.callerPhone) noteLines.push(`Phone: ${orderRequest.callerPhone}`);
      if (orderRequest.orderType) noteLines.push(`Type: ${orderRequest.orderType}`);
      if (orderRequest.orderNotes) noteLines.push(`Notes: ${orderRequest.orderNotes}`);
      orderPayload.orderCart.note = noteLines.join(' | ');
    }

    // Create the order via Clover Atomic Order API
    const result = await cloverApiRequest(businessId, '/atomic_order/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload),
    });

    const orderId = result.id;
    const orderTotal = result.total;

    // Log the successful order
    await storage.createCloverOrderLog({
      businessId,
      cloverOrderId: orderId,
      callerPhone: orderRequest.callerPhone || null,
      callerName: orderRequest.callerName || null,
      items: orderRequest.items as any,
      totalAmount: orderTotal,
      status: 'created',
      vapiCallId: orderRequest.vapiCallId || null,
      orderType: orderRequest.orderType || null,
      errorMessage: null,
    });

    console.log(`Order created successfully in Clover: ${orderId}, total: ${formatPrice(orderTotal)}`);

    return {
      success: true,
      orderId,
      orderTotal,
    };

  } catch (error: any) {
    console.error(`Failed to create Clover order for business ${businessId}:`, error);

    // Log the failed order
    await storage.createCloverOrderLog({
      businessId,
      cloverOrderId: null,
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

// ============================================
// Connection Status
// ============================================

/**
 * Check if a business has Clover connected and return status info
 */
export async function getCloverStatus(businessId: number): Promise<{
  connected: boolean;
  merchantId?: string;
  environment?: string;
  lastMenuSync?: string;
  menuItemCount?: number;
}> {
  const business = await storage.getBusiness(businessId);
  if (!business?.cloverMerchantId || !business?.cloverAccessToken) {
    return { connected: false };
  }

  const cache = await storage.getCloverMenuCache(businessId);
  const menu = cache?.menuData as unknown as CachedMenu | null;

  return {
    connected: true,
    merchantId: business.cloverMerchantId,
    environment: business.cloverEnvironment || 'sandbox',
    lastMenuSync: cache?.lastSyncedAt?.toISOString(),
    menuItemCount: menu?.categories?.reduce((sum, cat) => sum + cat.items.length, 0) || 0,
  };
}

/**
 * Disconnect a business from Clover
 */
export async function disconnectClover(businessId: number): Promise<void> {
  await storage.clearBusinessCloverConnection(businessId);
  // Optionally clear the menu cache too
  // For now we leave it so there's a record of what was synced
  console.log(`Clover disconnected for business ${businessId}`);
}
