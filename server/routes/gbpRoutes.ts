/**
 * Google Business Profile API Routes
 *
 * Handles OAuth flow and API calls for connecting/managing
 * Google Business Profile listings with booking links.
 */

import { Router } from 'express';
import { GoogleBusinessProfileService } from '../services/googleBusinessProfileService';
import { isAuthenticated } from '../auth';
import { storage } from '../storage';

const router = Router();
const gbpService = new GoogleBusinessProfileService();

// Get GBP connection status and stored data
router.get('/status/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const connected = await gbpService.isConnected(businessId);
    const data = connected ? await gbpService.getStoredData(businessId) : null;
    res.json({ connected, data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get OAuth URL for connecting GBP
router.get('/auth-url/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const url = gbpService.generateAuthUrl(businessId);
    if (!url) {
      return res.status(500).json({ error: 'Could not generate auth URL. Check Google credentials.' });
    }
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Handle Google OAuth callback (no auth — this is the redirect from Google)
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    await gbpService.handleCallback(code, state);

    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">&#10004;&#65039;</div>
            <h1 style="color: #333; margin-bottom: 8px;">Google Business Profile Connected!</h1>
            <p style="color: #666;">You can now manage your business listing and booking links.</p>
            <p style="color: #999; font-size: 14px;">This window will close shortly...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'gbp-connected', provider: 'google-business-profile' }, '*');
            }
            setTimeout(function() { window.close(); }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">&#10060;</div>
            <h1 style="color: #333; margin-bottom: 8px;">Error Connecting Google Business Profile</h1>
            <p style="color: #666;">${error.message || 'An unexpected error occurred.'}</p>
            <p style="color: #999; font-size: 14px;">Please close this window and try again.</p>
          </div>
        </body>
      </html>
    `);
  }
});

// List GBP accounts
router.get('/accounts/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const accounts = await gbpService.listAccounts(businessId);
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List locations for a GBP account
router.get('/locations/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const accountName = req.query.account as string;
    if (!accountName) {
      return res.status(400).json({ error: 'account query parameter required' });
    }
    const locations = await gbpService.listLocations(businessId, accountName);
    res.json(locations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Set booking link on a GBP location
router.post('/set-booking-link/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const { locationName, account, location } = req.body;

    if (!locationName || !account || !location) {
      return res.status(400).json({ error: 'locationName, account, and location are required' });
    }

    // Verify business has booking enabled
    const business = await storage.getBusiness(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (!business.bookingEnabled || !business.bookingSlug) {
      return res.status(400).json({
        error: 'Online booking must be enabled with a booking slug before connecting Google Business Profile.'
      });
    }

    const bookingUrl = `https://www.smallbizagent.ai/book/${business.bookingSlug}`;
    const placeActionLink = await gbpService.createOrUpdateBookingLink(
      businessId, locationName, bookingUrl
    );

    // Save selected account/location and booking link name
    await gbpService.saveSelectedLocation(businessId, account, location, placeActionLink.name);

    res.json({ success: true, placeActionLink, bookingUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove booking link from GBP location
router.delete('/booking-link/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const storedData = await gbpService.getStoredData(businessId);

    if (!storedData?.bookingLinkName) {
      return res.status(404).json({ error: 'No booking link found to remove' });
    }

    const deleted = await gbpService.deleteBookingLink(businessId, storedData.bookingLinkName);
    if (deleted) {
      // Clear the stored location data
      await gbpService.saveSelectedLocation(
        businessId,
        storedData.selectedAccount!,
        storedData.selectedLocation!,
        undefined
      );
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to remove booking link' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect GBP entirely
router.delete('/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);

    // Try to remove the booking link first
    const storedData = await gbpService.getStoredData(businessId);
    if (storedData?.bookingLinkName) {
      await gbpService.deleteBookingLink(businessId, storedData.bookingLinkName).catch(() => {});
    }

    const result = await gbpService.disconnect(businessId);
    if (result) {
      res.json({ success: true, message: 'Google Business Profile disconnected' });
    } else {
      res.status(500).json({ error: 'Failed to disconnect Google Business Profile' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
