import { db } from '../db';
import { calendarIntegrations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Appointment } from '@shared/schema';
import { Client } from '@microsoft/microsoft-graph-client';
import { storage } from '../storage';

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || '/api/calendar/microsoft/callback';

// Microsoft OAuth2 endpoints (common tenant = personal + work/school accounts)
const AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

// Scopes needed for calendar access
const SCOPES = ['Calendars.ReadWrite', 'offline_access'];

export class MicrosoftCalendarService {
  // Generate OAuth URL for Microsoft Calendar authorization
  generateAuthUrl(businessId: number): string {
    if (!MICROSOFT_CLIENT_ID) {
      console.warn('MICROSOFT_CLIENT_ID not configured — Microsoft Calendar will not work');
      return '';
    }

    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: MICROSOFT_REDIRECT_URI,
      scope: SCOPES.join(' '),
      state: String(businessId),
      prompt: 'consent', // Always show consent screen to get refresh token
      response_mode: 'query',
    });

    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  // Handle OAuth callback from Microsoft
  async handleCallback(code: string, state: string): Promise<boolean> {
    try {
      if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
        throw new Error('Microsoft Calendar credentials not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.');
      }

      const businessId = parseInt(state);
      if (isNaN(businessId)) {
        throw new Error('Invalid state parameter');
      }

      // Exchange authorization code for tokens
      const tokenResponse = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri: MICROSOFT_REDIRECT_URI,
          grant_type: 'authorization_code',
          scope: SCOPES.join(' '),
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Microsoft token exchange error:', errorData);
        throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error || 'Unknown error'}`);
      }

      const tokens = await tokenResponse.json();

      if (!tokens.access_token) {
        throw new Error('No access token received from Microsoft');
      }

      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

      // Store the tokens in the database
      const existingIntegration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'microsoft')
          )
        )
        .limit(1);

      const tokenData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || (existingIntegration[0]?.refreshToken ?? null),
        expiresAt,
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
            provider: 'microsoft',
            ...tokenData,
            data: JSON.stringify({}),
            createdAt: new Date(),
          });
      }

      console.log(`Microsoft Calendar connected for business ${businessId}`);
      return true;
    } catch (error) {
      console.error('Error handling Microsoft Calendar callback:', error);
      throw error;
    }
  }

  // Get an authenticated Microsoft Graph client for a business
  private async getAuthenticatedClient(businessId: number): Promise<Client | null> {
    const integration = await db.select()
      .from(calendarIntegrations)
      .where(
        and(
          eq(calendarIntegrations.businessId, businessId),
          eq(calendarIntegrations.provider, 'microsoft')
        )
      )
      .limit(1);

    if (!integration.length || !integration[0].accessToken) {
      return null;
    }

    // Check if token is expired and refresh if needed
    let accessToken = integration[0].accessToken;
    if (integration[0].expiresAt && new Date(integration[0].expiresAt) <= new Date()) {
      const refreshedToken = await this.refreshAccessToken(integration[0]);
      if (!refreshedToken) {
        console.error(`Failed to refresh Microsoft token for business ${businessId}`);
        return null;
      }
      accessToken = refreshedToken;
    }

    // Create Microsoft Graph client
    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    return client;
  }

  // Refresh an expired access token
  private async refreshAccessToken(integration: typeof calendarIntegrations.$inferSelect): Promise<string | null> {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      console.error('Microsoft Calendar credentials not configured for token refresh');
      return null;
    }

    if (!integration.refreshToken) {
      console.error(`No refresh token available for Microsoft Calendar integration ${integration.id}`);
      return null;
    }

    try {
      const tokenResponse = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          refresh_token: integration.refreshToken,
          grant_type: 'refresh_token',
          scope: SCOPES.join(' '),
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Microsoft token refresh error:', errorData);
        return null;
      }

      const tokens = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

      // Update tokens in database
      const updates: any = {
        accessToken: tokens.access_token,
        expiresAt,
        updatedAt: new Date(),
      };
      if (tokens.refresh_token) {
        updates.refreshToken = tokens.refresh_token;
      }

      await db.update(calendarIntegrations)
        .set(updates)
        .where(eq(calendarIntegrations.id, integration.id));

      console.log(`Microsoft Calendar tokens refreshed for business ${integration.businessId}`);
      return tokens.access_token;
    } catch (error) {
      console.error('Error refreshing Microsoft token:', error);
      return null;
    }
  }

  // Check if Microsoft Calendar is connected for a business
  async isConnected(businessId: number): Promise<boolean> {
    try {
      const integration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'microsoft')
          )
        )
        .limit(1);

      return integration.length > 0 && !!integration[0].accessToken;
    } catch (error) {
      console.error('Error checking Microsoft Calendar connection:', error);
      return false;
    }
  }

  // Disconnect Microsoft Calendar for a business
  async disconnect(businessId: number): Promise<boolean> {
    try {
      await db.delete(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'microsoft')
          )
        );

      console.log(`Microsoft Calendar disconnected for business ${businessId}`);
      return true;
    } catch (error) {
      console.error('Error disconnecting Microsoft Calendar:', error);
      return false;
    }
  }

  // Sync an appointment with Microsoft Calendar
  async syncAppointment(businessId: number, appointment: Appointment): Promise<string | null> {
    try {
      const client = await this.getAuthenticatedClient(businessId);
      if (!client) return null;

      // Build event details (same data as Google Calendar)
      const business = await storage.getBusiness(businessId);
      const customer = appointment.customerId ? await storage.getCustomer(appointment.customerId) : null;
      const service = appointment.serviceId ? await storage.getService(appointment.serviceId) : null;
      const staffMember = appointment.staffId ? await storage.getStaffMember(appointment.staffId) : null;

      const customerName = customer ? `${customer.firstName} ${customer.lastName || ''}`.trim() : 'Customer';
      const serviceName = service?.name || 'Appointment';
      const staffName = staffMember ? `${staffMember.firstName} ${staffMember.lastName || ''}`.trim() : null;

      const subject = staffName
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

      // Use startDate and endDate from the appointment
      const startTime = new Date(appointment.startDate);
      const endTime = new Date(appointment.endDate);

      // Microsoft Graph event format
      const event = {
        subject,
        body: {
          contentType: 'text' as const,
          content: descriptionParts,
        },
        start: {
          dateTime: startTime.toISOString(),
          timeZone: business?.timezone || 'America/New_York',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: business?.timezone || 'America/New_York',
        },
        reminderMinutesBeforeStart: 30,
        isReminderOn: true,
      };

      // If there's already a Microsoft Calendar event ID, update it
      if (appointment.microsoftCalendarEventId) {
        try {
          const updated = await client.api(`/me/events/${appointment.microsoftCalendarEventId}`)
            .patch(event);
          console.log(`Updated Microsoft Calendar event: ${updated.id}`);
          return updated.id || appointment.microsoftCalendarEventId;
        } catch (updateErr: any) {
          // If event not found (404), create a new one
          if (updateErr.statusCode === 404) {
            console.log('Microsoft Calendar event not found, creating new one');
          } else {
            throw updateErr;
          }
        }
      }

      // Create a new event
      const created = await client.api('/me/events').post(event);
      console.log(`Created Microsoft Calendar event: ${created.id}`);
      return created.id || null;
    } catch (error) {
      console.error('Error syncing appointment to Microsoft Calendar:', error);
      return null;
    }
  }

  // Delete an appointment from Microsoft Calendar
  async deleteAppointment(businessId: number, eventId: string): Promise<boolean> {
    try {
      const client = await this.getAuthenticatedClient(businessId);
      if (!client) return false;

      await client.api(`/me/events/${eventId}`).delete();
      console.log(`Deleted Microsoft Calendar event: ${eventId}`);
      return true;
    } catch (error: any) {
      // 404 = already deleted, treat as success
      if (error.statusCode === 404) {
        console.log(`Microsoft Calendar event already deleted: ${eventId}`);
        return true;
      }
      console.error('Error deleting appointment from Microsoft Calendar:', error);
      return false;
    }
  }
}
