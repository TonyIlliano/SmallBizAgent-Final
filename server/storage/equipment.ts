/**
 * Customer Equipment Storage (Step 3 of HVAC roadmap)
 *
 * All operations are TENANT-SCOPED — every public function takes businessId
 * and ANDs it into the WHERE clause as a second layer of protection beyond
 * the route-level ownership check. This matches the pattern used for the
 * delete methods elsewhere in the codebase (see audit notes in claude.md).
 *
 * The Industry Capability Matrix gates whether this table is surfaced in
 * the UI per business, but the storage layer is industry-agnostic — a
 * barbershop with zero equipment rows just gets an empty array.
 */

import {
  CustomerEquipment,
  InsertCustomerEquipment,
  customerEquipment,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";

// ──────────────────────────────────────────────────────────────────────
// Reads
// ──────────────────────────────────────────────────────────────────────

/**
 * All equipment for a customer, scoped to a business. Active rows first,
 * inactive rows last (so retired equipment stays visible for history but
 * doesn't crowd the UI). Newest equipment first within each group.
 */
export async function getCustomerEquipment(
  customerId: number,
  businessId: number,
  params?: { includeInactive?: boolean },
): Promise<CustomerEquipment[]> {
  const conditions = [
    eq(customerEquipment.businessId, businessId),
    eq(customerEquipment.customerId, customerId),
  ];
  if (!params?.includeInactive) {
    conditions.push(eq(customerEquipment.active, true));
  }
  return db
    .select()
    .from(customerEquipment)
    .where(and(...conditions))
    // Active rows always before inactive; within each group, newest first
    .orderBy(desc(customerEquipment.active), desc(customerEquipment.createdAt))
    .limit(100);
}

/**
 * Single equipment row, tenant-scoped. Returns undefined when the row
 * doesn't exist OR belongs to a different business — the caller can't
 * tell the difference, which is the correct behavior for tenant isolation
 * (don't leak "this exists but isn't yours" vs "doesn't exist").
 */
export async function getCustomerEquipmentById(
  id: number,
  businessId: number,
): Promise<CustomerEquipment | undefined> {
  const [row] = await db
    .select()
    .from(customerEquipment)
    .where(
      and(
        eq(customerEquipment.id, id),
        eq(customerEquipment.businessId, businessId),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Equipment for a business. Used by admin reports + predictive-maintenance
 * batch scans (later in the roadmap). Capped to defend against unbounded
 * reads.
 */
export async function getCustomerEquipmentByBusiness(
  businessId: number,
  params?: { limit?: number; activeOnly?: boolean },
): Promise<CustomerEquipment[]> {
  const conditions = [eq(customerEquipment.businessId, businessId)];
  if (params?.activeOnly ?? true) {
    conditions.push(eq(customerEquipment.active, true));
  }
  return db
    .select()
    .from(customerEquipment)
    .where(and(...conditions))
    .orderBy(desc(customerEquipment.createdAt))
    .limit(params?.limit ?? 500);
}

// ──────────────────────────────────────────────────────────────────────
// Writes
// ──────────────────────────────────────────────────────────────────────

/**
 * Create a new equipment row. Caller MUST set businessId on the insert
 * payload — defense-in-depth, even though the route enforces it too.
 */
export async function createCustomerEquipment(
  payload: InsertCustomerEquipment,
): Promise<CustomerEquipment> {
  const [row] = await db
    .insert(customerEquipment)
    .values(payload)
    .returning();
  return row;
}

/**
 * Update an equipment row, tenant-scoped via the businessId param. Any
 * field in InsertCustomerEquipment may be patched. updatedAt is bumped
 * automatically.
 *
 * Returns the updated row, or undefined if the row doesn't exist or
 * belongs to a different business (tenant-isolation pattern again).
 */
export async function updateCustomerEquipment(
  id: number,
  businessId: number,
  patch: Partial<Omit<InsertCustomerEquipment, "id" | "businessId" | "customerId" | "createdAt">>,
): Promise<CustomerEquipment | undefined> {
  const [row] = await db
    .update(customerEquipment)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(customerEquipment.id, id),
        eq(customerEquipment.businessId, businessId),
      ),
    )
    .returning();
  return row;
}

/**
 * Hard delete. Soft-delete is available via `updateCustomerEquipment(id,
 * businessId, { active: false })` and is preferred for retiring equipment
 * while keeping history. Hard delete is for owner-initiated "remove
 * mistakes" only.
 */
export async function deleteCustomerEquipment(
  id: number,
  businessId: number,
): Promise<boolean> {
  const result = await db
    .delete(customerEquipment)
    .where(
      and(
        eq(customerEquipment.id, id),
        eq(customerEquipment.businessId, businessId),
      ),
    )
    .returning({ id: customerEquipment.id });
  return result.length > 0;
}
