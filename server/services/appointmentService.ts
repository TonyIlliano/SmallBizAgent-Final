import { storage } from '../storage';
import { appointments, services, staff, InsertAppointment } from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';

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
  staffId?: number,
  serviceId?: number
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
    
    // Create a working copy of the start date
    const currentDate = new Date(startDate);
    
    // Iterate through each day in the range
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      
      // Find business hours for this day
      const hoursForDay = businessHours.find(h => h.day.toLowerCase() === dayOfWeek);
      
      if (hoursForDay && !hoursForDay.isClosed && hoursForDay.open && hoursForDay.close) {
        // Parse opening and closing hours
        const [openHour, openMinute] = hoursForDay.open.split(':').map(Number);
        const [closeHour, closeMinute] = hoursForDay.close.split(':').map(Number);
        
        // Set start time to opening time on this day
        currentDate.setHours(openHour, openMinute, 0, 0);
        
        // Calculate end time (closing time)
        const closeTime = new Date(currentDate);
        closeTime.setHours(closeHour, closeMinute, 0, 0);
        
        // Generate slots at 30-minute intervals
        while (currentDate < closeTime) {
          // Calculate end time for this slot
          const slotEndTime = new Date(currentDate);
          slotEndTime.setMinutes(slotEndTime.getMinutes() + duration);
          
          // Only add the slot if it ends before or at closing time
          if (slotEndTime <= closeTime) {
            // Check if this slot is available
            const isAvailable = await isTimeSlotAvailable(
              businessId,
              new Date(currentDate),
              slotEndTime,
              staffId,
              serviceId
            );
            
            timeSlots.push({
              date: new Date(currentDate),
              available: isAvailable
            });
          }
          
          // Move to next slot (30-minute increments)
          currentDate.setMinutes(currentDate.getMinutes() + 30);
        }
      }
      
      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }
    
    return timeSlots;
  } catch (error) {
    console.error('Error finding available time slots:', error);
    return [];
  }
}

/**
 * Validates and creates a new appointment with double booking prevention
 * @param appointmentData The appointment data to create
 * @returns Promise resolving to object with success status and appointment or error
 */
export async function createAppointmentSafely(appointmentData: InsertAppointment): Promise<{
  success: boolean;
  appointment?: any;
  error?: string;
}> {
  try {
    // Check if the time slot is available
    const isAvailable = await isTimeSlotAvailable(
      appointmentData.businessId,
      appointmentData.startDate,
      appointmentData.endDate,
      appointmentData.staffId
    );

    if (!isAvailable) {
      return {
        success: false,
        error: 'The requested time slot is not available. Please select another time.'
      };
    }

    // If available, create the appointment
    const appointment = await storage.createAppointment(appointmentData);

    return {
      success: true,
      appointment
    };
  } catch (error) {
    console.error('Error creating appointment:', error);
    return {
      success: false,
      error: 'An error occurred while scheduling the appointment.'
    };
  }
}