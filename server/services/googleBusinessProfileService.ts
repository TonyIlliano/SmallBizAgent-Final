/**
 * Google Business Profile Integration Service
 *
 * Handles OAuth and API calls for managing Google Business Profile listings.
 * Allows business owners to add a "Book Appointment" link to their Google
 * Search and Maps listing, pointing to their SmallBizAgent booking page.
 */

import { db } from '../db';
import { calendarIntegrations, businesses } from '@shared/schema';
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

export interface GBPBusinessInfo {
  name?: string;
  address?: any;
  phone?: string;
  websiteUri?: string;
  description?: string;
  categories?: any;
  regularHours?: any;
  profile?: { description?: string };
}

export interface GBPFieldConflict {
  field: string;
  localValue: string | null;
  gbpValue: string | null;
  detectedAt: string;
}

export interface GBPStoredData {
  selectedAccount?: GBPAccount;
  selectedLocation?: GBPLocation;
  bookingLinkName?: string;
  originalPhone?: string; // Saved before we replace it with the AI number
  aiPhoneSet?: boolean;   // True if we've replaced the phone with the Twilio number
  cachedBusinessInfo?: GBPBusinessInfo;
  conflicts?: GBPFieldConflict[];
  syncMetadata?: { lastReviewSyncedAt?: string; fieldsLastPushed?: string };
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

  // ─── Business Info Sync ──────────────────────────────────────────────────────

  /**
   * Fetch full business info from GBP (name, address, phone, hours, description, category, website).
   */
  async getBusinessInfo(businessId: number): Promise<GBPBusinessInfo | null> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return null;

      const storedData = await this.getStoredData(businessId);
      if (!storedData?.selectedLocation) return null;

      const locationName = storedData.selectedLocation.name;
      const mybusinessInfo = google.mybusinessbusinessinformation({
        version: 'v1',
        auth: oauth2Client,
      });

      const response = await mybusinessInfo.locations.get({
        name: locationName,
        readMask: 'name,title,storefrontAddress,websiteUri,phoneNumbers,regularHours,profile,categories',
      });

      const loc = response.data;
      return {
        name: loc.title || undefined,
        address: loc.storefrontAddress || undefined,
        phone: loc.phoneNumbers?.primaryPhone || undefined,
        websiteUri: loc.websiteUri || undefined,
        description: loc.profile?.description || undefined,
        categories: loc.categories || undefined,
        regularHours: loc.regularHours || undefined,
      };
    } catch (error: any) {
      console.error('[GBP] Error fetching business info:', error?.message || error);
      throw error;
    }
  }

  /**
   * Push specified fields from local DB to GBP location via locations.patch.
   */
  async updateBusinessInfo(businessId: number, fields: string[]): Promise<boolean> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) throw new Error('Not connected to Google Business Profile');

      const storedData = await this.getStoredData(businessId);
      if (!storedData?.selectedLocation) throw new Error('No GBP location selected');

      const locationName = storedData.selectedLocation.name;
      const business = await storage.getBusiness(businessId);
      if (!business) throw new Error('Business not found');

      const mybusinessInfo = google.mybusinessbusinessinformation({
        version: 'v1',
        auth: oauth2Client,
      });

      const requestBody: any = {};
      const updateMaskParts: string[] = [];

      for (const field of fields) {
        switch (field) {
          case 'phone': {
            requestBody.phoneNumbers = { primaryPhone: business.phone };
            updateMaskParts.push('phoneNumbers');
            break;
          }
          case 'website': {
            const website = await storage.getWebsite(businessId);
            const siteUrl = website?.subdomain
              ? `${process.env.APP_URL || 'https://smallbizagent.ai'}/sites/${website.subdomain}`
              : business.website;
            requestBody.websiteUri = siteUrl;
            updateMaskParts.push('websiteUri');
            break;
          }
          case 'description': {
            requestBody.profile = { description: business.description };
            updateMaskParts.push('profile');
            break;
          }
          case 'address': {
            requestBody.storefrontAddress = {
              addressLines: business.address ? [business.address] : [],
              locality: business.city || '',
              administrativeArea: business.state || '',
              postalCode: business.zip || '',
              regionCode: 'US',
            };
            updateMaskParts.push('storefrontAddress');
            break;
          }
          case 'hours': {
            const hours = await storage.getBusinessHours(businessId);
            if (hours.length > 0) {
              const dayMap: Record<string, string> = {
                monday: 'MONDAY', tuesday: 'TUESDAY', wednesday: 'WEDNESDAY',
                thursday: 'THURSDAY', friday: 'FRIDAY', saturday: 'SATURDAY', sunday: 'SUNDAY',
              };
              const periods = hours
                .filter(h => !h.isClosed && h.open && h.close)
                .map(h => ({
                  openDay: dayMap[h.day.toLowerCase()] || h.day.toUpperCase(),
                  openTime: h.open,
                  closeDay: dayMap[h.day.toLowerCase()] || h.day.toUpperCase(),
                  closeTime: h.close,
                }));
              requestBody.regularHours = { periods };
              updateMaskParts.push('regularHours');
            }
            break;
          }
        }
      }

      if (updateMaskParts.length === 0) return false;

      await mybusinessInfo.locations.patch({
        name: locationName,
        updateMask: updateMaskParts.join(','),
        requestBody,
      });

      // Update sync metadata
      await this.updateStoredData(businessId, {
        ...storedData,
        syncMetadata: {
          ...storedData.syncMetadata,
          fieldsLastPushed: new Date().toISOString(),
        },
      });

      console.log(`[GBP] Pushed fields [${fields.join(', ')}] to GBP for business ${businessId}`);
      return true;
    } catch (error: any) {
      console.error('[GBP] Error pushing business info:', error?.message || error);
      throw error;
    }
  }

  /**
   * Full sync: pull from GBP → compare with local DB → detect conflicts → cache.
   */
  async syncBusinessData(businessId: number): Promise<{ conflicts: GBPFieldConflict[]; info: GBPBusinessInfo | null }> {
    try {
      const gbpInfo = await this.getBusinessInfo(businessId);
      if (!gbpInfo) return { conflicts: [], info: null };

      const business = await storage.getBusiness(businessId);
      if (!business) return { conflicts: [], info: gbpInfo };

      const conflicts: GBPFieldConflict[] = [];
      const now = new Date().toISOString();

      // Compare fields
      if (gbpInfo.phone && business.phone && gbpInfo.phone !== business.phone) {
        conflicts.push({ field: 'phone', localValue: business.phone, gbpValue: gbpInfo.phone, detectedAt: now });
      }
      if (gbpInfo.name && business.name && gbpInfo.name !== business.name) {
        conflicts.push({ field: 'name', localValue: business.name, gbpValue: gbpInfo.name, detectedAt: now });
      }
      if (gbpInfo.websiteUri && business.website && gbpInfo.websiteUri !== business.website) {
        conflicts.push({ field: 'website', localValue: business.website, gbpValue: gbpInfo.websiteUri, detectedAt: now });
      }
      if (gbpInfo.description && business.description && gbpInfo.description !== business.description) {
        conflicts.push({ field: 'description', localValue: business.description, gbpValue: gbpInfo.description, detectedAt: now });
      }

      // Cache results in stored data
      const storedData = await this.getStoredData(businessId);
      if (storedData) {
        await this.updateStoredData(businessId, {
          ...storedData,
          cachedBusinessInfo: gbpInfo,
          conflicts,
        });
      }

      // Update last synced timestamp on business
      await db.update(businesses)
        .set({ gbpLastSyncedAt: new Date() })
        .where(eq(businesses.id, businessId));

      console.log(`[GBP] Synced business data for ${businessId}: ${conflicts.length} conflicts`);
      return { conflicts, info: gbpInfo };
    } catch (error: any) {
      console.error('[GBP] Error syncing business data:', error?.message || error);
      return { conflicts: [], info: null };
    }
  }

  // ─── Review Sync ──────────────────────────────────────────────────────────────

  /**
   * Batch fetch reviews from GBP and upsert into local gbp_reviews table.
   * Auto-flags reviews with rating <= 2.
   */
  async syncReviews(businessId: number): Promise<{ synced: number; flagged: number }> {
    try {
      const reviews = await this.listReviews(businessId);
      let synced = 0;
      let flagged = 0;

      for (const review of reviews) {
        const isLowRating = (review.rating ?? 0) <= 2;
        if (isLowRating) flagged++;

        await storage.upsertGbpReview({
          businessId,
          gbpReviewId: review.reviewId,
          reviewerName: review.reviewerName,
          reviewerPhotoUrl: null,
          rating: review.rating,
          reviewText: review.comment || null,
          reviewDate: review.createTime ? new Date(review.createTime) : null,
          replyText: review.hasReply ? '(reply exists on GBP)' : null,
          replyDate: null,
          flagged: isLowRating,
        });
        synced++;
      }

      // Update sync metadata
      const storedData = await this.getStoredData(businessId);
      if (storedData) {
        await this.updateStoredData(businessId, {
          ...storedData,
          syncMetadata: {
            ...storedData.syncMetadata,
            lastReviewSyncedAt: new Date().toISOString(),
          },
        });
      }

      console.log(`[GBP] Synced ${synced} reviews for business ${businessId} (${flagged} flagged)`);
      return { synced, flagged };
    } catch (error: any) {
      console.error('[GBP] Error syncing reviews:', error?.message || error);
      return { synced: 0, flagged: 0 };
    }
  }

  // ─── Local Posts ──────────────────────────────────────────────────────────────

  /**
   * Publish a local post to GBP via the v4 API.
   */
  async createLocalPost(
    businessId: number,
    content: string,
    cta?: { actionType: string; url: string }
  ): Promise<{ success: boolean; gbpPostId?: string }> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) throw new Error('Not connected to Google Business Profile');

      const storedData = await this.getStoredData(businessId);
      if (!storedData?.selectedAccount || !storedData?.selectedLocation) {
        throw new Error('No GBP location selected');
      }

      const accountName = storedData.selectedAccount.name;
      const locationName = storedData.selectedLocation.name;

      const postBody: any = {
        languageCode: 'en',
        summary: content,
        topicType: 'STANDARD',
      };

      if (cta) {
        postBody.callToAction = {
          actionType: cta.actionType,
          url: cta.url,
        };
      }

      const url = `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/localPosts`;
      const res = await oauth2Client.request({
        url,
        method: 'POST',
        data: postBody,
      });

      const postData = res.data as any;
      console.log(`[GBP] Published local post for business ${businessId}`);
      return { success: true, gbpPostId: postData.name };
    } catch (error: any) {
      console.error('[GBP] Error creating local post:', error?.message || error);
      throw error;
    }
  }

  /**
   * List recent local posts from GBP.
   */
  async listLocalPosts(businessId: number): Promise<any[]> {
    try {
      const oauth2Client = await this.getAuthenticatedClient(businessId);
      if (!oauth2Client) return [];

      const storedData = await this.getStoredData(businessId);
      if (!storedData?.selectedAccount || !storedData?.selectedLocation) return [];

      const accountName = storedData.selectedAccount.name;
      const locationName = storedData.selectedLocation.name;

      const url = `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/localPosts`;
      const res = await oauth2Client.request({ url });
      const data = res.data as any;
      return data.localPosts || [];
    } catch (error: any) {
      console.error('[GBP] Error listing local posts:', error?.message || error);
      return [];
    }
  }

  // ─── SEO Score ────────────────────────────────────────────────────────────────

  /**
   * Calculate a local SEO score (0-100) based on GBP completeness, reviews, and posts.
   */
  async calculateSeoScore(businessId: number): Promise<{
    score: number;
    breakdown: { category: string; label: string; points: number; maxPoints: number; met: boolean }[];
  }> {
    try {
      const business = await storage.getBusiness(businessId);
      const storedData = await this.getStoredData(businessId);
      const reviewCount = await storage.countGbpReviews(businessId);
      const posts = await storage.getGbpPosts(businessId, { status: 'published', limit: 10 });

      const breakdown: { category: string; label: string; points: number; maxPoints: number; met: boolean }[] = [];
      let score = 0;

      // GBP Connected (10 pts)
      const connected = !!storedData?.selectedLocation;
      breakdown.push({ category: 'connection', label: 'Google Business Profile connected', points: connected ? 10 : 0, maxPoints: 10, met: connected });
      if (connected) score += 10;

      // Business name set (5 pts)
      const hasName = !!business?.name;
      breakdown.push({ category: 'profile', label: 'Business name set', points: hasName ? 5 : 0, maxPoints: 5, met: hasName });
      if (hasName) score += 5;

      // Phone set (5 pts)
      const hasPhone = !!business?.phone;
      breakdown.push({ category: 'profile', label: 'Phone number set', points: hasPhone ? 5 : 0, maxPoints: 5, met: hasPhone });
      if (hasPhone) score += 5;

      // Address set (5 pts)
      const hasAddress = !!business?.address;
      breakdown.push({ category: 'profile', label: 'Address set', points: hasAddress ? 5 : 0, maxPoints: 5, met: hasAddress });
      if (hasAddress) score += 5;

      // Description set (10 pts)
      const hasDesc = !!business?.description;
      breakdown.push({ category: 'profile', label: 'Business description added', points: hasDesc ? 10 : 0, maxPoints: 10, met: hasDesc });
      if (hasDesc) score += 10;

      // Website set (5 pts)
      const hasWebsite = !!business?.website || !!(await storage.getWebsite(businessId))?.subdomain;
      breakdown.push({ category: 'profile', label: 'Website linked', points: hasWebsite ? 5 : 0, maxPoints: 5, met: hasWebsite });
      if (hasWebsite) score += 5;

      // Business hours set (10 pts)
      const hours = await storage.getBusinessHours(businessId);
      const hasHours = hours.length > 0;
      breakdown.push({ category: 'profile', label: 'Business hours set', points: hasHours ? 10 : 0, maxPoints: 10, met: hasHours });
      if (hasHours) score += 10;

      // Booking link active (5 pts)
      const hasBooking = !!storedData?.bookingLinkName;
      breakdown.push({ category: 'engagement', label: 'Booking link on Google', points: hasBooking ? 5 : 0, maxPoints: 5, met: hasBooking });
      if (hasBooking) score += 5;

      // Has reviews (15 pts: 5 for any, 10 for 5+, 15 for 10+)
      const reviewPts = reviewCount >= 10 ? 15 : reviewCount >= 5 ? 10 : reviewCount > 0 ? 5 : 0;
      breakdown.push({ category: 'reviews', label: `${reviewCount} review${reviewCount !== 1 ? 's' : ''} (10+ ideal)`, points: reviewPts, maxPoints: 15, met: reviewCount >= 10 });
      score += reviewPts;

      // Review response rate (10 pts)
      const repliedCount = await storage.countGbpReviews(businessId, { hasReply: true });
      const responseRate = reviewCount > 0 ? repliedCount / reviewCount : 0;
      const responsePts = responseRate >= 0.8 ? 10 : responseRate >= 0.5 ? 5 : 0;
      breakdown.push({ category: 'reviews', label: `${Math.round(responseRate * 100)}% reviews replied to (80%+ ideal)`, points: responsePts, maxPoints: 10, met: responseRate >= 0.8 });
      score += responsePts;

      // Recent posts (15 pts: 5 for any, 10 for 2+, 15 for 4+)
      const recentPostCount = posts.length;
      const postPts = recentPostCount >= 4 ? 15 : recentPostCount >= 2 ? 10 : recentPostCount > 0 ? 5 : 0;
      breakdown.push({ category: 'posts', label: `${recentPostCount} recent post${recentPostCount !== 1 ? 's' : ''} (4+ ideal)`, points: postPts, maxPoints: 15, met: recentPostCount >= 4 });
      score += postPts;

      // Logo set (5 pts)
      const hasLogo = !!business?.logoUrl;
      breakdown.push({ category: 'profile', label: 'Logo uploaded', points: hasLogo ? 5 : 0, maxPoints: 5, met: hasLogo });
      if (hasLogo) score += 5;

      return { score: Math.min(score, 100), breakdown };
    } catch (error: any) {
      console.error('[GBP] Error calculating SEO score:', error?.message || error);
      return { score: 0, breakdown: [] };
    }
  }

  /**
   * Get all businessIds that have GBP connected (for scheduled sync).
   */
  async getConnectedBusinessIds(): Promise<number[]> {
    try {
      const integrations = await db.select({ businessId: calendarIntegrations.businessId })
        .from(calendarIntegrations)
        .where(eq(calendarIntegrations.provider, PROVIDER));
      return integrations.map(i => i.businessId);
    } catch (error) {
      console.error('[GBP] Error getting connected business IDs:', error);
      return [];
    }
  }
}

/**
 * Run GBP sync for all connected businesses.
 * Called by the scheduler every 24 hours.
 */
export async function runGbpSync(): Promise<void> {
  const gbpService = new GoogleBusinessProfileService();
  const businessIds = await gbpService.getConnectedBusinessIds();

  console.log(`[GBP Sync] Starting sync for ${businessIds.length} connected businesses`);

  for (const businessId of businessIds) {
    try {
      await gbpService.syncBusinessData(businessId);
      await gbpService.syncReviews(businessId);
    } catch (error: any) {
      console.error(`[GBP Sync] Error syncing business ${businessId}:`, error?.message || error);
    }
    // Rate limit: 2s pause between businesses
    if (businessIds.indexOf(businessId) < businessIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[GBP Sync] Completed sync for ${businessIds.length} businesses`);
}
