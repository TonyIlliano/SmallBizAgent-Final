import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db';
import { businesses, calendarIntegrations } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class GoogleCalendarService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generate OAuth URL for Google Calendar authorization
   */
  generateAuthUrl(businessId: number): string {
    const state = JSON.stringify({ businessId });
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state,
    });
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleCallback(code: string, state: string): Promise<void> {
    const { businessId } = JSON.parse(state);
    const { tokens } = await this.oauth2Client.getToken(code);
    
    await db.insert(calendarIntegrations).values({
      businessId,
      provider: 'google',
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || '',
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      data: JSON.stringify(tokens),
    }).onConflictDoUpdate({
      target: [calendarIntegrations.businessId, calendarIntegrations.provider],
      set: {
        accessToken: tokens.access_token || '',
        refreshToken: tokens.refresh_token || (
          // Keep existing refresh_token if the new one is empty
          db.select({ refreshToken: calendarIntegrations.refreshToken })
            .from(calendarIntegrations)
            .where(eq(calendarIntegrations.businessId, businessId))
            .where(eq(calendarIntegrations.provider, 'google'))
        ),
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        data: JSON.stringify(tokens),
      }
    });
  }

  /**
   * Get authenticated Google Calendar API client
   */
  async getCalendarClient(businessId: number): Promise<calendar_v3.Calendar> {
    const integration = await db.select()
      .from(calendarIntegrations)
      .where(eq(calendarIntegrations.businessId, businessId))
      .where(eq(calendarIntegrations.provider, 'google'))
      .limit(1);

    if (!integration.length) {
      throw new Error('Google Calendar integration not found for business');
    }

    const { accessToken, refreshToken, expiresAt } = integration[0];
    
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiresAt?.getTime(),
    });

    // Auto-refresh token if expired
    if (expiresAt && expiresAt < new Date()) {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      await db.update(calendarIntegrations)
        .set({
          accessToken: credentials.access_token || '',
          expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          data: JSON.stringify(credentials),
        })
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'google'));
    }

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Sync an appointment to Google Calendar
   */
  async syncAppointment(businessId: number, appointment: any): Promise<string | null> {
    try {
      const calendar = await this.getCalendarClient(businessId);
      const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
      
      if (!business.length) {
        throw new Error('Business not found');
      }

      const event: calendar_v3.Schema$Event = {
        summary: `Appointment: ${appointment.title || 'New Appointment'}`,
        description: appointment.notes || '',
        start: {
          dateTime: new Date(appointment.startDate).toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: new Date(appointment.endDate).toISOString(),
          timeZone: 'UTC',
        },
        location: business[0].address,
      };

      // Create or update event
      let response;
      if (appointment.googleCalendarEventId) {
        response = await calendar.events.update({
          calendarId: 'primary',
          eventId: appointment.googleCalendarEventId,
          requestBody: event,
        });
        return appointment.googleCalendarEventId;
      } else {
        response = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: event,
        });
        return response.data.id || null;
      }
    } catch (error) {
      console.error('Error syncing to Google Calendar:', error);
      return null;
    }
  }

  /**
   * Delete an appointment from Google Calendar
   */
  async deleteAppointment(businessId: number, googleCalendarEventId: string): Promise<boolean> {
    try {
      if (!googleCalendarEventId) return false;
      
      const calendar = await this.getCalendarClient(businessId);
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: googleCalendarEventId,
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting from Google Calendar:', error);
      return false;
    }
  }

  /**
   * Retrieve all events from Google Calendar within a date range
   */
  async getEvents(businessId: number, startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const calendar = await this.getCalendarClient(businessId);
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error);
      return [];
    }
  }

  /**
   * Check if Google Calendar integration is connected
   */
  async isConnected(businessId: number): Promise<boolean> {
    try {
      const integration = await db.select()
        .from(calendarIntegrations)
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'google'))
        .limit(1);

      return integration.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Disconnect Google Calendar integration
   */
  async disconnect(businessId: number): Promise<boolean> {
    try {
      await db.delete(calendarIntegrations)
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'google'));
      
      return true;
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      return false;
    }
  }
}