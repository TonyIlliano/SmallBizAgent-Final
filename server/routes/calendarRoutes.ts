import { Router } from 'express';
import { CalendarService } from '../services/calendarService';
import { isAuthenticated, belongsToBusiness } from '../middleware/auth';

const router = Router();
const calendarService = new CalendarService();

// Get calendar integration statuses for a business
router.get('/status/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const status = await calendarService.getIntegrationStatus(businessId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get auth URLs for calendar integrations
router.get('/auth-urls/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
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
        <body>
          <h1>Google Calendar Connected</h1>
          <p>Your Google Calendar has been successfully connected to SmallBizAgent.</p>
          <p>You can close this window and return to the application.</p>
          <script>
            setTimeout(function() {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    res.status(500).send(`
      <html>
        <body>
          <h1>Error Connecting Google Calendar</h1>
          <p>There was an error connecting your Google Calendar: ${error.message}</p>
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
        <body>
          <h1>Microsoft Calendar Connected</h1>
          <p>Your Microsoft Calendar has been successfully connected to SmallBizAgent.</p>
          <p>You can close this window and return to the application.</p>
          <script>
            setTimeout(function() {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    res.status(500).send(`
      <html>
        <body>
          <h1>Error Connecting Microsoft Calendar</h1>
          <p>There was an error connecting your Microsoft Calendar: ${error.message}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }
});

// Get Apple Calendar subscription URL
router.get('/apple/subscription/:businessId', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
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
    const appointmentId = parseInt(req.params.appointmentId);
    const icsUrl = await calendarService.getAppointmentICS(appointmentId);
    
    res.json({ icsUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sync an appointment with all connected calendars
router.post('/appointment/:appointmentId/sync', isAuthenticated, async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.appointmentId);
    const result = await calendarService.syncAppointment(appointmentId);
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an appointment from all connected calendars
router.delete('/appointment/:appointmentId', isAuthenticated, async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.appointmentId);
    const result = await calendarService.deleteAppointment(appointmentId);
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect a calendar integration
router.delete('/:businessId/:provider', isAuthenticated, belongsToBusiness, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
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