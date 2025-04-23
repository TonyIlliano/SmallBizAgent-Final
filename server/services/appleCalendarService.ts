import ical from 'ical-generator';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { businesses, calendarIntegrations } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class AppleCalendarService {
  /**
   * Generate iCalendar .ics file for Apple Calendar
   */
  async generateICS(businessId: number, appointment: any): Promise<string> {
    const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    
    if (!business.length) {
      throw new Error('Business not found');
    }

    const calendar = ical({ name: 'SmallBizAgent Appointments' });
    
    const event = calendar.createEvent({
      id: appointment.appleCalendarEventId || uuidv4(),
      start: new Date(appointment.startDate),
      end: new Date(appointment.endDate),
      summary: `Appointment: ${appointment.title || 'New Appointment'}`,
      description: appointment.notes || '',
      location: business[0].address || '',
    });

    const filename = `appointment_${businessId}_${appointment.id}.ics`;
    const filepath = path.join(__dirname, '../../public/calendar', filename);
    
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write ics file
    fs.writeFileSync(filepath, calendar.toString());
    
    return filename;
  }

  /**
   * Get public URL for the .ics file
   */
  getICSUrl(filename: string): string {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    return `${baseUrl}/calendar/${filename}`;
  }

  /**
   * Create or update calendar entry in Apple Calendar via iCalendar file
   */
  async syncAppointment(businessId: number, appointment: any): Promise<string | null> {
    try {
      // Generate unique ID for Apple Calendar event if not exists
      if (!appointment.appleCalendarEventId) {
        appointment.appleCalendarEventId = uuidv4();
      }
      
      // Generate .ics file
      const filename = await this.generateICS(businessId, appointment);
      
      // Store the file reference in database
      await db.insert(calendarIntegrations).values({
        businessId,
        provider: 'apple',
        accessToken: '',
        refreshToken: '',
        expiresAt: null,
        data: JSON.stringify({ 
          eventId: appointment.appleCalendarEventId,
          filename,
          appointmentId: appointment.id
        }),
      }).onConflictDoUpdate({
        target: [calendarIntegrations.businessId, calendarIntegrations.provider],
        set: {
          data: JSON.stringify({ 
            eventId: appointment.appleCalendarEventId,
            filename,
            appointmentId: appointment.id
          }),
        }
      });
      
      return appointment.appleCalendarEventId;
    } catch (error) {
      console.error('Error creating Apple Calendar .ics file:', error);
      return null;
    }
  }

  /**
   * Remove .ics file for a deleted appointment
   */
  async deleteAppointment(businessId: number, appleCalendarEventId: string): Promise<boolean> {
    try {
      if (!appleCalendarEventId) return false;
      
      // Get the integration data
      const integration = await db.select()
        .from(calendarIntegrations)
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'apple'))
        .limit(1);
        
      if (!integration.length) return false;
      
      const data = JSON.parse(integration[0].data || '{}');
      
      // Delete the .ics file if it exists
      if (data.filename) {
        const filepath = path.join(__dirname, '../../public/calendar', data.filename);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }
      
      // Update integration data to remove the appointment reference
      await db.update(calendarIntegrations)
        .set({
          data: JSON.stringify({ 
            ...data,
            appointmentId: null, 
            deleted: true,
            deletedAt: new Date().toISOString()
          }),
        })
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'apple'));
      
      return true;
    } catch (error) {
      console.error('Error deleting Apple Calendar event:', error);
      return false;
    }
  }

  /**
   * Check if Apple Calendar integration is available
   * (Apple Calendar doesn't require OAuth authentication)
   */
  async isConnected(businessId: number): Promise<boolean> {
    return true; // Always available since it just generates .ics files
  }

  /**
   * Get subscription URL for Apple Calendar
   */
  async getSubscriptionUrl(businessId: number): Promise<string | null> {
    try {
      // Create a calendar for all business appointments
      const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
      
      if (!business.length) {
        throw new Error('Business not found');
      }
      
      // Generate a unique ID for the business calendar if not exists
      let integration = await db.select()
        .from(calendarIntegrations)
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'apple_subscription'))
        .limit(1);
        
      let subscriptionId: string;
      
      if (!integration.length) {
        subscriptionId = uuidv4();
        await db.insert(calendarIntegrations).values({
          businessId,
          provider: 'apple_subscription',
          accessToken: '',
          refreshToken: '',
          expiresAt: null,
          data: JSON.stringify({ subscriptionId }),
        });
      } else {
        const data = JSON.parse(integration[0].data || '{}');
        subscriptionId = data.subscriptionId || uuidv4();
      }
      
      const filename = `business_${businessId}_${subscriptionId}.ics`;
      
      // Return the URL to the subscription calendar
      const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
      return `${baseUrl}/calendar/subscriptions/${filename}`;
    } catch (error) {
      console.error('Error generating Apple Calendar subscription URL:', error);
      return null;
    }
  }
}