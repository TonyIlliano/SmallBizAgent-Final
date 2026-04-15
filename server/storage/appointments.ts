import {
  Appointment, InsertAppointment, appointments,
  customers,
} from "@shared/schema";
import { eq, and, or, desc, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";

// =================== Appointments ===================

export async function getAppointments(businessId: number, params?: {
  startDate?: Date,
  endDate?: Date,
  customerId?: number,
  staffId?: number
}): Promise<Appointment[]> {
  // Build conditions array
  const conditions = [eq(appointments.businessId, businessId)];

  if (params?.customerId) {
    conditions.push(eq(appointments.customerId, params.customerId));
  }

  if (params?.staffId) {
    conditions.push(eq(appointments.staffId, params.staffId));
  }

  // Filter by date range - compare just the date portion
  if (params?.startDate) {
    // Get start of day for the filter date
    const startOfDay = new Date(params.startDate);
    startOfDay.setHours(0, 0, 0, 0);
    conditions.push(gte(appointments.startDate, startOfDay));
  }

  if (params?.endDate) {
    // Get end of day for the filter date
    const endOfDay = new Date(params.endDate);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(appointments.startDate, endOfDay));
  }

  return db.select().from(appointments).where(and(...conditions));
}

export async function getAppointment(id: number): Promise<Appointment | undefined> {
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
  return appointment;
}

export async function getAppointmentByManageToken(token: string): Promise<Appointment | undefined> {
  const [appointment] = await db.select().from(appointments).where(eq(appointments.manageToken, token));
  return appointment;
}

export async function createAppointment(appointment: InsertAppointment): Promise<Appointment> {
  const [newAppointment] = await db.insert(appointments).values({
    ...appointment,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newAppointment;
}

export async function updateAppointment(id: number, appointment: Partial<Appointment>): Promise<Appointment> {
  const [updatedAppointment] = await db.update(appointments)
    .set({
      ...appointment,
      updatedAt: new Date()
    })
    .where(eq(appointments.id, id))
    .returning();
  return updatedAppointment;
}

export async function deleteAppointment(id: number, businessId: number): Promise<void> {
  await db.delete(appointments).where(and(eq(appointments.id, id), eq(appointments.businessId, businessId)));
}

// Helper methods for Vapi integration
export async function getAppointmentsByBusinessId(businessId: number): Promise<Appointment[]> {
  return db.select().from(appointments)
    .where(eq(appointments.businessId, businessId))
    .limit(1000);
}

export async function getUpcomingAppointmentsByBusinessId(businessId: number, limit: number = 100): Promise<Appointment[]> {
  const now = new Date();
  return db.select().from(appointments)
    .where(and(
      eq(appointments.businessId, businessId),
      gte(appointments.startDate, now)
    ))
    .orderBy(appointments.startDate)
    .limit(limit);
}

export async function getAppointmentsByCustomerId(customerId: number, limit: number = 50): Promise<Appointment[]> {
  return db.select().from(appointments)
    .where(eq(appointments.customerId, customerId))
    .orderBy(desc(appointments.startDate))
    .limit(limit);
}

export async function getAppointmentsByCustomerContact(email: string, phone: string): Promise<Appointment[]> {
  if (!email && !phone) return [];

  // Find all customers matching email OR phone
  const conditions = [];
  if (email) conditions.push(eq(customers.email, email));
  if (phone) conditions.push(eq(customers.phone, phone));

  const matchingCustomers = await db.select().from(customers)
    .where(conditions.length > 1 ? or(...conditions) : conditions[0]);

  if (matchingCustomers.length === 0) return [];

  const customerIds = matchingCustomers.map(c => c.id);
  return db.select().from(appointments)
    .where(
      sql`${appointments.customerId} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`
    )
    .orderBy(desc(appointments.startDate))
    .limit(50);
}
