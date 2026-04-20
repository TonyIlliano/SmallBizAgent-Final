import {
  Customer, InsertCustomer, customers,
  CustomerInsightsRow, InsertCustomerInsights, customerInsights,
} from "@shared/schema";
import { eq, and, or, desc, gte, isNull, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { normalizePhone } from "./index";

// =================== Customers ===================

export async function getCustomers(businessId: number, params?: { limit?: number; offset?: number }): Promise<Customer[]> {
  const query = db.select().from(customers)
    .where(and(eq(customers.businessId, businessId), isNull(customers.deletedAt)))
    .orderBy(desc(customers.createdAt))
    .limit(params?.limit ?? 500);
  if (params?.offset) {
    return query.offset(params.offset);
  }
  return query;
}

export async function getArchivedCustomers(businessId: number): Promise<Customer[]> {
  return db.select().from(customers)
    .where(and(
      eq(customers.businessId, businessId),
      isNull(customers.deletedAt),
      eq(customers.isArchived, true)
    ))
    .limit(500);
}

export async function getCustomer(id: number): Promise<Customer | undefined> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  return customer;
}

export async function getCustomersByIds(ids: number[]): Promise<Customer[]> {
  if (ids.length === 0) return [];
  return db.select().from(customers).where(inArray(customers.id, ids));
}

export async function getCustomerByPhone(phone: string, businessId: number): Promise<Customer | undefined> {
  // First try exact match
  const [exact] = await db.select().from(customers)
    .where(and(
      eq(customers.phone, phone),
      eq(customers.businessId, businessId)
    ));
  if (exact) return exact;

  // Normalize and try common formats
  const digits = normalizePhone(phone);
  if (digits.length < 10) return undefined;

  const formats = [
    digits,                                                          // 5551234567
    `+1${digits}`,                                                   // +15551234567
    `1${digits}`,                                                    // 15551234567
    `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`, // (555) 123-4567
    `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`,  // 555-123-4567
  ];

  const [normalized] = await db.select().from(customers)
    .where(and(
      or(...formats.map(f => eq(customers.phone, f))),
      eq(customers.businessId, businessId)
    ));
  return normalized;
}

export async function createCustomer(customer: InsertCustomer): Promise<Customer> {
  const [newCustomer] = await db.insert(customers).values({
    ...customer,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newCustomer;
}

export async function updateCustomer(id: number, customer: Partial<Customer>): Promise<Customer> {
  const [updatedCustomer] = await db.update(customers)
    .set({
      ...customer,
      updatedAt: new Date()
    })
    .where(eq(customers.id, id))
    .returning();
  return updatedCustomer;
}

export async function deleteCustomer(id: number, businessId: number): Promise<void> {
  // Soft delete: set deletedAt instead of removing the row
  await db.update(customers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)));
}

export async function archiveCustomer(id: number, businessId: number): Promise<Customer> {
  const [updated] = await db.update(customers)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))
    .returning();
  return updated;
}

export async function restoreCustomer(id: number, businessId: number): Promise<Customer> {
  const [updated] = await db.update(customers)
    .set({ isArchived: false, deletedAt: null, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))
    .returning();
  return updated;
}

// =================== Customer Insights ===================

export async function getCustomerInsights(customerId: number, businessId: number): Promise<CustomerInsightsRow | undefined> {
  const [result] = await db.select().from(customerInsights)
    .where(and(
      eq(customerInsights.customerId, customerId),
      eq(customerInsights.businessId, businessId)
    ));
  return result;
}

export async function getCustomerInsightsByBusiness(businessId: number, params?: {
  riskLevel?: string; minLifetimeValue?: number; limit?: number;
}): Promise<CustomerInsightsRow[]> {
  const conditions: any[] = [eq(customerInsights.businessId, businessId)];
  if (params?.riskLevel) conditions.push(eq(customerInsights.riskLevel, params.riskLevel));
  if (params?.minLifetimeValue) conditions.push(gte(customerInsights.lifetimeValue, params.minLifetimeValue));

  return db.select().from(customerInsights)
    .where(and(...conditions))
    .orderBy(desc(customerInsights.lifetimeValue))
    .limit(params?.limit ?? 100);
}

export async function upsertCustomerInsights(customerId: number, businessId: number, data: Partial<CustomerInsightsRow>): Promise<CustomerInsightsRow> {
  // Use a transaction to prevent race conditions on concurrent inserts
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(customerInsights)
      .where(and(
        eq(customerInsights.customerId, customerId),
        eq(customerInsights.businessId, businessId),
      ));
    if (existing) {
      const [result] = await tx.update(customerInsights)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(customerInsights.id, existing.id))
        .returning();
      return result;
    }
    const [result] = await tx.insert(customerInsights)
      .values({ customerId, businessId, ...data } as InsertCustomerInsights)
      .returning();
    return result;
  });
}

export async function getHighRiskCustomers(businessId: number): Promise<CustomerInsightsRow[]> {
  return db.select().from(customerInsights)
    .where(and(
      eq(customerInsights.businessId, businessId),
      eq(customerInsights.riskLevel, 'high')
    ))
    .orderBy(desc(customerInsights.churnProbability))
    .limit(50);
}
