/**
 * Inventory Sync & Low-Stock Alert Service
 *
 * Restaurant-only feature: syncs inventory from Clover/Square POS,
 * monitors stock levels, and sends the business owner SMS/email
 * alerts when items drop below configured thresholds.
 *
 * Key flows:
 * 1. Manual/scheduled sync — pulls stock levels from POS API
 * 2. Webhook-triggered — Clover/Square pushes inventory updates
 * 3. Alert engine — checks thresholds, notifies owner (with 24-hr cooldown)
 */

import { db } from "../db";
import { pool } from "../db";
import { inventoryItems, businesses } from "@shared/schema";
import { eq, and, lt, sql, isNull, or } from "drizzle-orm";
import { storage } from "../storage";
import { sendSms } from "./twilioService";

// Alert cooldown: don't spam the owner about the same item
const ALERT_COOLDOWN_HOURS = 24;

// ============================================
// Clover Inventory Sync
// ============================================

interface CloverItemStock {
  id: string;
  name: string;
  sku?: string;
  price?: number;
  hidden?: boolean;
  available?: boolean;
  itemStock?: {
    quantity: number;
    modifiedTime?: number;
  };
  categories?: {
    elements: Array<{ id: string; name: string }>;
  };
}

/**
 * Sync inventory from Clover POS for a business.
 * Uses the /v3/merchants/{mId}/items?expand=itemStock endpoint
 * to pull items with their current stock levels.
 */
export async function syncCloverInventory(businessId: number): Promise<{
  synced: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const business = await storage.getBusiness(businessId);
  if (!business?.cloverMerchantId || !business?.cloverAccessToken) {
    throw new Error("Business is not connected to Clover");
  }

  // Import clover service for authenticated requests
  const { getValidCloverToken } = await import("./cloverService");
  const token = await getValidCloverToken(businessId);

  const env = business.cloverEnvironment || "production";
  const baseUrl =
    env === "sandbox"
      ? "https://apisandbox.dev.clover.com"
      : "https://api.clover.com";

  let synced = 0;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  let offset = 0;
  const limit = 100;

  // Paginate through all items
  while (true) {
    try {
      const url = `${baseUrl}/v3/merchants/${business.cloverMerchantId}/items?expand=itemStock,categories&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get("retry-after") || "3"
        );
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfter * 1000)
        );
        continue; // Retry same page
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Clover API ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const items: CloverItemStock[] = data.elements || [];

      if (items.length === 0) break;

      for (const item of items) {
        try {
          // Skip hidden items
          if (item.hidden) continue;

          const stockQty = item.itemStock?.quantity ?? 0;
          const category =
            item.categories?.elements?.[0]?.name || null;

          // Upsert: insert or update
          const existing = await db
            .select()
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.businessId, businessId),
                eq(inventoryItems.posItemId, item.id),
                eq(inventoryItems.posSource, "clover")
              )
            );

          if (existing.length > 0) {
            await db
              .update(inventoryItems)
              .set({
                name: item.name,
                sku: item.sku || null,
                category,
                quantity: stockQty,
                price: item.price || null,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(inventoryItems.id, existing[0].id));
            updated++;
          } else {
            await db.insert(inventoryItems).values({
              businessId,
              posItemId: item.id,
              posSource: "clover",
              name: item.name,
              sku: item.sku || null,
              category,
              quantity: stockQty,
              lowStockThreshold:
                business.inventoryDefaultThreshold ?? 10,
              price: item.price || null,
              trackStock: true,
              lastSyncedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            created++;
          }
          synced++;
        } catch (err: any) {
          errors.push(`Item ${item.name}: ${err.message}`);
        }
      }

      // Check if there are more pages
      if (items.length < limit) break;
      offset += limit;
    } catch (err: any) {
      errors.push(`Pagination error at offset ${offset}: ${err.message}`);
      break;
    }
  }

  console.log(
    `[Inventory] Clover sync for business ${businessId}: ${synced} items (${created} new, ${updated} updated)`
  );

  return { synced, created, updated, errors };
}

// ============================================
// Square Inventory Sync
// ============================================

/**
 * Sync inventory from Square POS for a business.
 * Uses the /v2/inventory/counts/batch-retrieve endpoint
 * to pull current stock levels, combined with catalog items.
 */
export async function syncSquareInventory(businessId: number): Promise<{
  synced: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const business = await storage.getBusiness(businessId);
  if (!business?.squareAccessToken || !business?.squareLocationId) {
    throw new Error("Business is not connected to Square");
  }

  const { getValidSquareToken } = await import("./squareService");
  const token = await getValidSquareToken(businessId);

  const env = business.squareEnvironment || "production";
  const baseUrl =
    env === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";

  let synced = 0;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  try {
    // Step 1: Get catalog items
    let cursor: string | null = null;
    const catalogItems: any[] = [];

    do {
      const catalogUrl: string = `${baseUrl}/v2/catalog/list?types=ITEM${cursor ? `&cursor=${cursor}` : ""}`;
      const catalogResponse: Response = await fetch(catalogUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Square-Version": "2026-01-22",
        },
      });

      if (!catalogResponse.ok) {
        throw new Error(
          `Square catalog API ${catalogResponse.status}: ${await catalogResponse.text()}`
        );
      }

      const catalogData: any = await catalogResponse.json();
      if (catalogData.objects) {
        catalogItems.push(...catalogData.objects);
      }
      cursor = catalogData.cursor || null;
    } while (cursor);

    // Step 2: Get inventory counts for all items
    const catalogItemIds = catalogItems
      .flatMap((item: any) =>
        (item.item_data?.variations || []).map((v: any) => v.id)
      )
      .filter(Boolean);

    // Batch retrieve inventory counts (max 100 per request)
    const inventoryCounts: Record<string, number> = {};

    for (let i = 0; i < catalogItemIds.length; i += 100) {
      const batch = catalogItemIds.slice(i, i + 100);
      const countResponse = await fetch(
        `${baseUrl}/v2/inventory/counts/batch-retrieve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Square-Version": "2026-01-22",
          },
          body: JSON.stringify({
            catalog_object_ids: batch,
            location_ids: [business.squareLocationId],
          }),
        }
      );

      if (countResponse.ok) {
        const countData = await countResponse.json();
        for (const count of countData.counts || []) {
          if (count.state === "IN_STOCK") {
            inventoryCounts[count.catalog_object_id] = parseFloat(
              count.quantity || "0"
            );
          }
        }
      }
    }

    // Step 3: Upsert items
    for (const item of catalogItems) {
      try {
        const itemData = item.item_data;
        if (!itemData) continue;

        // Use the first variation for stock tracking
        const firstVariation = itemData.variations?.[0];
        if (!firstVariation) continue;

        const variationId = firstVariation.id;
        const stockQty = inventoryCounts[variationId] ?? 0;
        const price =
          firstVariation.item_variation_data?.price_money?.amount ?? null;
        const category = itemData.category_id || null;

        const existing = await db
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.businessId, businessId),
              eq(inventoryItems.posItemId, item.id),
              eq(inventoryItems.posSource, "square")
            )
          );

        if (existing.length > 0) {
          await db
            .update(inventoryItems)
            .set({
              name: itemData.name,
              category,
              quantity: stockQty,
              price,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.id, existing[0].id));
          updated++;
        } else {
          await db.insert(inventoryItems).values({
            businessId,
            posItemId: item.id,
            posSource: "square",
            name: itemData.name,
            category,
            quantity: stockQty,
            lowStockThreshold:
              business.inventoryDefaultThreshold ?? 10,
            price,
            trackStock: true,
            lastSyncedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          created++;
        }
        synced++;
      } catch (err: any) {
        errors.push(`Item ${item.item_data?.name}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Square sync error: ${err.message}`);
  }

  console.log(
    `[Inventory] Square sync for business ${businessId}: ${synced} items (${created} new, ${updated} updated)`
  );

  return { synced, created, updated, errors };
}

// ============================================
// Unified Sync (auto-detect POS)
// ============================================

/**
 * Sync inventory for a business — automatically detects Clover vs Square
 */
export async function syncInventory(businessId: number) {
  const business = await storage.getBusiness(businessId);
  if (!business) throw new Error("Business not found");

  // Must be a restaurant with POS connected
  const isRestaurant = business.industry?.toLowerCase() === "restaurant" || business.type === "restaurant";
  if (!isRestaurant) {
    throw new Error("Inventory tracking is only available for restaurants");
  }

  let result;
  if (business.cloverMerchantId && business.cloverAccessToken) {
    result = await syncCloverInventory(businessId);
  } else if (business.squareAccessToken && business.squareLocationId) {
    result = await syncSquareInventory(businessId);
  } else {
    throw new Error("No POS system connected (Clover or Square required)");
  }

  // After sync, check for low-stock items and send alerts
  if (business.inventoryAlertsEnabled) {
    await checkAndSendLowStockAlerts(businessId);
  }

  return result;
}

// ============================================
// Low-Stock Alert Engine
// ============================================

interface LowStockItem {
  id: number;
  name: string;
  category: string | null;
  quantity: number;
  threshold: number;
}

/**
 * Check all tracked items for a business and send alerts for any
 * that are below their threshold. Respects a 24-hour cooldown
 * per item to avoid spamming the owner.
 */
export async function checkAndSendLowStockAlerts(
  businessId: number
): Promise<{
  alertsSent: number;
  lowStockItems: LowStockItem[];
}> {
  const business = await storage.getBusiness(businessId);
  if (!business) throw new Error("Business not found");

  if (!business.inventoryAlertsEnabled) {
    return { alertsSent: 0, lowStockItems: [] };
  }

  // Find items where quantity < threshold and tracking is enabled
  // Also check alert cooldown (24 hours)
  const cooldownTime = new Date();
  cooldownTime.setHours(cooldownTime.getHours() - ALERT_COOLDOWN_HOURS);

  const lowItems = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.businessId, businessId),
        eq(inventoryItems.trackStock, true),
        sql`${inventoryItems.quantity} < ${inventoryItems.lowStockThreshold}`,
        or(
          isNull(inventoryItems.lastAlertSentAt),
          sql`${inventoryItems.lastAlertSentAt} < ${cooldownTime.toISOString()}`
        )
      )
    );

  if (lowItems.length === 0) {
    return { alertsSent: 0, lowStockItems: [] };
  }

  const lowStockItems: LowStockItem[] = lowItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: item.quantity ?? 0,
    threshold: item.lowStockThreshold ?? 10,
  }));

  // Build alert message
  const itemList = lowStockItems
    .map(
      (item) =>
        `• ${item.name}${item.category ? ` (${item.category})` : ""}: ${item.quantity} left (threshold: ${item.threshold})`
    )
    .join("\n");

  const alertMessage = `⚠️ Low Stock Alert — ${business.name}\n\n${lowStockItems.length} item${lowStockItems.length > 1 ? "s" : ""} below threshold:\n\n${itemList}\n\nLog in to manage inventory settings.`;

  const channel = business.inventoryAlertChannel || "both";
  let alertsSent = 0;

  // Send SMS to owner
  if (
    (channel === "sms" || channel === "both") &&
    business.phone &&
    business.twilioPhoneNumber
  ) {
    try {
      await sendSms(business.phone, alertMessage, business.twilioPhoneNumber);
      alertsSent++;
      console.log(
        `[Inventory] Sent low-stock SMS alert to ${business.phone} for business ${businessId}`
      );
    } catch (err: any) {
      console.error(
        `[Inventory] Failed to send SMS alert: ${err.message}`
      );
    }
  }

  // Send email to owner
  if (
    (channel === "email" || channel === "both") &&
    business.email
  ) {
    try {
      // Use pool.query to log the notification (email service integration)
      await pool.query(
        `INSERT INTO notification_log (business_id, type, channel, recipient, subject, message, status, sent_at)
         VALUES ($1, 'inventory_alert', 'email', $2, $3, $4, 'sent', NOW())`,
        [
          businessId,
          business.email,
          `⚠️ Low Stock Alert — ${lowStockItems.length} items need restock`,
          alertMessage,
        ]
      );
      // TODO: Integrate with email service (SendGrid/SES) for actual email delivery
      console.log(
        `[Inventory] Logged low-stock email alert to ${business.email} for business ${businessId}`
      );
      alertsSent++;
    } catch (err: any) {
      console.error(
        `[Inventory] Failed to log email alert: ${err.message}`
      );
    }
  }

  // Update last_alert_sent_at for all alerted items
  if (alertsSent > 0) {
    const itemIds = lowStockItems.map((item) => item.id);
    await db
      .update(inventoryItems)
      .set({ lastAlertSentAt: new Date() })
      .where(
        and(
          eq(inventoryItems.businessId, businessId),
          sql`${inventoryItems.id} = ANY(${itemIds})`
        )
      );
  }

  return { alertsSent, lowStockItems };
}

// ============================================
// Clover Inventory Webhook Handler
// ============================================

/**
 * Handle Clover inventory webhook events.
 * When Clover sends an inventory UPDATE event, we fetch the latest
 * stock for the affected item and update our local record.
 */
export async function handleCloverInventoryWebhook(
  merchantId: string,
  itemId: string
): Promise<void> {
  try {
    // Find the business by Clover merchant ID
    const result = await pool.query(
      "SELECT id FROM businesses WHERE clover_merchant_id = $1",
      [merchantId]
    );
    if (result.rows.length === 0) {
      console.log(
        `[Inventory Webhook] No business found for merchant ${merchantId}`
      );
      return;
    }

    const businessId = result.rows[0].id;
    const business = await storage.getBusiness(businessId);
    if (!business?.cloverAccessToken) return;

    // Fetch updated item stock from Clover
    const { getValidCloverToken } = await import("./cloverService");
    const token = await getValidCloverToken(businessId);

    const env = business.cloverEnvironment || "production";
    const baseUrl =
      env === "sandbox"
        ? "https://apisandbox.dev.clover.com"
        : "https://api.clover.com";

    const response = await fetch(
      `${baseUrl}/v3/merchants/${merchantId}/items/${itemId}?expand=itemStock`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error(
        `[Inventory Webhook] Failed to fetch item ${itemId}: ${response.status}`
      );
      return;
    }

    const item = await response.json();
    const stockQty = item.itemStock?.quantity ?? 0;

    // Update local record
    const existing = await db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.businessId, businessId),
          eq(inventoryItems.posItemId, itemId),
          eq(inventoryItems.posSource, "clover")
        )
      );

    if (existing.length > 0) {
      await db
        .update(inventoryItems)
        .set({
          quantity: stockQty,
          name: item.name || existing[0].name,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, existing[0].id));
    } else {
      // New item — insert it
      await db.insert(inventoryItems).values({
        businessId,
        posItemId: itemId,
        posSource: "clover",
        name: item.name || "Unknown Item",
        quantity: stockQty,
        lowStockThreshold:
          business.inventoryDefaultThreshold ?? 10,
        trackStock: true,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Check if this item triggered a low-stock alert
    if (business.inventoryAlertsEnabled) {
      await checkAndSendLowStockAlerts(businessId);
    }

    console.log(
      `[Inventory Webhook] Updated item ${itemId} (qty: ${stockQty}) for business ${businessId}`
    );
  } catch (err: any) {
    console.error(
      `[Inventory Webhook] Error processing webhook: ${err.message}`
    );
  }
}

// ============================================
// CRUD helpers for API routes
// ============================================

/**
 * Get paginated inventory items for a business with server-side filtering/sorting.
 * Returns { items, total, page, pageSize } for the UI to handle pagination.
 */
export async function getInventoryItems(
  businessId: number,
  options?: {
    category?: string;
    lowStockOnly?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: string;
  }
) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  // Build WHERE clauses
  const conditions: string[] = ["business_id = $1"];
  const params: any[] = [businessId];
  let paramIdx = 2;

  if (options?.category) {
    conditions.push(`category = $${paramIdx}`);
    params.push(options.category);
    paramIdx++;
  }

  if (options?.lowStockOnly) {
    conditions.push("track_stock = true AND quantity < low_stock_threshold");
  }

  if (options?.search) {
    conditions.push(`(name ILIKE $${paramIdx} OR sku ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`);
    params.push(`%${options.search}%`);
    paramIdx++;
  }

  const whereClause = conditions.join(" AND ");

  // Sort: low-stock items first by default, then by name
  let orderClause = "ORDER BY ";
  const sortBy = options?.sortBy || "status";
  const sortDir = options?.sortDir === "asc" ? "ASC" : "DESC";

  if (sortBy === "name") {
    orderClause += `name ${sortDir}`;
  } else if (sortBy === "quantity") {
    orderClause += `quantity ${sortDir}`;
  } else if (sortBy === "category") {
    orderClause += `COALESCE(category, 'zzz') ${sortDir}, name ASC`;
  } else {
    // Default: low-stock first (out of stock → low → ok), then name
    orderClause += `CASE
      WHEN track_stock = true AND quantity = 0 THEN 0
      WHEN track_stock = true AND quantity < low_stock_threshold THEN 1
      ELSE 2
    END ASC, name ASC`;
  }

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM inventory_items WHERE ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;

  // Get paginated items
  const itemsResult = await pool.query(
    `SELECT * FROM inventory_items WHERE ${whereClause} ${orderClause} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset]
  );

  return {
    items: itemsResult.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Update an inventory item's threshold or tracking settings
 */
export async function updateInventoryItem(
  itemId: number,
  businessId: number,
  data: {
    lowStockThreshold?: number;
    trackStock?: boolean;
  }
) {
  const [updated] = await db
    .update(inventoryItems)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inventoryItems.id, itemId),
        eq(inventoryItems.businessId, businessId)
      )
    )
    .returning();

  return updated;
}

/**
 * Get inventory stats for dashboard
 */
export async function getInventoryStats(businessId: number) {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS "totalItems",
       COUNT(*) FILTER (WHERE track_stock = true)::int AS "trackedItems",
       COUNT(*) FILTER (WHERE track_stock = true AND quantity < low_stock_threshold)::int AS "lowStockItems",
       COUNT(*) FILTER (WHERE track_stock = true AND quantity = 0)::int AS "outOfStockItems",
       MAX(last_synced_at) AS "lastSyncedAt"
     FROM inventory_items
     WHERE business_id = $1`,
    [businessId]
  );

  return (
    result.rows[0] || {
      totalItems: 0,
      trackedItems: 0,
      lowStockItems: 0,
      outOfStockItems: 0,
      lastSyncedAt: null,
    }
  );
}

/**
 * Get unique categories for filter dropdown
 */
export async function getInventoryCategories(businessId: number): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT category FROM inventory_items
     WHERE business_id = $1 AND category IS NOT NULL
     ORDER BY category`,
    [businessId]
  );
  return result.rows.map((r: any) => r.category);
}

export default {
  syncCloverInventory,
  syncSquareInventory,
  syncInventory,
  checkAndSendLowStockAlerts,
  handleCloverInventoryWebhook,
  getInventoryItems,
  updateInventoryItem,
  getInventoryStats,
  getInventoryCategories,
};
