import { Client } from '@microsoft/microsoft-graph-client';
import { db } from '../db';
import { businesses, calendarIntegrations } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class MicrosoftCalendarService {
  /**
   * Generate OAuth URL for Microsoft Calendar authorization
   */
  generateAuthUrl(businessId: number): string {
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || '';
    const clientId = process.env.MICROSOFT_CLIENT_ID || '';
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    const state = encodeURIComponent(JSON.stringify({ businessId }));
    
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent('Calendars.ReadWrite offline_access')}&state=${state}`;
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleCallback(code: string, state: string): Promise<void> {
    const { businessId } = JSON.parse(decodeURIComponent(state));
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || '';
    const clientId = process.env.MICROSOFT_CLIENT_ID || '';
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || '';
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Error getting token: ${response.statusText}`);
    }

    const tokens = await response.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db.insert(calendarIntegrations).values({
      businessId,
      provider: 'microsoft',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      data: JSON.stringify(tokens),
    }).onConflictDoUpdate({
      target: [calendarIntegrations.businessId, calendarIntegrations.provider],
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || (
          // Keep existing refresh_token if the new one is empty
          db.select({ refreshToken: calendarIntegrations.refreshToken })
            .from(calendarIntegrations)
            .where(eq(calendarIntegrations.businessId, businessId))
            .where(eq(calendarIntegrations.provider, 'microsoft'))
        ),
        expiresAt,
        data: JSON.stringify(tokens),
      }
    });
  }

  /**
   * Get authenticated Microsoft Graph client
   */
  async getGraphClient(businessId: number): Promise<Client> {
    const integration = await db.select()
      .from(calendarIntegrations)
      .where(eq(calendarIntegrations.businessId, businessId))
      .where(eq(calendarIntegrations.provider, 'microsoft'))
      .limit(1);

    if (!integration.length) {
      throw new Error('Microsoft Calendar integration not found for business');
    }

    let { accessToken, refreshToken, expiresAt } = integration[0];
    
    // Refresh token if expired
    if (expiresAt && expiresAt < new Date()) {
      const clientId = process.env.MICROSOFT_CLIENT_ID || '';
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || '';
      const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
      
      const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Error refreshing token: ${response.statusText}`);
      }

      const tokens = await response.json();
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      await db.update(calendarIntegrations)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || refreshToken,
          expiresAt: newExpiresAt,
          data: JSON.stringify(tokens),
        })
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'microsoft'));

      accessToken = tokens.access_token;
    }

    return Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
  }

  /**
   * Sync an appointment to Microsoft Outlook Calendar
   */
  async syncAppointment(businessId: number, appointment: any): Promise<string | null> {
    try {
      const client = await this.getGraphClient(businessId);
      const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
      
      if (!business.length) {
        throw new Error('Business not found');
      }

      const event = {
        subject: `Appointment: ${appointment.title || 'New Appointment'}`,
        body: {
          contentType: 'text',
          content: appointment.notes || '',
        },
        start: {
          dateTime: new Date(appointment.startDate).toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: new Date(appointment.endDate).toISOString(),
          timeZone: 'UTC',
        },
        location: {
          displayName: business[0].address || '',
        },
      };

      // Create or update event
      let response;
      if (appointment.microsoftCalendarEventId) {
        await client.api(`/me/events/${appointment.microsoftCalendarEventId}`)
          .update(event);
        return appointment.microsoftCalendarEventId;
      } else {
        response = await client.api('/me/events')
          .post(event);
        return response.id || null;
      }
    } catch (error) {
      console.error('Error syncing to Microsoft Calendar:', error);
      return null;
    }
  }

  /**
   * Delete an appointment from Microsoft Outlook Calendar
   */
  async deleteAppointment(businessId: number, microsoftCalendarEventId: string): Promise<boolean> {
    try {
      if (!microsoftCalendarEventId) return false;
      
      const client = await this.getGraphClient(businessId);
      await client.api(`/me/events/${microsoftCalendarEventId}`)
        .delete();
      
      return true;
    } catch (error) {
      console.error('Error deleting from Microsoft Calendar:', error);
      return false;
    }
  }

  /**
   * Retrieve all events from Microsoft Outlook Calendar within a date range
   */
  async getEvents(businessId: number, startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const client = await this.getGraphClient(businessId);
      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();
      
      const response = await client.api('/me/calendarView')
        .query({
          startDateTime: startDateStr,
          endDateTime: endDateStr,
        })
        .select('id,subject,bodyPreview,start,end,location')
        .orderby('start/dateTime')
        .get();

      return response.value || [];
    } catch (error) {
      console.error('Error fetching Microsoft Calendar events:', error);
      return [];
    }
  }

  /**
   * Check if Microsoft Outlook Calendar integration is connected
   */
  async isConnected(businessId: number): Promise<boolean> {
    try {
      const integration = await db.select()
        .from(calendarIntegrations)
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'microsoft'))
        .limit(1);

      return integration.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Disconnect Microsoft Outlook Calendar integration
   */
  async disconnect(businessId: number): Promise<boolean> {
    try {
      await db.delete(calendarIntegrations)
        .where(eq(calendarIntegrations.businessId, businessId))
        .where(eq(calendarIntegrations.provider, 'microsoft'));
      
      return true;
    } catch (error) {
      console.error('Error disconnecting Microsoft Calendar:', error);
      return false;
    }
  }
}