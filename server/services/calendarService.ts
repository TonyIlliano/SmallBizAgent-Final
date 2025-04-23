import { db } from '../db';
import { appointments, calendarIntegrations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { GoogleCalendarService } from './googleCalendarService';
import { MicrosoftCalendarService } from './microsoftCalendarService';
import { AppleCalendarService } from './appleCalendarService';
import path from 'path';
import fs from 'fs';

// Ensure calendar directories exist
const PUBLIC_DIR = path.join(__dirname, '../../public');
const CALENDAR_DIR = path.join(PUBLIC_DIR, 'calendar');
const SUBSCRIPTION_DIR = path.join(CALENDAR_DIR, 'subscriptions');

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

export class CalendarService {
  private googleService: GoogleCalendarService;
  private microsoftService: MicrosoftCalendarService;
  private appleService: AppleCalendarService;

  constructor() {
    this.googleService = new GoogleCalendarService();
    this.microsoftService = new MicrosoftCalendarService();
    this.appleService = new AppleCalendarService();
  }

  /**
   * Get OAuth URLs for all calendar services
   */
  getAuthUrls(businessId: number) {
    return {
      google: this.googleService.generateAuthUrl(businessId),
      microsoft: this.microsoftService.generateAuthUrl(businessId),
      appleSubscription: this.appleService.getSubscriptionUrl(businessId),
    };
  }

  /**
   * Handle OAuth callback from Google
   */
  async handleGoogleCallback(code: string, state: string) {
    return this.googleService.handleCallback(code, state);
  }

  /**
   * Handle OAuth callback from Microsoft
   */
  async handleMicrosoftCallback(code: string, state: string) {
    return this.microsoftService.handleCallback(code, state);
  }

  /**
   * Get the status of all calendar integrations for a business
   */
  async getIntegrationStatus(businessId: number) {
    const [googleConnected, microsoftConnected, appleAvailable] = await Promise.all([
      this.googleService.isConnected(businessId),
      this.microsoftService.isConnected(businessId),
      this.appleService.isConnected(businessId),
    ]);

    return {
      google: googleConnected,
      microsoft: microsoftConnected,
      apple: appleAvailable,
    };
  }

  /**
   * Disconnect a calendar integration
   */
  async disconnectCalendar(businessId: number, provider: string) {
    switch (provider) {
      case 'google':
        return this.googleService.disconnect(businessId);
      case 'microsoft':
        return this.microsoftService.disconnect(businessId);
      default:
        throw new Error(`Unsupported calendar provider: ${provider}`);
    }
  }

  /**
   * Sync an appointment to all connected calendars
   */
  async syncAppointment(appointmentId: number) {
    const appointment = await db.select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!appointment.length) {
      throw new Error(`Appointment with ID ${appointmentId} not found`);
    }

    const businessId = appointment[0].businessId;
    const status = await this.getIntegrationStatus(businessId);
    const updates: any = {};

    // Sync with Google Calendar if connected
    if (status.google) {
      const googleEventId = await this.googleService.syncAppointment(
        businessId, 
        appointment[0]
      );
      if (googleEventId) {
        updates.googleCalendarEventId = googleEventId;
      }
    }

    // Sync with Microsoft Calendar if connected
    if (status.microsoft) {
      const microsoftEventId = await this.microsoftService.syncAppointment(
        businessId, 
        appointment[0]
      );
      if (microsoftEventId) {
        updates.microsoftCalendarEventId = microsoftEventId;
      }
    }

    // Generate Apple Calendar .ics file
    if (status.apple) {
      const appleEventId = await this.appleService.syncAppointment(
        businessId, 
        appointment[0]
      );
      if (appleEventId) {
        updates.appleCalendarEventId = appleEventId;
      }
    }

    // Update appointment with calendar IDs and sync time
    if (Object.keys(updates).length > 0) {
      updates.lastSyncedAt = new Date();
      await db.update(appointments)
        .set(updates)
        .where(eq(appointments.id, appointmentId));
    }

    return { 
      synced: Object.keys(updates).length > 0,
      google: !!updates.googleCalendarEventId,
      microsoft: !!updates.microsoftCalendarEventId,
      apple: !!updates.appleCalendarEventId
    };
  }

  /**
   * Delete an appointment from all connected calendars
   */
  async deleteAppointment(appointmentId: number) {
    const appointment = await db.select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!appointment.length) {
      throw new Error(`Appointment with ID ${appointmentId} not found`);
    }

    const businessId = appointment[0].businessId;
    const { googleCalendarEventId, microsoftCalendarEventId, appleCalendarEventId } = appointment[0];

    const results = {
      google: false,
      microsoft: false, 
      apple: false
    };

    // Delete from Google Calendar
    if (googleCalendarEventId) {
      results.google = await this.googleService.deleteAppointment(
        businessId, 
        googleCalendarEventId
      );
    }

    // Delete from Microsoft Calendar
    if (microsoftCalendarEventId) {
      results.microsoft = await this.microsoftService.deleteAppointment(
        businessId, 
        microsoftCalendarEventId
      );
    }

    // Delete Apple Calendar .ics file
    if (appleCalendarEventId) {
      results.apple = await this.appleService.deleteAppointment(
        businessId, 
        appleCalendarEventId
      );
    }

    return results;
  }

  /**
   * Get Apple Calendar subscription ICS URL
   */
  async getAppleCalendarUrl(businessId: number) {
    return this.appleService.getSubscriptionUrl(businessId);
  }

  /**
   * Get download URL for a specific appointment's .ics file
   */
  async getAppointmentICS(appointmentId: number) {
    const appointment = await db.select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!appointment.length) {
      throw new Error(`Appointment with ID ${appointmentId} not found`);
    }

    // Generate or update the ICS file
    const businessId = appointment[0].businessId;
    await this.appleService.syncAppointment(businessId, appointment[0]);
    
    // Find the filename from the integration data
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
      throw new Error('Apple Calendar integration not found');
    }

    const data = JSON.parse(integration[0].data || '{}');
    if (!data.filename) {
      throw new Error('ICS file not found');
    }

    return this.appleService.getICSUrl(data.filename);
  }
}