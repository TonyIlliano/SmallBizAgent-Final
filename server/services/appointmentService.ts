import { storage } from '../storage';
import { appointments, InsertAppointment } from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { createDateInTimezone } from '../utils/timezone';

/**
 * Checks if a time slot is available for booking
 * @param businessId The ID of the business
 * @param startDate The start date and time of the proposed appointment
 * @param endDate The end date and time of the proposed appointment
 * @param staffId The staff member ID (optional)
 * @param serviceId The service ID (optional)
 * @returns Promise resolving to a boolean indicating if the slot is available
 */
export async function isTimeSlotAvailable(
  businessId: number,
  startDate: Date,
  endDate: Date,
  staffId?: number | null,
  serviceId?: number | null
): Promise<boolean> {
  try {
    // Format dates for SQL query
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    
    // Use a simpler approach - check for overlapping appointments directly through storage
    const existingAppointments = await storage.getAppointments(businessId);
    
    // Filter out appointments that would conflict
    const conflictingAppointments = existingAppointments.filter(appointment => {
      // Skip non-scheduled appointments
      if (appointment.status !== 'scheduled') return false;
      
      // Skip appointments with different staff if staff ID is provided
      if (staffId && appointment.staffId !== staffId) return false;
      
      // Check for time overlap
      const appointmentStart = appointment.startDate;
      const appointmentEnd = appointment.endDate;
      
      // Time ranges overlap if start of one is before end of other and end of one is after start of other
      const overlap = startDate < appointmentEnd && endDate > appointmentStart;
      
      return overlap;
    });
    
    // If no conflicts are found, the time slot is available
    return conflictingAppointments.length === 0;
  } catch (error) {
    console.error('Error checking time slot availability:', error);
    // In case of an error, be conservative and assume the slot is not available
    return false;
  }
}

/**
 * Finds available time slots for a given date range and staff member
 * @param businessId The ID of the business
 * @param startDate The start date of the range to search
 * @param endDate The end date of the range to search
 * @param serviceId The service ID (optional)
 * @param staffId The staff member ID (optional)
 * @param durationMinutes The duration of the appointment in minutes (default: 60)
 * @returns Promise resolving to an array of available time slots
 */
export async function findAvailableTimeSlots(
  businessId: number,
  startDate: Date,
  endDate: Date,
  serviceId?: number,
  staffId?: number,
  durationMinutes: number = 60
): Promise<{ date: Date, available: boolean }[]> {
  try {
    // Get business info to determine timezone
    const business = await storage.getBusiness(businessId);
    const tz = business?.timezone || 'America/New_York';

    // Get business hours for the days in the range
    const businessHours = await storage.getBusinessHours(businessId);

    // Get service duration if service ID is provided
    let duration = durationMinutes;
    if (serviceId) {
      const service = await storage.getService(serviceId);
      if (service?.duration) {
        duration = service.duration;
      }
    }

    // Get existing appointments in the date range
    const existingAppointments = await storage.getAppointments(businessId, {
      startDate: startDate,
      endDate: endDate,
      staffId: staffId
    });

    // Generate time slots at 30-minute intervals during business hours
    const timeSlots: { date: Date, available: boolean }[] = [];

    // Determine the start/end dates in the business's timezone for iteration
    // Use Intl to get the local date components in the business timezone
    const localStartParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(startDate);
    const localEndParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(endDate);

    const getPart = (parts: Intl.DateTimeFormatPart[], type: string) =>
      parseInt(parts.find(p => p.type === type)?.value || '0');

    let curYear = getPart(localStartParts, 'year');
    let curMonth = getPart(localStartParts, 'month') - 1; // 0-indexed
    let curDay = getPart(localStartParts, 'day');

    const endYear = getPart(localEndParts, 'year');
    const endMonth = getPart(localEndParts, 'month') - 1;
    const endDay = getPart(localEndParts, 'day');

    // Iterate through each day in the range (in business-local dates)
    while (
      curYear < endYear ||
      (curYear === endYear && curMonth < endMonth) ||
      (curYear === endYear && curMonth === endMonth && curDay <= endDay)
    ) {
      // Get the day of week in the business timezone
      const dayProbe = createDateInTimezone(curYear, curMonth, curDay, 12, 0, tz);
      const dayOfWeek = dayProbe.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz }).toLowerCase();

      // Find business hours for this day
      const hoursForDay = businessHours.find(h => h.day.toLowerCase() === dayOfWeek);

      if (hoursForDay && !hoursForDay.isClosed && hoursForDay.open && hoursForDay.close) {
        // Parse opening and closing hours
        const [openHour, openMinute] = hoursForDay.open.split(':').map(Number);
        const [closeHour, closeMinute] = hoursForDay.close.split(':').map(Number);

        // Create timezone-aware open and close times (these are correct UTC instants)
        const openTime = createDateInTimezone(curYear, curMonth, curDay, openHour, openMinute, tz);
        const closeTime = createDateInTimezone(curYear, curMonth, curDay, closeHour, closeMinute, tz);

        // Generate slots at 30-minute intervals
        let slotStart = new Date(openTime);
        while (slotStart < closeTime) {
          // Calculate end time for this slot
          const slotEndTime = new Date(slotStart.getTime() + duration * 60 * 1000);

          // Only add the slot if it ends before or at closing time
          if (slotEndTime <= closeTime) {
            // Check if this slot is available
            const isAvailable = await isTimeSlotAvailable(
              businessId,
              new Date(slotStart),
              slotEndTime,
              staffId,
              serviceId
            );

            timeSlots.push({
              date: new Date(slotStart),
              available: isAvailable
            });
          }

          // Move to next slot (30-minute increments)
          slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000);
        }
      }

      // Move to the next day
      const nextDay = new Date(curYear, curMonth, curDay + 1);
      curYear = nextDay.getFullYear();
      curMonth = nextDay.getMonth();
      curDay = nextDay.getDate();
    }

    return timeSlots;
  } catch (error) {
    console.error('Error finding available time slots:', error);
    return [];
  }
}

// Active appointment statuses that block a slot (everything except cancelled/completed/no_show)
const BLOCKING_STATUSES = ['scheduled', 'confirmed', 'pending'];

/**
 * Validates and creates a new appointment with double booking prevention.
 *
 * Uses a database transaction with row-level locking (SELECT ... FOR UPDATE)
 * to eliminate the TOCTOU race condition where two concurrent requests could
 * both see a slot as available and both create appointments.
 *
 * @param appointmentData The appointment data to create
 * @returns Promise resolving to object with success status and appointment or error
 */
export async function createAppointmentSafely(appointmentData: InsertAppointment): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    const result = await db.transaction(async (tx) => {
      // Check for conflicting appointments inside the transaction using FOR UPDATE
      // to lock matching rows and prevent concurrent inserts for the same slot.
      // We check all non-cancelled/completed statuses to catch confirmed + pending too.
      const conditions: any[] = [
        eq(appointments.businessId, appointmentData.businessId),
        sql`${appointments.status} IN ('scheduled', 'confirmed', 'pending')`,
        sql`${appointments.startDate} < ${appointmentData.endDate}`,
        sql`${appointments.endDate} > ${appointmentData.startDate}`,
      ];

      if (appointmentData.staffId) {
        conditions.push(eq(appointments.staffId, appointmentData.staffId));
      }

      const conflicting = await tx.select({ id: appointments.id })
        .from(appointments)
        .where(and(...conditions))
        .for('update');

      if (conflicting.length > 0) {
        return {
          success: false as const,
          error: 'This time slot is already booked. Please select another time.',
        };
      }

      // No conflicts — create the appointment within the same transaction
      const [newAppointment] = await tx.insert(appointments).values({
        ...appointmentData,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      return {
        success: true as const,
        appointment: newAppointment,
      };
    });

    return result;
  } catch (error) {
    console.error('Error creating appointment safely:', error);
    return {
      success: false,
      error: 'An error occurred while scheduling the appointment.',
    };
  }
}

/**
 * Safely updates an appointment's time with double booking prevention.
 *
 * Used for reschedules (drag-and-drop, self-service, SMS).
 * Uses a database transaction with row-level locking to prevent race conditions.
 *
 * @param appointmentId The appointment to update
 * @param businessId The business ID (for ownership verification)
 * @param newStartDate New start time
 * @param newEndDate New end time
 * @param staffId Staff member to check conflicts for (optional — uses existing if not provided)
 * @param additionalUpdates Any other fields to update (notes, etc.)
 * @returns Promise resolving to object with success status and updated appointment or error
 */
export async function updateAppointmentSafely(
  appointmentId: number,
  businessId: number,
  newStartDate: Date,
  newEndDate: Date,
  staffId?: number | null,
  additionalUpdates?: Record<string, any>
): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    const result = await db.transaction(async (tx) => {
      // Check for conflicting appointments (excluding the one being updated)
      const conditions: any[] = [
        eq(appointments.businessId, businessId),
        sql`${appointments.status} IN ('scheduled', 'confirmed', 'pending')`,
        sql`${appointments.startDate} < ${newEndDate}`,
        sql`${appointments.endDate} > ${newStartDate}`,
        sql`${appointments.id} != ${appointmentId}`, // Exclude self
      ];

      if (staffId) {
        conditions.push(eq(appointments.staffId, staffId));
      }

      const conflicting = await tx.select({ id: appointments.id })
        .from(appointments)
        .where(and(...conditions))
        .for('update');

      if (conflicting.length > 0) {
        return {
          success: false as const,
          error: 'This time slot is already booked. Please select another time.',
        };
      }

      // No conflicts — update the appointment within the same transaction
      const [updated] = await tx.update(appointments)
        .set({
          startDate: newStartDate,
          endDate: newEndDate,
          updatedAt: new Date(),
          ...(additionalUpdates || {}),
        })
        .where(and(
          eq(appointments.id, appointmentId),
          eq(appointments.businessId, businessId),
        ))
        .returning();

      if (!updated) {
        return {
          success: false as const,
          error: 'Appointment not found.',
        };
      }

      return {
        success: true as const,
        appointment: updated,
      };
    });

    return result;
  } catch (error) {
    console.error('Error updating appointment safely:', error);
    return {
      success: false,
      error: 'An error occurred while rescheduling the appointment.',
    };
  }
}