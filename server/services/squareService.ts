/**
 * Square POS Integration Service
 *
 * Handles OAuth authentication, menu syncing, and order creation
 * for restaurants using Square POS. SmallBizAgent acts as an add-on
 * that bridges the AI phone receptionist to the restaurant's existing
 * Square system.
 *
 * Flow:
 * 1. Restaurant connects Square via OAuth
 * 2. We pull their menu from Square Catalog API and cache it locally
 * 3. AI takes phone orders using cached menu data
 * 4. Orders are created directly in Square via Orders API
 */

import { storage } from '../storage';
import type { Business } from '@shared/schema';
import { randomUUID } from 'crypto';

// Re-export the CachedMenu types from cloverService since they're shared
import type {
  CachedMenu,
  CachedMenuCategory,
  CachedMenuItem,
  CachedModifierGroup,
  CachedModifier,
} from './cloverService';

// Square API base URLs by environment
const SQUARE_URLS = {
  sandbox: {
    api: 'https://connect.squareupsandbox.com',
    auth: 'https://connect.squareupsandbox.com',
  },
  production: {
    api: 'https://connect.squareup.com',
    auth: 'https://connect.squareup.com',
  },
};

// Required OAuth scopes for menu sync and order creation
const SQUARE_SCOPES = ['ITEMS_READ', 'ORDERS_WRITE', 'MERCHANT_PROFILE_READ'];

// Types for Square API responses
interface SquareCatalogObject {
  type: string;
  id: string;
  updated_at?: string;
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  item_data?: SquareItemData;
  category_data?: SquareCategoryData;
  modifier_list_data?: SquareModifierListData;
  item_variation_data?: SquareItemVariationData;
  modifier_data?: SquareModifierData;
}

interface SquareItemData {
  name: string;
  description?: string;
  variations?: SquareCatalogObject[];
  modifier_list_info?: { modifier_list_id: string; min_selected_modifiers?: number; max_selected_modifiers?: number }[];
  categories?: { id: string; ordinal?: number }[];
  is_archived?: boolean;
}

interface SquareCategoryData {
  name: string;
  category_type?: string;
  is_top_level?: boolean;
  ordinal?: number;
}

interface SquareModifierListData {
  name: string;
  selection_type?: 'SINGLE' | 'MULTIPLE';
  modifiers?: SquareCatalogObject[];
}

interface SquareItemVariationData {
  item_id: string;
  name: string;
  price_money?: { amount: number; currency: string };
}

interface SquareModifierData {
  name: string;
  price_money?: { amount: number; currency: string };
}

// Order item structure for creating orders
export interface SquareOrderItem {
  itemId: string; // Square catalog item variation ID
  quantity: number;
  modifiers?: { modifierId: string }[];
  notes?: string;
}

export interface SquareCreateOrderRequest {
  items: SquareOrderItem[];
  callerPhone?: string;
  callerName?: string;
  orderType?: 'pickup' | 'delivery' | 'dine_in';
  orderNotes?: string;
  vapiCallId?: string;
}

/**
 * Get the Square environment URLs for a business
 */
function getSquareUrls(environment: string = 'sandbox') {
  return SQUARE_URLS[environment as keyof typeof SQUARE_URLS] || SQUARE_URLS.sandbox;
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
 * Generate the Square OAuth authorization URL
 * The restaurant owner clicks this to connect their Square account
 */
export function getSquareAuthUrl(businessId: number, environment: string = 'sandbox'): string {
  const appId = process.env.SQUARE_APP_ID;
  if (!appId) {
    throw new Error('SQUARE_APP_ID environment variable is not configured');
  }

  const urls = getSquareUrls(environment);
  const redirectUri = `${process.env.APP_URL || 'http://localhost:5000'}/api/square/callback`;

  // State parameter encodes businessId and environment for the callback
  const state = Buffer.from(JSON.stringify({ businessId, environment })).toString('base64');

  const params = new URLSearchParams({
    client_id: appId,
    scope: SQUARE_SCOPES.join(' '),
    session: 'false',
    state,
  });

  return `${urls.auth}/oauth2/authorize?${params.toString()}`;
}

/**
 * Handle the OAuth callback — exchange authorization code for tokens
 */
export async function handleSquareOAuthCallback(
  code: string,
  state: string
): Promise<Business> {
  const appId = process.env.SQUARE_APP_ID;
  const appSecret = process.env.SQUARE_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('SQUARE_APP_ID and SQUARE_APP_SECRET must be configured');
  }

  // Decode state to get businessId and environment
  let stateData: { businessId: number; environment: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString());
  } catch (e) {
    throw new Error('Invalid OAuth state parameter');
  }

  const urls = getSquareUrls(stateData.environment);

  // Exchange code for tokens
  const tokenResponse = await fetch(`${urls.api}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Square token exchange failed: ${error}`);
  }

  const tokenData = await tokenResponse.json() as {
    access_token: string;
    refresh_token: string;
    expires_at: string; // ISO timestamp
    merchant_id: string;
  };

  // Get the first location for this merchant (needed for creating orders)
  let locationId: string | undefined;
  try {
    const locResponse = await fetch(`${urls.api}/v2/locations`, {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    if (locResponse.ok) {
      const locData = await locResponse.json() as { locations?: { id: string; status: string }[] };
      const activeLocation = locData.locations?.find(l => l.status === 'ACTIVE');
      locationId = activeLocation?.id || locData.locations?.[0]?.id;
    }
  } catch (e) {
    console.warn('Could not fetch Square locations:', e);
  }

  // Save tokens to business record
  const business = await storage.updateBusinessSquareTokens(stateData.businessId, {
    squareMerchantId: tokenData.merchant_id,
    squareAccessToken: tokenData.access_token,
    squareRefreshToken: tokenData.refresh_token,
    squareTokenExpiry: new Date(tokenData.expires_at),
    squareLocationId: locationId,
    squareEnvironment: stateData.environment,
  });

  console.log(`Square connected for business ${stateData.businessId}, merchant ${tokenData.merchant_id}`);

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
 * Square access tokens expire every 30 days
 */
export async function refreshSquareToken(businessId: number): Promise<string> {
  const business = await storage.getBusiness(businessId);
  if (!business?.squareRefreshToken || !business?.squareEnvironment) {
    throw new Error('Business is not connected to Square');
  }

  const appId = process.env.SQUARE_APP_ID;
  const appSecret = process.env.SQUARE_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('SQUARE_APP_ID and SQUARE_APP_SECRET not configured');
  }

  const urls = getSquareUrls(business.squareEnvironment);

  const response = await fetch(`${urls.api}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      refresh_token: business.squareRefreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square token refresh failed: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_at: string;
  };

  await storage.updateBusinessSquareTokens(businessId, {
    squareAccessToken: data.access_token,
    squareRefreshToken: data.refresh_token,
    squareTokenExpiry: new Date(data.expires_at),
  });

  return data.access_token;
}

/**
 * Get a valid access token, refreshing if needed
 */
export async function getValidSquareToken(businessId: number): Promise<string> {
  const business = await storage.getBusiness(businessId);
  if (!business?.squareAccessToken) {
    throw new Error('Business is not connected to Square');
  }

  // Check if token is expired (with 1 day buffer — Square tokens last 30 days)
  if (business.squareTokenExpiry) {
    const expiresAt = new Date(business.squareTokenExpiry).getTime();
    const bufferMs = 24 * 60 * 60 * 1000; // 1 day
    if (Date.now() >= expiresAt - bufferMs) {
      console.log(`Square token expiring soon for business ${businessId}, refreshing...`);
      return refreshSquareToken(businessId);
    }
  }

  return business.squareAccessToken;
}

/**
 * Make an authenticated request to Square API
 */
async function squareApiRequest(
  businessId: number,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const business = await storage.getBusiness(businessId);
  if (!business?.squareAccessToken || !business?.squareEnvironment) {
    throw new Error('Business is not connected to Square');
  }

  const token = await getValidSquareToken(businessId);
  const urls = getSquareUrls(business.squareEnvironment);
  const url = `${urls.api}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': '2026-01-22',
      ...options.headers,
    },
  });

  if (response.status === 429) {
    // Rate limited — wait and retry once
    const retryAfter = parseInt(response.headers.get('retry-after') || '2');
    console.warn(`Square rate limit hit, waiting ${retryAfter}s...`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return squareApiRequest(businessId, endpoint, options);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Square API error (${response.status}): ${error}`);
  }

  return response.json();
}

// ============================================
// Menu Sync
// ============================================

/**
 * Sync the restaurant's menu from Square Catalog API and cache it locally.
 * Pulls items, categories, and modifier lists, then structures them
 * into the same CachedMenu format used by Clover for the VAPI prompt.
 */
export async function syncMenu(businessId: number): Promise<CachedMenu> {
  console.log(`Syncing Square menu for business ${businessId}...`);

  // Fetch all catalog objects (items, categories, modifier lists)
  const allObjects: SquareCatalogObject[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types: 'ITEM,CATEGORY,MODIFIER_LIST',
    });
    if (cursor) params.set('cursor', cursor);

    const response = await squareApiRequest(
      businessId,
      `/v2/catalog/list?${params.toString()}`
    );

    if (response.objects) {
      allObjects.push(...response.objects);
    }
    cursor = response.cursor;
  } while (cursor);

  // Separate by type
  const items = allObjects.filter(
    o => o.type === 'ITEM' && !o.is_deleted && !o.item_data?.is_archived
  );
  const categories = allObjects.filter(
    o => o.type === 'CATEGORY' && !o.is_deleted
  );
  const modifierLists = allObjects.filter(
    o => o.type === 'MODIFIER_LIST' && !o.is_deleted
  );

  // Build a modifier list lookup
  const modifierListMap = new Map<string, SquareCatalogObject>();
  for (const ml of modifierLists) {
    modifierListMap.set(ml.id, ml);
  }

  // Build a category lookup
  const categoryMap = new Map<string, SquareCatalogObject>();
  for (const cat of categories) {
    categoryMap.set(cat.id, cat);
  }

  // Organize items into categories
  const menuCategories: CachedMenuCategory[] = [];
  const categorizedItemIds = new Set<string>();
  const categoryItemsMap = new Map<string, CachedMenuItem[]>();

  for (const item of items) {
    const itemData = item.item_data;
    if (!itemData) continue;

    const menuItem = formatSquareMenuItem(item, modifierListMap);
    if (!menuItem) continue;

    const itemCategories = itemData.categories || [];
    if (itemCategories.length > 0) {
      for (const catRef of itemCategories) {
        categorizedItemIds.add(item.id);
        if (!categoryItemsMap.has(catRef.id)) {
          categoryItemsMap.set(catRef.id, []);
        }
        categoryItemsMap.get(catRef.id)!.push(menuItem);
      }
    }

    if (itemCategories.length === 0) {
      // Uncategorized
      if (!categoryItemsMap.has('uncategorized')) {
        categoryItemsMap.set('uncategorized', []);
      }
      categoryItemsMap.get('uncategorized')!.push(menuItem);
    }
  }

  // Build final category list
  const categoryIds = Array.from(categoryItemsMap.keys());
  for (const catId of categoryIds) {
    const catItems = categoryItemsMap.get(catId)!;
    if (catItems.length === 0) continue;

    if (catId === 'uncategorized') {
      menuCategories.push({
        id: 'uncategorized',
        name: 'Other',
        sortOrder: 999,
        items: catItems,
      });
    } else {
      const catObj = categoryMap.get(catId);
      menuCategories.push({
        id: catId,
        name: catObj?.category_data?.name || 'Unknown',
        sortOrder: catObj?.category_data?.ordinal || 0,
        items: catItems,
      });
    }
  }

  // Sort categories by ordinal
  menuCategories.sort((a, b) => a.sortOrder - b.sortOrder);

  const cachedMenu: CachedMenu = {
    categories: menuCategories,
    syncedAt: new Date().toISOString(),
  };

  // Save to database cache
  await storage.upsertSquareMenuCache(businessId, cachedMenu);

  const totalItems = menuCategories.reduce((sum, cat) => sum + cat.items.length, 0);
  console.log(`Menu synced for business ${businessId}: ${menuCategories.length} categories, ${totalItems} items`);

  return cachedMenu;
}

/**
 * Format a Square catalog item into the CachedMenuItem format.
 * Handles Square's variation model: items have one or more variations,
 * each with their own price. Single-variation items get a flat price.
 * Multi-variation items get a synthetic modifier group for size/type selection.
 */
function formatSquareMenuItem(
  item: SquareCatalogObject,
  modifierListMap: Map<string, SquareCatalogObject>
): CachedMenuItem | null {
  const itemData = item.item_data;
  if (!itemData) return null;

  const variations = itemData.variations || [];
  if (variations.length === 0) return null;

  // Build modifier groups from Square modifier lists
  const modifierGroups: CachedModifierGroup[] = [];

  for (const mlInfo of itemData.modifier_list_info || []) {
    const ml = modifierListMap.get(mlInfo.modifier_list_id);
    if (!ml?.modifier_list_data) continue;

    const mlData = ml.modifier_list_data;
    modifierGroups.push({
      id: ml.id,
      name: mlData.name,
      minRequired: mlInfo.min_selected_modifiers,
      maxAllowed: mlInfo.max_selected_modifiers !== undefined
        ? mlInfo.max_selected_modifiers
        : mlData.selection_type === 'SINGLE' ? 1 : undefined,
      modifiers: (mlData.modifiers || []).map(mod => ({
        id: mod.id,
        name: mod.modifier_data?.name || 'Unknown',
        price: mod.modifier_data?.price_money?.amount || 0,
        priceFormatted: mod.modifier_data?.price_money?.amount
          ? `+${formatPrice(mod.modifier_data.price_money.amount)}`
          : 'no charge',
      })),
    });
  }

  // Handle variations
  if (variations.length === 1) {
    // Single variation — use its price directly
    const v = variations[0];
    const price = v.item_variation_data?.price_money?.amount || 0;
    return {
      id: v.id, // Use variation ID (needed for order creation)
      name: itemData.name,
      price,
      priceFormatted: formatPrice(price),
      modifierGroups,
    };
  }

  // Multiple variations — create a synthetic modifier group
  const cheapestVariation = variations.reduce((min, v) => {
    const price = v.item_variation_data?.price_money?.amount || 0;
    const minPrice = min.item_variation_data?.price_money?.amount || 0;
    return price < minPrice ? v : min;
  });

  const basePrice = cheapestVariation.item_variation_data?.price_money?.amount || 0;

  const variationGroup: CachedModifierGroup = {
    id: `variations_${item.id}`,
    name: 'Size',
    minRequired: 1,
    maxAllowed: 1,
    modifiers: variations.map(v => {
      const vPrice = v.item_variation_data?.price_money?.amount || 0;
      const priceDiff = vPrice - basePrice;
      return {
        id: v.id, // Variation ID — will be used as the catalog_object_id in orders
        name: v.item_variation_data?.name || 'Regular',
        price: priceDiff,
        priceFormatted: priceDiff > 0 ? `+${formatPrice(priceDiff)}` : formatPrice(vPrice),
      };
    }),
  };

  // Put variation group first so AI asks about size first
  modifierGroups.unshift(variationGroup);

  return {
    id: cheapestVariation.id, // Default to cheapest variation
    name: itemData.name,
    price: basePrice,
    priceFormatted: `from ${formatPrice(basePrice)}`,
    modifierGroups,
  };
}

/**
 * Get the cached menu for a business (for VAPI prompt)
 */
export async function getCachedMenu(businessId: number): Promise<CachedMenu | null> {
  const cache = await storage.getSquareMenuCache(businessId);
  if (!cache?.menuData) return null;
  return cache.menuData as unknown as CachedMenu;
}

/**
 * Format the cached menu as a readable text string for the VAPI system prompt.
 * Uses the same format as Clover since the CachedMenu structure is identical.
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
 * Create an order in Square using the Orders API.
 * The order appears on the restaurant's Square POS device.
 */
export async function createOrder(
  businessId: number,
  orderRequest: SquareCreateOrderRequest
): Promise<{ success: boolean; orderId?: string; orderTotal?: number; error?: string }> {
  console.log(`Creating Square order for business ${businessId}:`, JSON.stringify(orderRequest, null, 2));

  try {
    const business = await storage.getBusiness(businessId);
    if (!business?.squareLocationId) {
      throw new Error('Square location ID not configured — reconnect Square');
    }

    // Build line items
    const lineItems = orderRequest.items.map(item => {
      const lineItem: any = {
        catalog_object_id: item.itemId,
        quantity: String(item.quantity),
      };

      if (item.modifiers && item.modifiers.length > 0) {
        lineItem.modifiers = item.modifiers.map(mod => ({
          catalog_object_id: mod.modifierId,
        }));
      }

      if (item.notes) {
        lineItem.note = item.notes;
      }

      return lineItem;
    });

    // Build fulfillment with caller info
    const fulfillment: any = {
      type: orderRequest.orderType === 'delivery' ? 'DELIVERY' : 'PICKUP',
      state: 'PROPOSED',
    };

    if (orderRequest.orderType !== 'delivery') {
      fulfillment.pickup_details = {
        recipient: {
          display_name: orderRequest.callerName || 'Phone Order',
          phone_number: orderRequest.callerPhone,
        },
        note: orderRequest.orderNotes,
      };
    } else {
      fulfillment.delivery_details = {
        recipient: {
          display_name: orderRequest.callerName || 'Phone Order',
          phone_number: orderRequest.callerPhone,
        },
        note: orderRequest.orderNotes,
      };
    }

    const orderPayload = {
      idempotency_key: randomUUID(),
      order: {
        location_id: business.squareLocationId,
        reference_id: `sba-${businessId}-${Date.now()}`,
        line_items: lineItems,
        fulfillments: [fulfillment],
        metadata: {
          source: 'smallbizagent',
          caller_phone: orderRequest.callerPhone || '',
          caller_name: orderRequest.callerName || '',
        },
      },
    };

    const result = await squareApiRequest(businessId, '/v2/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload),
    });

    const orderId = result.order?.id;
    const orderTotal = result.order?.total_money?.amount || 0;

    // Log the successful order
    await storage.createSquareOrderLog({
      businessId,
      squareOrderId: orderId,
      callerPhone: orderRequest.callerPhone || null,
      callerName: orderRequest.callerName || null,
      items: orderRequest.items as any,
      totalAmount: orderTotal,
      status: 'created',
      vapiCallId: orderRequest.vapiCallId || null,
      orderType: orderRequest.orderType || null,
      errorMessage: null,
    });

    console.log(`Order created successfully in Square: ${orderId}, total: ${formatPrice(orderTotal)}`);

    return {
      success: true,
      orderId,
      orderTotal,
    };

  } catch (error: any) {
    console.error(`Failed to create Square order for business ${businessId}:`, error);

    // Log the failed order
    await storage.createSquareOrderLog({
      businessId,
      squareOrderId: null,
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
 * Check if a business has Square connected and return status info
 */
export async function getSquareStatus(businessId: number): Promise<{
  connected: boolean;
  merchantId?: string;
  locationId?: string;
  environment?: string;
  lastMenuSync?: string;
  menuItemCount?: number;
}> {
  const business = await storage.getBusiness(businessId);
  if (!business?.squareMerchantId || !business?.squareAccessToken) {
    return { connected: false };
  }

  const cache = await storage.getSquareMenuCache(businessId);
  const menu = cache?.menuData as unknown as CachedMenu | null;

  return {
    connected: true,
    merchantId: business.squareMerchantId,
    locationId: business.squareLocationId || undefined,
    environment: business.squareEnvironment || 'sandbox',
    lastMenuSync: cache?.lastSyncedAt?.toISOString(),
    menuItemCount: menu?.categories?.reduce((sum, cat) => sum + cat.items.length, 0) || 0,
  };
}

/**
 * Disconnect a business from Square
 */
export async function disconnectSquare(businessId: number): Promise<void> {
  await storage.clearBusinessSquareConnection(businessId);
  console.log(`Square disconnected for business ${businessId}`);
}
