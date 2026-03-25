import { Router } from 'express';
import { CalendarService } from '../services/calendarService';
import { isAuthenticated } from '../auth';
import { storage } from '../storage';

const router = Router();
const calendarService = new CalendarService();

// Get calendar integration statuses for a business
router.get('/status/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) return res.status(401).json({ error: 'Not authenticated' });
    const status = await calendarService.getIntegrationStatus(businessId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get auth URLs for calendar integrations
router.get('/auth-urls/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) return res.status(401).json({ error: 'Not authenticated' });
    const urls = calendarService.getAuthUrls(businessId);
    res.json(urls);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    await calendarService.handleGoogleCallback(code, state);
    
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h1 style="color: #333; margin-bottom: 8px;">Google Calendar Connected!</h1>
            <p style="color: #666;">Your appointments will now sync automatically.</p>
            <p style="color: #999; font-size: 14px;">This window will close shortly...</p>
          </div>
          <script>
            if (window.opener) {
              // Post to same origin (popup is on the same domain as the parent)
              window.opener.postMessage({ type: 'calendar-connected', provider: 'google' }, window.opener.location.origin);
            }
            setTimeout(function() { window.close(); }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    const safeMessage = (error.message || 'Unknown error').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    res.status(500).send(`
      <html>
        <body>
          <h1>Error Connecting Google Calendar</h1>
          <p>There was an error connecting your Google Calendar: ${safeMessage}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }
});

// Handle Microsoft OAuth callback
router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    await calendarService.handleMicrosoftCallback(code, state);
    
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h1 style="color: #333; margin-bottom: 8px;">Microsoft Calendar Connected!</h1>
            <p style="color: #666;">Your appointments will now sync automatically.</p>
            <p style="color: #999; font-size: 14px;">This window will close shortly...</p>
          </div>
          <script>
            if (window.opener) {
              // Post to same origin (popup is on the same domain as the parent)
              window.opener.postMessage({ type: 'calendar-connected', provider: 'microsoft' }, window.opener.location.origin);
            }
            setTimeout(function() { window.close(); }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    const safeMessage = (error.message || 'Unknown error').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    res.status(500).send(`
      <html>
        <body>
          <h1>Error Connecting Microsoft Calendar</h1>
          <p>There was an error connecting your Microsoft Calendar: ${safeMessage}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }
});

// Get Apple Calendar subscription URL
router.get('/apple/subscription/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) return res.status(401).json({ error: 'Not authenticated' });
    const url = await calendarService.getAppleCalendarUrl(businessId);
    
    if (!url) {
      return res.status(404).json({ error: 'Apple Calendar subscription URL not found' });
    }
    
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generate an .ics file for a specific appointment
router.get('/appointment/:appointmentId/ics', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) return res.status(401).json({ error: 'Not authenticated' });
    const appointmentId = parseInt(req.params.appointmentId);
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment || appointment.businessId !== businessId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const icsUrl = await calendarService.getAppointmentICS(appointmentId);

    res.json({ icsUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sync an appointment with all connected calendars
router.post('/appointment/:appointmentId/sync', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) return res.status(401).json({ error: 'Not authenticated' });
    const appointmentId = parseInt(req.params.appointmentId);
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment || appointment.businessId !== businessId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await calendarService.syncAppointment(appointmentId);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an appointment from all connected calendars
router.delete('/appointment/:appointmentId', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) return res.status(401).json({ error: 'Not authenticated' });
    const appointmentId = parseInt(req.params.appointmentId);
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment || appointment.businessId !== businessId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await calendarService.deleteAppointment(appointmentId);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect a calendar integration
router.delete('/:businessId/:provider', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) return res.status(401).json({ error: 'Not authenticated' });
    const { provider } = req.params;
    
    // Validate provider
    const validProviders = ['google', 'microsoft', 'apple'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: 'Invalid calendar provider' });
    }
    
    const result = await calendarService.disconnectCalendar(businessId, provider);
    
    if (result) {
      res.json({ success: true, message: `Successfully disconnected ${provider} calendar` });
    } else {
      res.status(500).json({ success: false, error: `Failed to disconnect ${provider} calendar` });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;