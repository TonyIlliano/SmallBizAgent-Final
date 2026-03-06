/**
 * Google Business Profile Integration Service
 *
 * Handles OAuth and API calls for managing Google Business Profile listings.
 * Allows business owners to add a "Book Appointment" link to their Google
 * Search and Maps listing, pointing to their SmallBizAgent booking page.
 */

import { db } from '../db';
import { calendarIntegrations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { google } from 'googleapis';
import { storage } from '../storage';
import { encryptField, decryptField } from '../utils/encryption';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GBP_REDIRECT_URI = process.env.GBP_REDIRECT_URI || '/api/gbp/google/callback';

const PROVIDER = 'google-business-profile';

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
];

export interface GBPAccount {
  name: string;       // e.g., "accounts/123456789"
  accountName: string; // display name
  type: string;
  role: string;
}

export interface GBPLocation {
  name: string;       // e.g., "locations/987654321"
  title: string;
  address?: any;
  websiteUri?: string;
}

export interface PlaceActionLink {
  name?: string;
  uri: string;
  placeActionType: string;
}

export interface GBPPhoneNumbers {
  primaryPhone?: string;
  additionalPhones?: string[];
}

export interface GBPReview {
  reviewId: string;
  name: string;           // Full resource name, e.g., "accounts/123/locations/456/reviews/789"
  reviewerName: string;
  rating: number | null;
  comment: string;
  createTime: string;
  updateTime: string;
  hasReply: boolean;
}

function starRatingToNumber(starRating: string): number {
  const map: Record<string, number> = {
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  };
  return map[starRating] ?? 0;
}

export interface GBPStoredData {
  selectedAccount?: GBPAccount;
  selectedLocation?: GBPLocation;
  bookingLinkName?: string;
  originalPhone?: string; // Saved before we replace it with the AI number
  aiPhoneSet?: boolean;   // True if we've replaced the phone with the Twilio number
}

function createOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GBP_REDIRECT_URI);
}

export class GoogleBusinessProfileService {
  generateAuthUrl(businessId: number): string {
    try {
      const oauth2Client = createOAuth2Client();
      return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: String(businessId),
        prompt: 'consent',
      });
    } catch (error) {
      console.error('Error generating GBP auth URL:', error);
      return '';
    }
  }

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

      const existingIntegration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, PROVIDER)
          )
        )
        .limit(1);

      const existingRefresh = existingIntegration[0]?.refreshToken
        ? decryptField(existingIntegration[0].refreshToken)
        : null;
      const tokenData = {
        accessToken: encryptField(tokens.access_token)!,
        refreshToken: encryptField(tokens.refresh_token || existingRefresh),
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
            provider: PROVIDER,
            ...tokenData,
            data: JSON.stringify({}),
            createdAt: new Date(),
          });
      }

      console.log(`Google Business Profile connected for business ${businessId}`);
      return true;
    } catch (error) {
      console.error('Error handling GBP callback:', error);
      throw error;
    }
  }

  private async getAuthenticatedClient(businessId: number) {
    const integration = await db.select()
      .from(calendarIntegrations)
      .where(
        and(
          eq(calendarIntegrations.businessId, businessId),
          eq(calendarIntegrations.provider, PROVIDER)
        )
      )
      .limit(1);

    if (!integration.length || !integration[0].accessToken) {
      return null;
    }

    // Decrypt tokens for use
    const decryptedAccessToken = decryptField(integration[0].accessToken);
    const decryptedRefreshToken = decryptField(integration[0].refreshToken);

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken,
      expiry_date: integration[0].expiresAt ? integration[0].expiresAt.getTime() : undefined,
    });

    // Auto-refresh tokens when they expire
    oauth2Client.on('tokens', async (tokens) => {
      try {
        const updates: any = { updatedAt: new Date() };
        if (tokens.access_token) updates.accessToken = encryptField(tokens.access_token);
        if (tokens.refresh_token) updates.refreshToken = encryptField(tokens.refresh_token);
        if (tokens.expiry_date) updates.expiresAt = new Date(tokens.expiry_date);

        await db.update(calendarIntegrations)
          .set(updates)
          .where(eq(calendarIntegrations.id, integration[0].id));

        console.log(`GBP tokens refreshed for business ${businessId}`);
      } catch (err) {
        console.error('Error saving refreshed GBP tokens:', err);
      }
    });

    return oauth2Client;
  }

  async isConnected(businessId: number): Promise<boolean> {
    try {
      const integration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, PROVIDER)
          )
        )
        .limit(1);

      return integration.length > 0 && !!integration[0].accessToken;
    } catch (error) {
      console.error('Error checking GBP connection:', error);
      return false;
    }
  }

  async disconnect(businessId: number): Promise<boolean> {
    try {
      const client = await this.getAuthenticatedClient(businessId);
      if (client) {
        try {
          await client.revokeCredentials();
        } catch (revokeErr) {
          console.error('Error revoking GBP credentials (continuing with disconnect):', revokeErr);
        }
      }

      await db.delete(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, PROVIDER)
          )
        );

      console.log(`Google Business Profile disconnected for business ${businessId}`);
      return true;
    } catch (error) {
      console.error('Error disconnecting GBP:', error);
      return false;
    }
  }

  async listAccounts(businessId: number): Promise<GBPAccount[]> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return [];

      const mybusiness = google.mybusinessaccountmanagement({
        version: 'v1',
        auth: oauth2Client,
      });

      const response = await mybusiness.accounts.list();

      return (response.data.accounts || []).map((account: any) => ({
        name: account.name || '',
        accountName: account.accountName || account.name || '',
        type: account.type || '',
        role: account.role || '',
      }));
    } catch (error: any) {
      console.error('Error listing GBP accounts:', error);
      if (error.code === 403 || error.code === 401) {
        throw new Error('Google Business Profile API access not enabled or insufficient permissions. Please verify API access in Google Cloud Console.');
      }
      throw error;
    }
  }

  async listLocations(businessId: number, accountName: string): Promise<GBPLocation[]> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return [];

      const mybusinessInfo = google.mybusinessbusinessinformation({
        version: 'v1',
        auth: oauth2Client,
      });

      const response = await mybusinessInfo.accounts.locations.list({
        parent: accountName,
        readMask: 'name,title,storefrontAddress,websiteUri',
      });

      return (response.data.locations || []).map((location: any) => ({
        name: location.name || '',
        title: location.title || '',
        address: location.storefrontAddress,
        websiteUri: location.websiteUri,
      }));
    } catch (error: any) {
      console.error('Error listing GBP locations:', error);
      if (error.code === 403 || error.code === 401) {
        throw new Error('Google Business Profile API access not enabled or insufficient permissions.');
      }
      throw error;
    }
  }

  async listPlaceActionLinks(businessId: number, locationName: string): Promise<PlaceActionLink[]> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return [];

      const placeActions = google.mybusinessplaceactions({
        version: 'v1',
        auth: oauth2Client,
      });

      const response = await placeActions.locations.placeActionLinks.list({
        parent: locationName,
      });

      return (response.data.placeActionLinks || []).map((link: any) => ({
        name: link.name,
        uri: link.uri || '',
        placeActionType: link.placeActionType || '',
      }));
    } catch (error: any) {
      console.error('Error listing place action links:', error);
      throw error;
    }
  }

  async createOrUpdateBookingLink(
    businessId: number,
    locationName: string,
    bookingUrl: string
  ): Promise<PlaceActionLink> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) throw new Error('Not connected to Google Business Profile');

      const placeActions = google.mybusinessplaceactions({
        version: 'v1',
        auth: oauth2Client,
      });

      // Check for existing APPOINTMENT link
      const existingLinks = await placeActions.locations.placeActionLinks.list({
        parent: locationName,
      });

      const existingAppointmentLink = (existingLinks.data.placeActionLinks || [])
        .find((link: any) => link.placeActionType === 'APPOINTMENT');

      if (existingAppointmentLink && existingAppointmentLink.name) {
        // Update existing link
        const updated = await placeActions.locations.placeActionLinks.patch({
          name: existingAppointmentLink.name,
          updateMask: 'uri',
          requestBody: {
            uri: bookingUrl,
            placeActionType: 'APPOINTMENT',
          },
        });
        console.log(`Updated GBP booking link: ${existingAppointmentLink.name}`);
        return {
          name: updated.data.name || undefined,
          uri: updated.data.uri || bookingUrl,
          placeActionType: updated.data.placeActionType || 'APPOINTMENT',
        };
      }

      // Create new link
      const created = await placeActions.locations.placeActionLinks.create({
        parent: locationName,
        requestBody: {
          uri: bookingUrl,
          placeActionType: 'APPOINTMENT',
        },
      });

      console.log(`Created GBP booking link for ${locationName}: ${created.data.name}`);
      return {
        name: created.data.name || undefined,
        uri: created.data.uri || bookingUrl,
        placeActionType: created.data.placeActionType || 'APPOINTMENT',
      };
    } catch (error: any) {
      console.error('Error creating/updating booking link:', error);
      if (error.code === 403) {
        throw new Error('Insufficient permissions to manage place action links.');
      }
      throw error;
    }
  }

  async deleteBookingLink(businessId: number, placeActionLinkName: string): Promise<boolean> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return false;

      const placeActions = google.mybusinessplaceactions({
        version: 'v1',
        auth: oauth2Client,
      });

      await placeActions.locations.placeActionLinks.delete({
        name: placeActionLinkName,
      });

      console.log(`Deleted GBP booking link: ${placeActionLinkName}`);
      return true;
    } catch (error: any) {
      if (error.code === 404) {
        console.log(`GBP booking link already deleted: ${placeActionLinkName}`);
        return true;
      }
      console.error('Error deleting booking link:', error);
      return false;
    }
  }

  /**
   * Get the current phone numbers for a GBP location.
   */
  async getPhoneNumbers(businessId: number, locationName: string): Promise<GBPPhoneNumbers> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) throw new Error('Not connected to Google Business Profile');

      const mybusinessInfo = google.mybusinessbusinessinformation({
        version: 'v1',
        auth: oauth2Client,
      });

      const response = await mybusinessInfo.locations.get({
        name: locationName,
        readMask: 'phoneNumbers',
      });

      return {
        primaryPhone: response.data.phoneNumbers?.primaryPhone || undefined,
        additionalPhones: response.data.phoneNumbers?.additionalPhones || [],
      };
    } catch (error: any) {
      console.error('Error getting GBP phone numbers:', error);
      throw error;
    }
  }

  /**
   * Update the phone number on a GBP location to the AI receptionist number.
   * Saves the original phone number so it can be restored later.
   */
  async setAIPhoneNumber(
    businessId: number,
    locationName: string,
    aiPhoneNumber: string
  ): Promise<{ success: boolean; originalPhone?: string }> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) throw new Error('Not connected to Google Business Profile');

      // First, get the current phone numbers so we can save the original
      const currentPhones = await this.getPhoneNumbers(businessId, locationName);
      const originalPhone = currentPhones.primaryPhone;

      // Build the new phone numbers — AI number as primary, original as additional
      const additionalPhones = [...(currentPhones.additionalPhones || [])];
      if (originalPhone && !additionalPhones.includes(originalPhone)) {
        additionalPhones.push(originalPhone);
      }

      const mybusinessInfo = google.mybusinessbusinessinformation({
        version: 'v1',
        auth: oauth2Client,
      });

      await mybusinessInfo.locations.patch({
        name: locationName,
        updateMask: 'phoneNumbers',
        requestBody: {
          phoneNumbers: {
            primaryPhone: aiPhoneNumber,
            additionalPhones,
          },
        },
      });

      // Save the original phone in our stored data
      const storedData = await this.getStoredData(businessId);
      if (storedData) {
        await this.updateStoredData(businessId, {
          ...storedData,
          originalPhone: originalPhone || undefined,
          aiPhoneSet: true,
        });
      }

      console.log(`Set AI phone number on GBP for business ${businessId}: ${aiPhoneNumber} (original: ${originalPhone})`);
      return { success: true, originalPhone };
    } catch (error: any) {
      console.error('Error setting AI phone number on GBP:', error);
      if (error.code === 403) {
        throw new Error('Insufficient permissions to update Google Business Profile phone number.');
      }
      throw error;
    }
  }

  /**
   * Restore the original phone number on a GBP location.
   */
  async restoreOriginalPhoneNumber(businessId: number, locationName: string): Promise<boolean> {
    try {
      const storedData = await this.getStoredData(businessId);
      if (!storedData?.originalPhone) {
        throw new Error('No original phone number saved to restore');
      }

      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) throw new Error('Not connected to Google Business Profile');

      // Get current additional phones and remove the original from the additional list
      const currentPhones = await this.getPhoneNumbers(businessId, locationName);
      const additionalPhones = (currentPhones.additionalPhones || [])
        .filter(p => p !== storedData.originalPhone);

      const mybusinessInfo = google.mybusinessbusinessinformation({
        version: 'v1',
        auth: oauth2Client,
      });

      await mybusinessInfo.locations.patch({
        name: locationName,
        updateMask: 'phoneNumbers',
        requestBody: {
          phoneNumbers: {
            primaryPhone: storedData.originalPhone,
            additionalPhones,
          },
        },
      });

      // Update stored data
      await this.updateStoredData(businessId, {
        ...storedData,
        aiPhoneSet: false,
      });

      console.log(`Restored original phone on GBP for business ${businessId}: ${storedData.originalPhone}`);
      return true;
    } catch (error: any) {
      console.error('Error restoring original phone number:', error);
      throw error;
    }
  }

  /**
   * Update the stored GBP data (helper for phone number tracking).
   */
  private async updateStoredData(businessId: number, data: GBPStoredData): Promise<void> {
    const integration = await db.select()
      .from(calendarIntegrations)
      .where(
        and(
          eq(calendarIntegrations.businessId, businessId),
          eq(calendarIntegrations.provider, PROVIDER)
        )
      )
      .limit(1);

    if (!integration.length) throw new Error('GBP integration not found');

    await db.update(calendarIntegrations)
      .set({
        data: JSON.stringify(data),
        updatedAt: new Date(),
      })
      .where(eq(calendarIntegrations.id, integration[0].id));
  }

  async saveSelectedLocation(
    businessId: number,
    account: GBPAccount,
    location: GBPLocation,
    bookingLinkName?: string
  ): Promise<void> {
    const integration = await db.select()
      .from(calendarIntegrations)
      .where(
        and(
          eq(calendarIntegrations.businessId, businessId),
          eq(calendarIntegrations.provider, PROVIDER)
        )
      )
      .limit(1);

    if (!integration.length) throw new Error('GBP integration not found');

    const existingData = JSON.parse(integration[0].data || '{}');
    const newData: GBPStoredData = {
      ...existingData,
      selectedAccount: account,
      selectedLocation: location,
      ...(bookingLinkName && { bookingLinkName }),
    };

    await db.update(calendarIntegrations)
      .set({
        data: JSON.stringify(newData),
        updatedAt: new Date(),
      })
      .where(eq(calendarIntegrations.id, integration[0].id));
  }

  async listReviews(businessId: number): Promise<GBPReview[]> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return [];

      const storedData = await this.getStoredData(businessId);
      if (!storedData?.selectedAccount || !storedData?.selectedLocation) {
        console.log(`[GBP] No location selected for business ${businessId}`);
        return [];
      }

      const accountName = storedData.selectedAccount.name;
      const locationName = storedData.selectedLocation.name;

      // Use My Business API v4 for reviews
      const url = `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews`;
      const res = await oauth2Client.request({ url });

      const data = res.data as any;
      return (data.reviews || []).map((r: any) => ({
        reviewId: r.reviewId || r.name,
        name: r.name,
        reviewerName: r.reviewer?.displayName || 'Anonymous',
        rating: r.starRating ? starRatingToNumber(r.starRating) : null,
        comment: r.comment || '',
        createTime: r.createTime,
        updateTime: r.updateTime,
        hasReply: !!r.reviewReply,
      }));
    } catch (error: any) {
      console.error('Error listing GBP reviews:', error?.message || error);
      if (error.code === 403 || error.code === 401) {
        throw new Error('Google Business Profile API access not enabled or insufficient permissions.');
      }
      throw error;
    }
  }

  async replyToReview(businessId: number, reviewName: string, comment: string): Promise<boolean> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) throw new Error('Not connected to Google Business Profile');

      const url = `https://mybusiness.googleapis.com/v4/${reviewName}/reply`;
      await oauth2Client.request({
        url,
        method: 'PUT',
        data: { comment },
      });

      console.log(`[GBP] Reply posted for review: ${reviewName}`);
      return true;
    } catch (error: any) {
      console.error('Error replying to review:', error?.message || error);
      if (error.code === 403) {
        throw new Error('Insufficient permissions to reply to reviews.');
      }
      throw error;
    }
  }

  async getStoredData(businessId: number): Promise<GBPStoredData | null> {
    try {
      const integration = await db.select()
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.businessId, businessId),
            eq(calendarIntegrations.provider, PROVIDER)
          )
        )
        .limit(1);

      if (!integration.length || !integration[0].data) return null;
      return JSON.parse(integration[0].data);
    } catch (error) {
      console.error('Error getting GBP stored data:', error);
      return null;
    }
  }
}
