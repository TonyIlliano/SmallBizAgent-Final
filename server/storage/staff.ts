import {
  Staff, InsertStaff, staff,
  StaffHours, InsertStaffHours, staffHours,
  staffServices,
  StaffInvite, InsertStaffInvite, staffInvites,
  StaffTimeOff, InsertStaffTimeOff, staffTimeOff,
  appointments,
} from "@shared/schema";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { db } from "../db";

// =================== Staff ===================

export async function getStaff(businessId: number): Promise<Staff[]> {
  return db.select().from(staff)
    .where(eq(staff.businessId, businessId));
}

export async function getStaffMember(id: number): Promise<Staff | undefined> {
  const [staffMember] = await db.select().from(staff).where(eq(staff.id, id));
  return staffMember;
}

export async function getStaffMemberByUserId(userId: number): Promise<Staff | undefined> {
  const [staffMember] = await db.select().from(staff).where(eq(staff.userId, userId));
  return staffMember;
}

export async function createStaffMember(staffMember: InsertStaff): Promise<Staff> {
  const [newStaff] = await db.insert(staff).values({
    ...staffMember,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newStaff;
}

export async function updateStaffMember(id: number, staffMember: Partial<Staff>): Promise<Staff> {
  const [updatedStaff] = await db.update(staff)
    .set({
      ...staffMember,
      updatedAt: new Date()
    })
    .where(eq(staff.id, id))
    .returning();
  return updatedStaff;
}

export async function deleteStaffMember(id: number): Promise<void> {
  await db.delete(staff).where(eq(staff.id, id));
}

// =================== Staff Invites ===================

export async function createStaffInvite(invite: InsertStaffInvite): Promise<StaffInvite> {
  const [newInvite] = await db.insert(staffInvites).values({
    ...invite,
    createdAt: new Date(),
  }).returning();
  return newInvite;
}

export async function getStaffInviteByCode(code: string): Promise<StaffInvite | undefined> {
  const [invite] = await db.select().from(staffInvites).where(eq(staffInvites.inviteCode, code));
  return invite;
}

export async function getStaffInvitesByBusiness(businessId: number): Promise<StaffInvite[]> {
  return db.select().from(staffInvites)
    .where(eq(staffInvites.businessId, businessId))
    .orderBy(desc(staffInvites.createdAt));
}

export async function updateStaffInvite(id: number, data: Partial<StaffInvite>): Promise<StaffInvite> {
  const [updated] = await db.update(staffInvites)
    .set(data)
    .where(eq(staffInvites.id, id))
    .returning();
  return updated;
}

// =================== Staff Hours ===================

export async function getStaffHours(staffId: number): Promise<StaffHours[]> {
  return db.select().from(staffHours).where(eq(staffHours.staffId, staffId));
}

export async function getStaffHoursByDay(staffId: number, day: string): Promise<StaffHours | undefined> {
  const [hours] = await db.select().from(staffHours)
    .where(and(eq(staffHours.staffId, staffId), eq(staffHours.day, day.toLowerCase())));
  return hours;
}

export async function setStaffHours(staffId: number, hours: InsertStaffHours[]): Promise<StaffHours[]> {
  // Delete existing hours for this staff member
  await db.delete(staffHours).where(eq(staffHours.staffId, staffId));

  // Insert new hours
  if (hours.length === 0) return [];

  const newHours = await db.insert(staffHours)
    .values(hours.map(h => ({ ...h, staffId })))
    .returning();
  return newHours;
}

export async function updateStaffHoursForDay(staffId: number, day: string, hours: Partial<StaffHours>): Promise<StaffHours> {
  // Check if hours exist for this day
  const existing = await getStaffHoursByDay(staffId, day);

  if (existing) {
    const [updated] = await db.update(staffHours)
      .set(hours)
      .where(and(eq(staffHours.staffId, staffId), eq(staffHours.day, day.toLowerCase())))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(staffHours)
      .values({ staffId, day: day.toLowerCase(), ...hours })
      .returning();
    return created;
  }
}

export async function getAvailableStaffForSlot(businessId: number, date: Date, time: string): Promise<Staff[]> {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const timeMinutes = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]);

  // Get all active staff for this business
  const allStaff = await getStaff(businessId);
  const activeStaff = allStaff.filter(s => s.active);

  const availableStaff: Staff[] = [];

  for (const staffMember of activeStaff) {
    // Get this staff member's hours for the day
    const dayHours = await getStaffHoursByDay(staffMember.id, dayName);

    // If no hours set, assume they follow business hours (available)
    // If hours are set and it's their day off, skip
    if (dayHours?.isOff) continue;

    // Check if staff has time off on this date (vacation, sick, etc.)
    const timeOffEntries = await getStaffTimeOffForDate(staffMember.id, date);
    if (timeOffEntries.some(t => t.allDay !== false)) continue; // Full-day time off

    // If they have hours set, check if the time falls within their working hours
    if (dayHours?.startTime && dayHours?.endTime) {
      const startMinutes = parseInt(dayHours.startTime.split(':')[0]) * 60 + parseInt(dayHours.startTime.split(':')[1]);
      const endMinutes = parseInt(dayHours.endTime.split(':')[0]) * 60 + parseInt(dayHours.endTime.split(':')[1]);

      if (timeMinutes < startMinutes || timeMinutes >= endMinutes) {
        continue; // Outside their working hours
      }
    }

    // Check if they have an appointment at this time
    const appts = await db.select().from(appointments).where(and(
      eq(appointments.businessId, businessId),
      eq(appointments.staffId, staffMember.id)
    ));
    const hasConflict = appts.some(apt => {
      if (apt.status === 'cancelled') return false;
      const aptDate = new Date(apt.startDate);
      if (aptDate.toDateString() !== date.toDateString()) return false;

      const aptStart = aptDate.getHours() * 60 + aptDate.getMinutes();
      const aptEnd = new Date(apt.endDate).getHours() * 60 + new Date(apt.endDate).getMinutes();

      return timeMinutes >= aptStart && timeMinutes < aptEnd;
    });

    if (!hasConflict) {
      availableStaff.push(staffMember);
    }
  }

  return availableStaff;
}

// =================== Staff-Service Assignments ===================

export async function getStaffServices(staffId: number): Promise<number[]> {
  const results = await db.select().from(staffServices).where(eq(staffServices.staffId, staffId));
  return results.map(r => r.serviceId);
}

export async function getServiceStaff(serviceId: number): Promise<number[]> {
  const results = await db.select().from(staffServices).where(eq(staffServices.serviceId, serviceId));
  return results.map(r => r.staffId);
}

export async function setStaffServices(staffId: number, serviceIds: number[]): Promise<void> {
  // Delete existing assignments
  await db.delete(staffServices).where(eq(staffServices.staffId, staffId));
  // Insert new assignments
  if (serviceIds.length > 0) {
    await db.insert(staffServices).values(
      serviceIds.map(serviceId => ({ staffId, serviceId }))
    );
  }
}

export async function getStaffServicesForBusiness(businessId: number): Promise<{ staffId: number; serviceId: number }[]> {
  // Get all staff for business, then get their service assignments
  const businessStaff = await getStaff(businessId);
  const staffIds = businessStaff.map(s => s.id);
  if (staffIds.length === 0) return [];

  const results = await db.select().from(staffServices)
    .where(inArray(staffServices.staffId, staffIds));
  return results.map(r => ({ staffId: r.staffId, serviceId: r.serviceId }));
}

// =================== Staff Time Off ===================

export async function getStaffTimeOff(staffId: number): Promise<StaffTimeOff[]> {
  return db.select().from(staffTimeOff)
    .where(eq(staffTimeOff.staffId, staffId))
    .orderBy(staffTimeOff.startDate);
}

export async function getStaffTimeOffByBusiness(businessId: number): Promise<StaffTimeOff[]> {
  return db.select().from(staffTimeOff)
    .where(eq(staffTimeOff.businessId, businessId))
    .orderBy(staffTimeOff.startDate);
}

export async function getStaffTimeOffForDate(staffId: number, date: Date): Promise<StaffTimeOff[]> {
  // Find any time-off entries that overlap with the given date
  // A time-off entry overlaps if: startDate <= endOfDay AND endDate >= startOfDay
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return db.select().from(staffTimeOff)
    .where(and(
      eq(staffTimeOff.staffId, staffId),
      lte(staffTimeOff.startDate, endOfDay),
      gte(staffTimeOff.endDate, startOfDay)
    ));
}

export async function createStaffTimeOff(timeOffData: InsertStaffTimeOff): Promise<StaffTimeOff> {
  const [entry] = await db.insert(staffTimeOff).values({
    ...timeOffData,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return entry;
}

export async function updateStaffTimeOff(id: number, businessId: number, data: Partial<StaffTimeOff>): Promise<StaffTimeOff> {
  const [updated] = await db.update(staffTimeOff)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(staffTimeOff.id, id), eq(staffTimeOff.businessId, businessId)))
    .returning();
  return updated;
}

export async function deleteStaffTimeOff(id: number, businessId: number): Promise<void> {
  await db.delete(staffTimeOff)
    .where(and(eq(staffTimeOff.id, id), eq(staffTimeOff.businessId, businessId)));
}
