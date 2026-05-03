/**
 * Google Business Profile API Routes
 *
 * Handles OAuth flow and API calls for connecting/managing
 * Google Business Profile listings with booking links,
 * business info sync, review management, local posts, and SEO scoring.
 */

import { Router } from 'express';
import { GoogleBusinessProfileService } from '../services/googleBusinessProfileService';
import { logAndSwallow } from '../utils/safeAsync';
import { isAuthenticated } from '../auth';
import { belongsToBusiness } from '../middleware/auth';
import { storage } from '../storage';
import { claudeText } from '../services/claudeClient';

const router = Router();
const gbpService = new GoogleBusinessProfileService();

// Get GBP connection status and stored data
router.get('/status/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
    const connected = await gbpService.isConnected(businessId);
    const data = connected ? await gbpService.getStoredData(businessId) : null;
    res.json({ connected, data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get OAuth URL for connecting GBP
router.get('/auth-url/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
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

    // ── Onboarding flow: state starts with "onboarding_" ──
    // Fetch business data directly from GBP and return via postMessage (no DB save)
    if (state.startsWith('onboarding_')) {
      console.log(`[GBP Onboarding] OAuth callback for user state=${state}`);
      try {
        const { google } = await import('googleapis');
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GBP_REDIRECT_URI ||
          (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/gbp/google/callback` : 'http://localhost:5000/api/gbp/google/callback');

        const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        let businessData: any = {};
        try {
          const accountsRes = await oauth2Client.request({ url: 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts' });
          const accounts = (accountsRes.data as any)?.accounts || [];

          if (accounts.length > 0) {
            const accountName = accounts[0].name;
            const mybusinessInfo = google.mybusinessbusinessinformation({ version: 'v1', auth: oauth2Client });

            let locations: any[] = [];
            try {
              const locRes = await mybusinessInfo.accounts.locations.list({
                parent: accountName,
                readMask: 'name,title,storefrontAddress,websiteUri,phoneNumbers,regularHours,profile,categories',
              });
              locations = locRes.data?.locations || [];
            } catch {
              try {
                const locRes = await oauth2Client.request({
                  url: 'https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations',
                  params: { readMask: 'name,title,storefrontAddress,websiteUri,phoneNumbers,regularHours,profile,categories' },
                });
                locations = (locRes.data as any)?.locations || [];
              } catch { /* ignore */ }
            }

            if (locations.length > 0) {
              const loc = locations[0];
              const addr = loc.storefrontAddress;
              const primaryCategory = loc.categories?.primaryCategory?.displayName || '';

              businessData = {
                name: loc.title || '',
                phone: loc.phoneNumbers?.primaryPhone || '',
                address: addr ? [addr.addressLines?.[0]].filter(Boolean).join(', ') : '',
                city: addr?.locality || '',
                state: addr?.administrativeArea || '',
                zipCode: addr?.postalCode || '',
                website: loc.websiteUri || '',
                description: loc.profile?.description || '',
                industry: mapGbpCategoryToIndustry(primaryCategory),
                gbpCategory: primaryCategory,
                hours: loc.regularHours?.periods || [],
                locationCount: locations.length,
              };
            }
          }
        } catch (fetchErr: any) {
          console.error('[GBP Onboarding] Error fetching business data:', fetchErr?.message);
        }

        const safeData = JSON.stringify(businessData).replace(/'/g, "\\'").replace(/</g, '\\u003c');
        const dataKeys = Object.keys(businessData).filter(k => businessData[k] && businessData[k] !== '').join(', ') || '(empty)';
        return res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb;">
              <div style="text-align: center; padding: 40px; max-width: 500px;">
                <div style="font-size: 48px; margin-bottom: 16px;">&#10004;&#65039;</div>
                <h1 style="color: #333; margin-bottom: 8px;">${businessData.name ? 'Business Info Found!' : 'Connected!'}</h1>
                <p style="color: #666;">${businessData.name ? 'Sending data to the signup form...' : 'Could not find business data. Fill in manually.'}</p>
                <div id="status" style="color: #999; font-size: 13px; margin-top: 20px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e5e7eb; text-align: left;">
                  <div style="font-weight: 600; color: #374151; margin-bottom: 6px;">Diagnostic info:</div>
                  <div>Fields received: <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">${dataKeys}</code></div>
                  <div id="opener-status" style="margin-top: 4px;">Checking opener...</div>
                  <div id="post-status" style="margin-top: 4px;"></div>
                </div>
                <p style="color: #999; font-size: 12px; margin-top: 16px;" id="close-msg">This window will close in 4 seconds (longer for debugging)...</p>
              </div>
              <script>
                (function() {
                  var statusEl = function(id) { return document.getElementById(id); };
                  var setText = function(id, text) {
                    var el = statusEl(id);
                    if (el) el.textContent = text;
                  };

                  // Check opener availability
                  var hasOpener = !!window.opener;
                  setText('opener-status', hasOpener
                    ? 'window.opener: AVAILABLE'
                    : 'window.opener: NULL (COOP/popup blocker — message cannot be sent)');
                  console.log('[GBP Popup] window.opener =', hasOpener ? 'available' : 'null');

                  if (hasOpener) {
                    try {
                      var data = JSON.parse('${safeData}');
                      console.log('[GBP Popup] Posting message to opener:', data);
                      window.opener.postMessage({ type: 'gbp-onboarding-data', data: data }, '*');
                      setText('post-status', 'postMessage: SENT to opener');
                      console.log('[GBP Popup] postMessage call completed without throwing');
                    } catch (e) {
                      setText('post-status', 'postMessage FAILED: ' + (e && e.message ? e.message : e));
                      console.error('[GBP Popup] postMessage threw:', e);
                    }
                  } else {
                    setText('post-status', 'Cannot send data because opener is null. Close this and try again — if it persists, the parent page security policy is blocking us.');
                  }

                  // Auto-close after 4s if everything looks fine, longer if opener is null so user can read the warning
                  var delay = hasOpener ? 4000 : 12000;
                  setTimeout(function() { window.close(); }, delay);
                })();
              </script>
            </body>
          </html>
        `);
      } catch (onboardingErr: any) {
        console.error('[GBP Onboarding] Callback error:', onboardingErr);
        return res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb;">
              <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px;">&#10060;</div>
                <h1 style="color: #333;">Could not fetch business info</h1>
                <p style="color: #666;">You can still fill in your details manually.</p>
              </div>
              <script>setTimeout(function() { window.close(); }, 3000);</script>
            </body>
          </html>
        `);
      }
    }

    console.log(`[GBP] OAuth callback received: code length=${code.length}, state=${state}`);
    await gbpService.handleCallback(code, state);

    // Fire-and-forget: auto-select location if only one, then run initial sync
    const businessId = parseInt(state);
    if (!isNaN(businessId)) {
      console.log(`[GBP] Starting fire-and-forget auto-select for business ${businessId}`);
      (async () => {
        try {
          // Small delay to ensure token is fully persisted before syncing
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Try to auto-select the first account/location if there's only one
          const storedData = await gbpService.getStoredData(businessId);
          console.log(`[GBP] Callback auto-select step 1: storedData keys=${storedData ? Object.keys(storedData).join(',') : 'null'}, hasSelectedLocation=${!!storedData?.selectedLocation}`);
          if (!storedData?.selectedLocation) {
            try {
              console.log(`[GBP] Callback auto-select step 2: calling listAccounts...`);
              const accounts = await gbpService.listAccounts(businessId);
              console.log(`[GBP] Callback auto-select step 2 result: ${accounts.length} accounts found: ${JSON.stringify(accounts.map(a => a.name))}`);
              if (accounts.length === 1) {
                console.log(`[GBP] Callback auto-select step 3: calling listLocations for ${accounts[0].name}...`);
                const locations = await gbpService.listLocations(businessId, accounts[0].name);
                console.log(`[GBP] Callback auto-select step 3 result: ${locations.length} locations found: ${JSON.stringify(locations.map(l => ({ name: l.name, title: l.title })))}`);
                if (locations.length === 1) {
                  await gbpService.saveSelectedLocation(businessId, accounts[0], locations[0]);
                  console.log(`[GBP] Auto-selected location "${locations[0].title}" for business ${businessId}`);
                } else {
                  console.log(`[GBP] Auto-select skipped: ${locations.length} locations (need exactly 1)`);
                }
              } else {
                console.log(`[GBP] Auto-select skipped: ${accounts.length} accounts (need exactly 1)`);
              }
            } catch (autoSelectErr: any) {
              console.error(`[GBP] Auto-select location error:`, autoSelectErr?.message || autoSelectErr, autoSelectErr?.stack?.split('\n').slice(0,3).join('\n'));
            }
          } else {
            console.log(`[GBP] Auto-select skipped: location already selected — ${storedData.selectedLocation.title}`);
          }

          // Now try syncing (will only work if a location is selected)
          console.log(`[GBP] Callback auto-select step 4: starting syncBusinessData...`);
          const result = await gbpService.syncBusinessData(businessId);
          console.log(`[GBP] Initial sync after connect for business ${businessId}: info=${!!result.info}, autoPopulated=${result.autoPopulated.length}, conflicts=${result.conflicts.length}`);
          // Also sync reviews on initial connect
          await gbpService.syncReviews(businessId);
          console.log(`[GBP] Callback auto-select COMPLETE for business ${businessId}`);
        } catch (syncErr: any) {
          console.error(`[GBP] Initial sync error for business ${businessId}:`, syncErr?.message || syncErr, syncErr?.stack?.split('\n').slice(0,3).join('\n'));
        }
      })();
    }

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

// ── Onboarding GBP: Pre-fill business data without requiring a business record ──

// Get OAuth URL for onboarding (no businessId needed yet)
// Uses the SAME redirect URI as regular GBP auth — the callback detects "onboarding_" prefix
router.get('/onboarding/auth-url', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    // Generate URL with state=0, then replace with onboarding prefix
    const url = gbpService.generateAuthUrl(0);
    if (!url) {
      return res.status(500).json({ error: 'Could not generate auth URL. Check Google credentials.' });
    }
    const onboardingUrl = url.replace('state=0', `state=onboarding_${userId}`);
    res.json({ url: onboardingUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Map a GBP category name to our industry list
 */
function mapGbpCategoryToIndustry(category: string): string {
  if (!category) return '';
  const c = category.toLowerCase();
  if (c.includes('barber') || c.includes('salon') || c.includes('hair') || c.includes('beauty') || c.includes('nail') || c.includes('spa')) return 'Barber/Salon';
  if (c.includes('restaurant') || c.includes('cafe') || c.includes('pizza') || c.includes('food') || c.includes('bakery') || c.includes('bar')) return 'Restaurant';
  if (c.includes('plumb')) return 'Plumbing';
  if (c.includes('electric')) return 'Electrical';
  if (c.includes('landscap') || c.includes('lawn') || c.includes('garden')) return 'Landscaping';
  if (c.includes('clean') || c.includes('maid') || c.includes('janitorial')) return 'Cleaning';
  if (c.includes('hvac') || c.includes('heating') || c.includes('air condition') || c.includes('cooling')) return 'HVAC';
  if (c.includes('paint')) return 'Painting';
  if (c.includes('roof')) return 'Roofing';
  if (c.includes('floor')) return 'Flooring';
  if (c.includes('pest') || c.includes('exterminator')) return 'Pest Control';
  if (c.includes('pool')) return 'Pool Maintenance';
  if (c.includes('auto') || c.includes('car') || c.includes('mechanic') || c.includes('tire') || c.includes('body shop')) return 'Auto Repair';
  if (c.includes('computer') || c.includes('phone repair') || c.includes('it service')) return 'Computer Repair';
  if (c.includes('construct') || c.includes('contractor') || c.includes('builder')) return 'General Contracting';
  if (c.includes('carpent') || c.includes('cabinet') || c.includes('woodwork')) return 'Carpentry';
  if (c.includes('appliance')) return 'Appliance Repair';
  return 'Other';
}

// Debug GBP connection (returns detailed diagnostic info)
router.get('/debug/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const diagnostics: any = { businessId, timestamp: new Date().toISOString() };

    // 1. Check integration row exists
    const connected = await gbpService.isConnected(businessId);
    diagnostics.connected = connected;

    // 2. Check stored data
    const storedData = await gbpService.getStoredData(businessId);
    diagnostics.storedData = storedData ? {
      hasSelectedAccount: !!storedData.selectedAccount,
      hasSelectedLocation: !!storedData.selectedLocation,
      selectedLocationTitle: storedData.selectedLocation?.title || null,
      selectedLocationName: storedData.selectedLocation?.name || null,
      dataKeys: Object.keys(storedData),
    } : null;

    if (!connected) {
      diagnostics.message = 'Not connected to GBP';
      return res.json(diagnostics);
    }

    // 3. Try listing accounts
    try {
      const accounts = await gbpService.listAccounts(businessId);
      diagnostics.accounts = { count: accounts.length, accounts };
    } catch (accErr: any) {
      diagnostics.accounts = { error: accErr?.message || String(accErr), code: accErr?.code, status: accErr?.response?.status };
    }

    // 4. If we have accounts, try listing locations for the first one
    if (diagnostics.accounts?.count > 0) {
      try {
        const locations = await gbpService.listLocations(businessId, diagnostics.accounts.accounts[0].name);
        diagnostics.locations = { count: locations.length, locations };
      } catch (locErr: any) {
        diagnostics.locations = { error: locErr?.message || String(locErr), code: locErr?.code };
      }
    }

    // 5. Check if the GBP scheduler has seen this business
    try {
      const connectedIds = await gbpService.getConnectedBusinessIds();
      diagnostics.inSchedulerPool = connectedIds.includes(businessId);
    } catch (err) { console.error('[GBPRoutes] Error:', err instanceof Error ? err.message : err); }

    res.json(diagnostics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List GBP accounts
router.get('/accounts/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
    console.log(`[GBP] GET /accounts/${businessId} — request received`);
    const accounts = await gbpService.listAccounts(businessId);
    console.log(`[GBP] GET /accounts/${businessId} — returning ${accounts.length} accounts`);
    res.json(accounts);
  } catch (error: any) {
    console.error(`[GBP] GET /accounts — error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// List locations for a GBP account
router.get('/locations/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
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
router.post('/set-booking-link/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
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

    const bookingUrl = `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}`;
    const placeActionLink = await gbpService.createOrUpdateBookingLink(
      businessId, locationName, bookingUrl
    );

    // Save selected account/location and booking link name
    await gbpService.saveSelectedLocation(businessId, account, location, placeActionLink.name);

    // Fire-and-forget: sync business data now that a location is selected
    gbpService.syncBusinessData(businessId).catch((err: any) => {
      console.error(`[GBP] Post-location-select sync error:`, err?.message || err);
    });

    res.json({ success: true, placeActionLink, bookingUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Select a GBP account + location (does NOT require booking to be enabled)
router.post('/select-location/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
    const { account, location } = req.body;

    if (!account || !location || !account.name || !location.name) {
      return res.status(400).json({ error: 'account and location objects are required (each with a name property)' });
    }

    // Save selected account/location (no booking link)
    await gbpService.saveSelectedLocation(businessId, account, location);

    // Fire-and-forget: sync business data + reviews now that a location is selected
    (async () => {
      try {
        const syncResult = await gbpService.syncBusinessData(businessId);
        console.log(`[GBP] Post-location-select sync: ${syncResult.autoPopulated.length} auto-populated, ${syncResult.conflicts.length} conflicts`);
        await gbpService.syncReviews(businessId);
      } catch (err: any) {
        console.error(`[GBP] Post-location-select sync error:`, err?.message || err);
      }
    })();

    res.json({ success: true, selectedLocation: location });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current phone numbers for a GBP location
router.get('/phone-numbers/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
    const storedData = await gbpService.getStoredData(businessId);

    if (!storedData?.selectedLocation?.name) {
      return res.status(400).json({ error: 'No location selected. Please select a location first.' });
    }

    const phoneNumbers = await gbpService.getPhoneNumbers(businessId, storedData.selectedLocation.name);
    res.json({
      ...phoneNumbers,
      aiPhoneSet: storedData.aiPhoneSet || false,
      originalPhone: storedData.originalPhone || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Set AI receptionist phone number on GBP listing
router.post('/set-ai-phone/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }

    // Get the business's provisioned Twilio phone number
    const business = await storage.getBusiness(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (!business.twilioPhoneNumber) {
      return res.status(400).json({
        error: 'No AI receptionist phone number provisioned. Please set up your AI receptionist first.'
      });
    }

    const storedData = await gbpService.getStoredData(businessId);
    if (!storedData?.selectedLocation?.name) {
      return res.status(400).json({ error: 'No location selected. Please select a location first.' });
    }

    const result = await gbpService.setAIPhoneNumber(
      businessId,
      storedData.selectedLocation.name,
      business.twilioPhoneNumber
    );

    res.json({
      success: true,
      aiPhoneNumber: business.twilioPhoneNumber,
      originalPhone: result.originalPhone,
      message: 'Google listing phone number updated to AI receptionist number',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restore original phone number on GBP listing
router.post('/restore-phone/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
    const storedData = await gbpService.getStoredData(businessId);

    if (!storedData?.selectedLocation?.name) {
      return res.status(400).json({ error: 'No location selected.' });
    }

    await gbpService.restoreOriginalPhoneNumber(businessId, storedData.selectedLocation.name);

    res.json({
      success: true,
      restoredPhone: storedData.originalPhone,
      message: 'Original phone number restored on Google listing',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove booking link from GBP location
router.delete('/booking-link/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }
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
router.delete('/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }

    // Try to remove the booking link first
    const storedData = await gbpService.getStoredData(businessId);
    if (storedData?.bookingLinkName) {
      await gbpService.deleteBookingLink(businessId, storedData.bookingLinkName).catch(logAndSwallow('GBPRoutes'));
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

// ─── New: Business Info Sync ──────────────────────────────────────────────────

// Full sync from GBP (pull business info + reviews)
router.post('/sync/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const [syncResult, reviewResult] = await Promise.all([
      gbpService.syncBusinessData(businessId),
      gbpService.syncReviews(businessId),
    ]);

    res.json({
      success: true,
      conflicts: syncResult.conflicts,
      businessInfo: syncResult.info,
      autoPopulated: syncResult.autoPopulated,
      reviewsSynced: reviewResult.synced,
      reviewsFlagged: reviewResult.flagged,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get cached/fresh business info from GBP
router.get('/business-info/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const storedData = await gbpService.getStoredData(businessId);

    // Return cached if available and fresh (< 1 hour), otherwise fetch live
    if (storedData?.cachedBusinessInfo) {
      // Also fetch the local business data so the frontend can show actual local values
      const business = await storage.getBusiness(businessId);
      const businessHours = await storage.getBusinessHours(businessId);
      res.json({
        info: storedData.cachedBusinessInfo,
        conflicts: storedData.conflicts || [],
        cached: true,
        localBusiness: business ? {
          name: business.name,
          phone: business.phone,
          website: business.website,
          description: business.description,
          address: business.address,
          city: business.city,
          state: business.state,
          zip: business.zip,
        } : null,
        hasLocalHours: businessHours.length > 0,
      });
    } else {
      const result = await gbpService.syncBusinessData(businessId);
      const business = await storage.getBusiness(businessId);
      const businessHours = await storage.getBusinessHours(businessId);
      res.json({
        info: result.info,
        conflicts: result.conflicts,
        autoPopulated: result.autoPopulated,
        cached: false,
        localBusiness: business ? {
          name: business.name,
          phone: business.phone,
          website: business.website,
          description: business.description,
          address: business.address,
          city: business.city,
          state: business.state,
          zip: business.zip,
        } : null,
        hasLocalHours: businessHours.length > 0,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Push specified fields to GBP
router.post('/push/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const { fields } = req.body;
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: 'fields array is required' });
    }

    const validFields = ['phone', 'website', 'description', 'address', 'hours'];
    const invalid = fields.filter((f: string) => !validFields.includes(f));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid fields: ${invalid.join(', ')}. Valid: ${validFields.join(', ')}` });
    }

    const success = await gbpService.updateBusinessInfo(businessId, fields);
    res.json({ success, pushedFields: fields });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve a specific field conflict
router.post('/resolve-conflict/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const { field, resolution } = req.body;
    if (!field || !resolution) return res.status(400).json({ error: 'field and resolution required' });
    if (!['keep_local', 'keep_gbp'].includes(resolution)) {
      return res.status(400).json({ error: 'resolution must be keep_local or keep_gbp' });
    }

    const storedData = await gbpService.getStoredData(businessId);
    if (!storedData) return res.status(400).json({ error: 'No GBP data found' });

    const conflicts = storedData.conflicts || [];
    const conflict = conflicts.find(c => c.field === field);
    if (!conflict) return res.status(404).json({ error: `No conflict found for field: ${field}` });

    if (resolution === 'keep_local') {
      // Push local value to GBP
      await gbpService.updateBusinessInfo(businessId, [field]);
    } else {
      // Accept GBP value into local DB
      const business = await storage.getBusiness(businessId);
      if (business && conflict.gbpValue) {
        const updates: any = {};
        if (field === 'phone') updates.phone = conflict.gbpValue;
        if (field === 'name') updates.name = conflict.gbpValue;
        if (field === 'website') updates.website = conflict.gbpValue;
        if (field === 'description') updates.description = conflict.gbpValue;
        if (Object.keys(updates).length > 0) {
          await storage.updateBusiness(businessId, updates);
        }
      }
    }

    // Remove the resolved conflict
    const remainingConflicts = conflicts.filter(c => c.field !== field);
    // Update stored data so conflict is removed from cache
    const freshData = await gbpService.getStoredData(businessId);
    if (freshData) {
      // We can't call private updateStoredData directly, but sync will re-evaluate
      // For now, just re-sync to clear the conflict
      await gbpService.syncBusinessData(businessId);
    }

    res.json({ success: true, remainingConflicts: remainingConflicts.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── New: Review Management ─────────────────────────────────────────────────

// Batch review sync from GBP
router.post('/reviews/sync/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const result = await gbpService.syncReviews(businessId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List local reviews (from gbp_reviews table)
router.get('/reviews/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const filters: any = { limit, offset };
    if (req.query.flagged === 'true') filters.flagged = true;
    if (req.query.hasReply === 'true') filters.hasReply = true;
    if (req.query.hasReply === 'false') filters.hasReply = false;
    if (req.query.minRating) filters.minRating = parseInt(req.query.minRating as string);
    if (req.query.maxRating) filters.maxRating = parseInt(req.query.maxRating as string);

    const [reviews, total, summary] = await Promise.all([
      storage.getGbpReviews(businessId, filters),
      storage.countGbpReviews(businessId, {
        flagged: filters.flagged,
        hasReply: filters.hasReply,
      }),
      storage.getGbpReviewStats(businessId),
    ]);

    res.json({
      reviews,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reply to a review on GBP
router.post('/reviews/:reviewId/reply', isAuthenticated, async (req, res) => {
  try {
    const reviewId = parseInt(req.params.reviewId);
    if (isNaN(reviewId)) return res.status(400).json({ error: "Invalid review ID" });

    const { comment } = req.body;
    if (!comment || typeof comment !== 'string') {
      return res.status(400).json({ error: 'comment is required' });
    }

    // Get the local review by ID
    const review = await storage.getGbpReviewById(reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    // Check ownership (supports multi-location via user_business_access)
    const { checkBelongsToBusinessAsync } = await import('../middleware/auth');
    const hasAccess = await checkBelongsToBusinessAsync(req.user, review.businessId);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const businessId = review.businessId;

    // The gbpReviewId should be the full resource name for the GBP API
    await gbpService.replyToReview(businessId, review.gbpReviewId, comment);

    // Update local record
    await storage.updateGbpReview(reviewId, {
      replyText: comment,
      replyDate: new Date(),
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// AI-suggest a reply for a review
router.post('/reviews/:reviewId/suggest-reply', isAuthenticated, async (req, res) => {
  try {
    const reviewId = parseInt(req.params.reviewId);
    if (isNaN(reviewId)) return res.status(400).json({ error: "Invalid review ID" });

    const review = await storage.getGbpReviewById(reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    // Check ownership (supports multi-location via user_business_access)
    const { checkBelongsToBusinessAsync } = await import('../middleware/auth');
    const hasAccess = await checkBelongsToBusinessAsync(req.user, review.businessId);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const businessId = review.businessId;
    const business = await storage.getBusiness(businessId);

    const suggestedReply = await claudeText({
      system: `You are a professional review response writer for ${business?.name || 'a local business'} (${business?.industry || 'service business'}). Write a warm, professional reply to the customer review. Keep it concise (2-3 sentences). If the review is negative, acknowledge concerns and offer to make it right. Never be defensive.`,
      prompt: `Review (${review.rating} stars): "${review.reviewText || '(no text)'}"\nReviewer: ${review.reviewerName || 'Customer'}`,
      maxTokens: 200,
    });

    res.json({ suggestedReply });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── New: GBP Posts ──────────────────────────────────────────────────────────

// AI-generate a GBP post draft
router.post('/posts/generate/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const business = await storage.getBusiness(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const services = await storage.getServices(businessId);

    const content = await claudeText({
      system: `You are a social media manager for ${business.name} (${business.industry || 'local business'}). Generate a Google Business Profile post that is engaging, professional, and drives customer action. Keep it under 300 words. Include a clear call-to-action. Do NOT include hashtags (GBP doesn't use them).`,
      prompt: `Business: ${business.name}\nIndustry: ${business.industry || 'general'}\nServices: ${services.map(s => s.name).join(', ') || 'N/A'}\nDescription: ${business.description || 'N/A'}\n\nGenerate a GBP post.`,
      maxTokens: 400,
    });

    // Save as draft
    const post = await storage.createGbpPost({
      businessId,
      content,
      status: 'draft',
    });

    res.json({ post });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Publish a draft post to GBP
router.post('/posts/publish/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const { postId, content, callToAction, callToActionUrl } = req.body;
    if (!postId) return res.status(400).json({ error: 'postId required' });

    // Get the post
    const posts = await storage.getGbpPosts(businessId);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const postContent = content || post.content;
    const cta = callToAction && callToActionUrl
      ? { actionType: callToAction, url: callToActionUrl }
      : undefined;

    const result = await gbpService.createLocalPost(businessId, postContent, cta);

    if (result.success) {
      await storage.updateGbpPost(postId, {
        content: postContent,
        status: 'published',
        gbpPostId: result.gbpPostId || null,
        publishedAt: new Date(),
        callToAction: callToAction || null,
        callToActionUrl: callToActionUrl || null,
      });
    } else {
      await storage.updateGbpPost(postId, { status: 'failed' });
    }

    res.json({ success: result.success, gbpPostId: result.gbpPostId });
  } catch (error: any) {
    await storage.updateGbpPost(parseInt(req.body.postId), { status: 'failed' }).catch(logAndSwallow('GBPRoutes'));
    res.status(500).json({ error: error.message });
  }
});

// List posts (drafts + published)
router.get('/posts/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const status = req.query.status as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const posts = await storage.getGbpPosts(businessId, { status: status || undefined, limit });
    res.json(posts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── New: SEO Score ──────────────────────────────────────────────────────────

// Calculate local SEO score
router.get('/seo-score/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const result = await gbpService.calculateSeoScore(businessId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
