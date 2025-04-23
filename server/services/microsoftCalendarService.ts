import { db } from '../db';
import { calendarIntegrations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Appointment } from '@shared/schema';

export class MicrosoftCalendarService {
  // Generate OAuth URL for Microsoft Calendar authorization
  generateAuthUrl(businessId: number): string {
    // This would use the Microsoft OAuth client
    // For now, we'll return a placeholder URL
    return `/api/v1/calendar/microsoft/auth?business_id=${businessId}`;
  }

  // Handle OAuth callback from Microsoft
  async handleCallback(code: string, state: string): Promise<boolean> {
    try {
      const businessId = parseInt(state);
      
      if (isNaN(businessId)) {
        throw new Error('Invalid state parameter');
      }
      
      // Mock getting tokens from Microsoft
      const tokens = {
        access_token: 'mock_ms_access_token',
        refresh_token: 'mock_ms_refresh_token',
        expires_at: new Date(Date.now() + 3600 * 1000), // 1 hour from now
      };

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

      if (existingIntegration.length > 0) {
        await db.update(calendarIntegrations)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expires_at,
            updatedAt: new Date()
          })
          .where(eq(calendarIntegrations.id, existingIntegration[0].id));
      } else {
        await db.insert(calendarIntegrations)
          .values({
            businessId,
            provider: 'microsoft',
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expires_at,
            data: JSON.stringify({}),
            createdAt: new Date(),
            updatedAt: new Date()
          });
      }

      return true;
    } catch (error) {
      console.error('Error handling Microsoft Calendar callback:', error);
      throw error;
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
      const result = await db.delete(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, 'microsoft')
          )
        );

      return true;
    } catch (error) {
      console.error('Error disconnecting Microsoft Calendar:', error);
      return false;
    }
  }

  // Sync an appointment with Microsoft Calendar
  async syncAppointment(businessId: number, appointment: Appointment): Promise<string | null> {
    try {
      // Check if integration exists
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

      // If there's already a Microsoft Calendar event ID, update it
      if (appointment.microsoftCalendarEventId) {
        // Here we would update the existing event
        console.log(`Updating Microsoft Calendar event: ${appointment.microsoftCalendarEventId}`);
        return appointment.microsoftCalendarEventId;
      }

      // Create a new event
      console.log('Creating new Microsoft Calendar event');
      // Mock event creation - in production, this would call the Microsoft Graph API
      const eventId = `microsoft_event_${Date.now()}`;

      return eventId;
    } catch (error) {
      console.error('Error syncing appointment to Microsoft Calendar:', error);
      return null;
    }
  }

  // Delete an appointment from Microsoft Calendar
  async deleteAppointment(businessId: number, eventId: string): Promise<boolean> {
    try {
      // Check if integration exists
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
        return false;
      }

      // Here we would delete the event from Microsoft Calendar
      console.log(`Deleting Microsoft Calendar event: ${eventId}`);
      // Mock successful deletion
      return true;
    } catch (error) {
      console.error('Error deleting appointment from Microsoft Calendar:', error);
      return false;
    }
  }
}