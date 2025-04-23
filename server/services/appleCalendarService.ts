import { db } from '../db';
import { calendarIntegrations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Appointment } from '@shared/schema';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Ensure calendar directories exist
const PUBLIC_DIR = path.join(__dirname, '../../public');
const CALENDAR_DIR = path.join(PUBLIC_DIR, 'calendar');
const SUBSCRIPTION_DIR = path.join(CALENDAR_DIR, 'subscriptions');
const EVENTS_DIR = path.join(CALENDAR_DIR, 'events');

// Create directories if they don't exist
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}
if (!fs.existsSync(CALENDAR_DIR)) {
  fs.mkdirSync(CALENDAR_DIR, { recursive: true });
}
if (!fs.existsSync(SUBSCRIPTION_DIR)) {
  fs.mkdirSync(SUBSCRIPTION_DIR, { recursive: true });
}
if (!fs.existsSync(EVENTS_DIR)) {
  fs.mkdirSync(EVENTS_DIR, { recursive: true });
}

export class AppleCalendarService {
  // Get the subscription URL for Apple Calendar
  getSubscriptionUrl(businessId: number): string {
    // Generate a unique filename for the business subscription
    const filename = this.getBusinessFilename(businessId);
    
    // Create an empty subscription file if it doesn't exist
    const filePath = path.join(SUBSCRIPTION_DIR, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, this.generateEmptyCalendar(businessId));
    }
    
    // Return the URL
    return `/calendar/subscriptions/${filename}`;
  }

  // Check if Apple Calendar is connected for a business
  async isConnected(businessId: number): Promise<boolean> {
    const filename = this.getBusinessFilename(businessId);
    const filePath = path.join(SUBSCRIPTION_DIR, filename);
    return fs.existsSync(filePath);
  }

  // Generate an empty iCalendar file
  private generateEmptyCalendar(businessId: number): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/g, '');
    
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SmallBizAgent//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Business Calendar ${businessId}`,
      'X-WR-TIMEZONE:UTC',
      `X-WR-CALDESC:Appointment calendar for business ${businessId}`,
      'END:VCALENDAR'
    ].join('\r\n');
  }

  // Generate a unique filename for a business
  private getBusinessFilename(businessId: number): string {
    return `business_${businessId}_calendar.ics`;
  }

  // Generate a unique filename for an event
  private getEventFilename(businessId: number, appointmentId: number): string {
    return `business_${businessId}_event_${appointmentId}.ics`;
  }

  // Sync an appointment with Apple Calendar
  async syncAppointment(businessId: number, appointment: Appointment): Promise<string | null> {
    try {
      // Check if we have an integration record
      let integration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'apple')
          )
        )
        .limit(1);

      // Generate a unique filename
      const eventFilename = this.getEventFilename(businessId, appointment.id);
      const eventId = crypto.randomBytes(16).toString('hex');
      
      // Create or update the integration record
      if (integration.length > 0) {
        // Update existing integration data
        const data = JSON.parse(integration[0].data || '{}');
        data.events = data.events || {};
        data.events[appointment.id] = {
          filename: eventFilename,
          eventId: eventId
        };
        
        await db.update(calendarIntegrations)
          .set({
            data: JSON.stringify(data),
            updatedAt: new Date()
          })
          .where(eq(calendarIntegrations.id, integration[0].id));
      } else {
        // Create new integration record
        const data = {
          filename: this.getBusinessFilename(businessId),
          events: {
            [appointment.id]: {
              filename: eventFilename,
              eventId: eventId
            }
          }
        };
        
        await db.insert(calendarIntegrations)
          .values({
            businessId,
            provider: 'apple',
            data: JSON.stringify(data),
            createdAt: new Date(),
            updatedAt: new Date()
          });
      }

      // Generate the ics file content
      const icsContent = this.generateEventICS(eventId, appointment);
      
      // Write the file
      const eventPath = path.join(EVENTS_DIR, eventFilename);
      fs.writeFileSync(eventPath, icsContent);
      
      // Update the subscription file
      this.updateSubscriptionFile(businessId);
      
      return eventId;
    } catch (error) {
      console.error('Error syncing appointment to Apple Calendar:', error);
      return null;
    }
  }

  // Delete an appointment from Apple Calendar
  async deleteAppointment(businessId: number, eventId: string): Promise<boolean> {
    try {
      // Find the integration record
      const integration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'apple')
          )
        )
        .limit(1);
      
      if (!integration.length) {
        return false;
      }
      
      // Parse the data
      const data = JSON.parse(integration[0].data || '{}');
      let eventFound = false;
      let filename = '';
      
      // Find the event
      for (const [appointmentId, event] of Object.entries(data.events || {})) {
        if (event.eventId === eventId) {
          eventFound = true;
          filename = event.filename;
          // Remove the event from the data
          delete data.events[appointmentId];
          break;
        }
      }
      
      if (!eventFound) {
        return false;
      }
      
      // Update the integration record
      await db.update(calendarIntegrations)
        .set({
          data: JSON.stringify(data),
          updatedAt: new Date()
        })
        .where(eq(calendarIntegrations.id, integration[0].id));
      
      // Delete the event file
      const eventPath = path.join(EVENTS_DIR, filename);
      if (fs.existsSync(eventPath)) {
        fs.unlinkSync(eventPath);
      }
      
      // Update the subscription file
      this.updateSubscriptionFile(businessId);
      
      return true;
    } catch (error) {
      console.error('Error deleting appointment from Apple Calendar:', error);
      return false;
    }
  }

  // Get download URL for .ics file
  getICSUrl(filename: string): string {
    return `/calendar/events/${filename}`;
  }

  // Generate an iCalendar event file
  private generateEventICS(eventId: string, appointment: Appointment): string {
    const startDate = new Date(appointment.startTime);
    const endDate = new Date(appointment.endTime);
    
    const startTimestamp = startDate.toISOString().replace(/[-:]/g, '').replace(/\.\d+/g, '');
    const endTimestamp = endDate.toISOString().replace(/[-:]/g, '').replace(/\.\d+/g, '');
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/g, '');
    
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SmallBizAgent//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${eventId}`,
      `DTSTAMP:${now}`,
      `DTSTART:${startTimestamp}`,
      `DTEND:${endTimestamp}`,
      `SUMMARY:${appointment.title || 'Appointment'}`,
      `DESCRIPTION:${appointment.notes || ''}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  // Update the subscription file with all events
  private updateSubscriptionFile(businessId: number): void {
    try {
      // Get the subscription filename
      const filename = this.getBusinessFilename(businessId);
      const filePath = path.join(SUBSCRIPTION_DIR, filename);
      
      // Get all event files for this business
      const eventFiles = fs.readdirSync(EVENTS_DIR)
        .filter(file => file.startsWith(`business_${businessId}_event_`));
      
      // Create the calendar header
      let calendarContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SmallBizAgent//Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:Business Calendar ${businessId}`,
        'X-WR-TIMEZONE:UTC',
        `X-WR-CALDESC:Appointment calendar for business ${businessId}`
      ].join('\r\n');
      
      // Add all events
      for (const eventFile of eventFiles) {
        const eventPath = path.join(EVENTS_DIR, eventFile);
        const eventContent = fs.readFileSync(eventPath, 'utf8');
        
        // Extract the VEVENT section
        const eventSection = eventContent.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/);
        
        if (eventSection) {
          calendarContent += '\r\n' + eventSection[0];
        }
      }
      
      // Add the calendar footer
      calendarContent += '\r\nEND:VCALENDAR';
      
      // Write the updated subscription file
      fs.writeFileSync(filePath, calendarContent);
    } catch (error) {
      console.error('Error updating subscription file:', error);
    }
  }
}