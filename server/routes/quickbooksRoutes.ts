import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { customers, invoices } from '@shared/schema';
import {
  getAuthorizationUrl,
  processCallback,
  getQuickBooksStatus,
  disconnectQuickBooks,
  isQuickBooksConfigured,
  createInvoice,
  recordPayment,
  createOrUpdateCustomer
} from '../services/quickbooksService';
import { isAuthenticated, checkBelongsToBusinessAsync } from '../middleware/auth';

const router = Router();

// Check QuickBooks connection status — requires auth + ownership
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const status = await getQuickBooksStatus(businessId);
    res.json(status);
  } catch (error) {
    console.error('Error checking QuickBooks status:', error);
    res.status(500).json({ error: 'Failed to check QuickBooks status' });
  }
});

// Check if QuickBooks is configured in the environment
router.get('/check-config', isAuthenticated, async (req, res) => {
  try {
    const configured = isQuickBooksConfigured();
    res.json({
      configured,
      clientIdExists: !!process.env.QUICKBOOKS_CLIENT_ID,
      clientSecretExists: !!process.env.QUICKBOOKS_CLIENT_SECRET
    });
  } catch (error) {
    console.error('Error checking QuickBooks configuration:', error);
    res.status(500).json({ error: 'Failed to check QuickBooks configuration' });
  }
});

// Generate authorization URL — uses session businessId
router.get('/authorize', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    // Check if QuickBooks API is configured
    if (!isQuickBooksConfigured()) {
      return res.status(400).json({
        error: 'QuickBooks API is not configured',
        success: false
      });
    }

    // Generate authorization URL
    const authUrl = getAuthorizationUrl(businessId);

    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('Error generating QuickBooks authorization URL:', error);
    res.status(500).json({
      error: 'Failed to generate QuickBooks authorization URL',
      success: false
    });
  }
});

// OAuth callback to exchange code for tokens
// Note: OAuth callbacks can't require session auth — state param validates the request
router.get('/callback', async (req, res) => {
  try {
    // Get the full callback URL
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Process the callback
    const result = await processCallback(fullUrl, req);

    if (result.success) {
      // Redirect to success page
      res.redirect('/settings?tab=integrations&success=quickbooks');
    } else {
      // Redirect to error page
      res.redirect('/settings?tab=integrations&error=quickbooks');
    }
  } catch (error) {
    console.error('Error processing QuickBooks OAuth callback:', error);
    res.redirect('/settings?tab=integrations&error=quickbooks');
  }
});

// Disconnect QuickBooks — uses session businessId
router.post('/disconnect', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    await disconnectQuickBooks(businessId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting QuickBooks:', error);
    res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
});

// Sync customer to QuickBooks — verify ownership of both business and customer
router.post('/sync-customer', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const customerId = req.body.customerId;
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get customer from database and verify it belongs to the user's business
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Verify customer belongs to the user's business
    if (customer.businessId !== businessId) {
      return res.status(403).json({ error: 'Access denied to this customer' });
    }

    // Sync customer to QuickBooks
    const result = await createOrUpdateCustomer(businessId, customer);

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error syncing customer to QuickBooks:', error);
    res.status(500).json({ error: 'Failed to sync customer to QuickBooks' });
  }
});

// Sync invoice to QuickBooks — verify ownership
router.post('/sync-invoice', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const invoiceId = req.body.invoiceId;
    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is required' });
    }

    // Get invoice from database
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        customer: true,
        items: true
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Verify invoice belongs to the user's business
    if (invoice.businessId !== businessId) {
      return res.status(403).json({ error: 'Access denied to this invoice' });
    }

    // Sync invoice to QuickBooks
    const result = await createInvoice(businessId, invoice);

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error syncing invoice to QuickBooks:', error);
    res.status(500).json({ error: 'Failed to sync invoice to QuickBooks' });
  }
});

// Record payment in QuickBooks — verify ownership
router.post('/record-payment', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const schema = z.object({
      invoiceId: z.number(),
      amount: z.number(),
      customerId: z.number(),
      paymentMethod: z.string().optional(),
    });

    const data = schema.parse(req.body);

    // Verify the invoice belongs to the user's business
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, data.invoiceId)
    });
    if (!invoice || invoice.businessId !== businessId) {
      return res.status(403).json({ error: 'Access denied to this invoice' });
    }

    // Record payment in QuickBooks
    const result = await recordPayment(businessId, {
      invoiceId: data.invoiceId,
      amount: data.amount,
      customerId: data.customerId,
      paymentMethod: data.paymentMethod || 'CreditCard',
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error recording payment in QuickBooks:', error);
    res.status(500).json({ error: 'Failed to record payment in QuickBooks' });
  }
});

export default router;
