import { db } from '../db';
import { calendarIntegrations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Appointment } from '@shared/schema';
import { google } from 'googleapis';
import { storage } from '../storage';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '/api/calendar/google/callback';

// Scopes needed for calendar access
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

function createOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google Calendar credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

export class GoogleCalendarService {
  // Generate OAuth URL for Google Calendar authorization
  generateAuthUrl(businessId: number): string {
    try {
      const oauth2Client = createOAuth2Client();
      return oauth2Client.generateAuthUrl({
        access_type: 'offline', // Gets refresh token
        scope: SCOPES,
        state: String(businessId), // Pass businessId through OAuth flow
        prompt: 'consent', // Always show consent screen to get refresh token
      });
    } catch (error) {
      console.error('Error generating Google auth URL:', error);
      return '';
    }
  }

  // Handle OAuth callback from Google
  async handleCallback(code: string, state: string): Promise<boolean> {
    try {
      const businessId = parseInt(state);
      if (isNaN(businessId)) {
        throw new Error('Invalid state parameter');
      }

      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('No access token received from Google');
      }

      // Store the tokens in the database
      const existingIntegration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'google')
          )
        )
        .limit(1);

      const tokenData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || (existingIntegration[0]?.refreshToken ?? null),
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
        updatedAt: new Date(),
      };

      if (existingIntegration.length > 0) {
        await db.update(calendarIntegrations)
          .set(tokenData)
          .where(eq(calendarIntegrations.id, existingIntegration[0].id));
      } else {
        await db.insert(calendarIntegrations)
          .values({
            businessId,
            provider: 'google',
            ...tokenData,
            data: JSON.stringify({}),
            createdAt: new Date(),
          });
      }

      console.log(`Google Calendar connected for business ${businessId}`);
      return true;
    } catch (error) {
      console.error('Error handling Google Calendar callback:', error);
      throw error;
    }
  }

  // Get an authenticated OAuth client for a business
  private async getAuthenticatedClient(businessId: number) {
    const integration = await db.select()
      .from(calendarIntegrations)
      .where(
        and(
          eq(calendarIntegrations.businessId, businessId),
          eq(calendarIntegrations.provider, 'google')
        )
      )
      .limit(1);

    if (!integration.length || !integration[0].accessToken) {
      return null;
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: integration[0].accessToken,
      refresh_token: integration[0].refreshToken,
      expiry_date: integration[0].expiresAt ? integration[0].expiresAt.getTime() : undefined,
    });

    // Auto-refresh token if expired
    oauth2Client.on('tokens', async (tokens) => {
      try {
        const updates: any = { updatedAt: new Date() };
        if (tokens.access_token) updates.accessToken = tokens.access_token;
        if (tokens.refresh_token) updates.refreshToken = tokens.refresh_token;
        if (tokens.expiry_date) updates.expiresAt = new Date(tokens.expiry_date);

        await db.update(calendarIntegrations)
          .set(updates)
          .where(eq(calendarIntegrations.id, integration[0].id));

        console.log(`Google Calendar tokens refreshed for business ${businessId}`);
      } catch (err) {
        console.error('Error saving refreshed Google tokens:', err);
      }
    });

    return oauth2Client;
  }

  // Check if Google Calendar is connected for a business
  async isConnected(businessId: number): Promise<boolean> {
    try {
      const integration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'google')
          )
        )
        .limit(1);

      return integration.length > 0 && !!integration[0].accessToken;
    } catch (error) {
      console.error('Error checking Google Calendar connection:', error);
      return false;
    }
  }

  // Disconnect Google Calendar for a business
  async disconnect(businessId: number): Promise<boolean> {
    try {
      // Try to revoke the token first
      const client = await this.getAuthenticatedClient(businessId);
      if (client) {
        try {
          await client.revokeCredentials();
        } catch (revokeErr) {
          console.error('Error revoking Google credentials (continuing with disconnect):', revokeErr);
        }
      }

      await db.delete(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'google')
          )
        );

      console.log(`Google Calendar disconnected for business ${businessId}`);
      return true;
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      return false;
    }
  }

  // Sync an appointment with Google Calendar
  async syncAppointment(businessId: number, appointment: Appointment): Promise<string | null> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return null;

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Build event details
      const business = await storage.getBusiness(businessId);
      const customer = appointment.customerId ? await storage.getCustomer(appointment.customerId) : null;
      const service = appointment.serviceId ? await storage.getService(appointment.serviceId) : null;
      const staffMember = appointment.staffId ? await storage.getStaffMember(appointment.staffId) : null;

      const customerName = customer ? `${customer.firstName} ${customer.lastName || ''}`.trim() : 'Customer';
      const serviceName = service?.name || 'Appointment';
      const staffName = staffMember ? `${staffMember.firstName} ${staffMember.lastName || ''}`.trim() : null;

      const summary = staffName
        ? `${customerName} - ${serviceName} (with ${staffName})`
        : `${customerName} - ${serviceName}`;

      const descriptionParts = [
        `Customer: ${customerName}`,
        customer?.phone ? `Phone: ${customer.phone}` : null,
        customer?.email ? `Email: ${customer.email}` : null,
        `Service: ${serviceName}`,
        staffName ? `Staff: ${staffName}` : null,
        appointment.notes ? `Notes: ${appointment.notes}` : null,
        `Status: ${appointment.status || 'scheduled'}`,
        `\nBooked via SmallBizAgent`,
      ].filter(Boolean).join('\n');

      // Calculate start and end times (using startDate/endDate from schema)
      const startTime = new Date(appointment.startDate!);
      const endTime = appointment.endDate
        ? new Date(appointment.endDate)
        : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour if no end date

      const event: any = {
        summary,
        description: descriptionParts,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: business?.timezone || 'America/New_York',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: business?.timezone || 'America/New_York',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
          ],
        },
      };

      // If there's already a Google Calendar event ID, update it
      if (appointment.googleCalendarEventId) {
        try {
          const updated = await calendar.events.update({
            calendarId: 'primary',
            eventId: appointment.googleCalendarEventId,
            requestBody: event,
          });
          console.log(`Updated Google Calendar event: ${updated.data.id}`);
          return updated.data.id || appointment.googleCalendarEventId;
        } catch (updateErr: any) {
          // If event not found, create a new one
          if (updateErr.code === 404) {
            console.log('Google Calendar event not found, creating new one');
          } else {
            throw updateErr;
          }
        }
      }

      // Create a new event
      const created = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      console.log(`Created Google Calendar event: ${created.data.id}`);
      return created.data.id || null;
    } catch (error) {
      console.error('Error syncing appointment to Google Calendar:', error);
      return null;
    }
  }

  // Delete an appointment from Google Calendar
  async deleteAppointment(businessId: number, eventId: string): Promise<boolean> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return false;

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
      });

      console.log(`Deleted Google Calendar event: ${eventId}`);
      return true;
    } catch (error: any) {
      // 404 = already deleted, treat as success
      if (error.code === 404) {
        console.log(`Google Calendar event already deleted: ${eventId}`);
        return true;
      }
      console.error('Error deleting appointment from Google Calendar:', error);
      return false;
    }
  }
}
