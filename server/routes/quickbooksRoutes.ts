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
import { isAuthenticated } from '../middleware/auth';

const router = Router();

// Check QuickBooks connection status
router.get('/status', async (req, res) => {
  try {
    const businessId = parseInt(req.query.businessId as string, 10);
    
    if (isNaN(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }
    
    const status = await getQuickBooksStatus(businessId);
    res.json(status);
  } catch (error) {
    console.error('Error checking QuickBooks status:', error);
    res.status(500).json({ error: 'Failed to check QuickBooks status' });
  }
});

// Generate authorization URL
router.get('/authorize', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.query.businessId as string, 10);
    
    if (isNaN(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
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

// Disconnect QuickBooks
router.post('/disconnect', isAuthenticated, async (req, res) => {
  try {
    const businessId = req.body.businessId;
    
    if (!businessId) {
      return res.status(400).json({ error: 'Business ID is required' });
    }
    
    await disconnectQuickBooks(businessId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting QuickBooks:', error);
    res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
});

// Sync customer to QuickBooks
router.post('/sync-customer', isAuthenticated, async (req, res) => {
  try {
    const businessId = req.body.businessId;
    const customerId = req.body.customerId;
    
    if (!businessId || !customerId) {
      return res.status(400).json({ error: 'Business ID and customer ID are required' });
    }
    
    // Get customer from database
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId)
    });
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Sync customer to QuickBooks
    const result = await createOrUpdateCustomer(businessId, customer);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error syncing customer to QuickBooks:', error);
    res.status(500).json({ error: 'Failed to sync customer to QuickBooks' });
  }
});

// Sync invoice to QuickBooks
router.post('/sync-invoice', isAuthenticated, async (req, res) => {
  try {
    const businessId = req.body.businessId;
    const invoiceId = req.body.invoiceId;
    
    if (!businessId || !invoiceId) {
      return res.status(400).json({ error: 'Business ID and invoice ID are required' });
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
    
    // Sync invoice to QuickBooks
    const result = await createInvoice(businessId, invoice);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error syncing invoice to QuickBooks:', error);
    res.status(500).json({ error: 'Failed to sync invoice to QuickBooks' });
  }
});

// Record payment in QuickBooks
router.post('/record-payment', isAuthenticated, async (req, res) => {
  try {
    const schema = z.object({
      businessId: z.number(),
      invoiceId: z.number(),
      amount: z.number(),
      customerId: z.number(),
      paymentMethod: z.string().optional(),
    });
    
    const data = schema.parse(req.body);
    
    // Record payment in QuickBooks
    const result = await recordPayment(data.businessId, {
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