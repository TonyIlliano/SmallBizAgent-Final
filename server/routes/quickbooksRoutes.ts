/**
 * QuickBooks API Routes
 * 
 * This module provides API routes for QuickBooks integration,
 * allowing businesses to connect their QuickBooks accounts and process payments.
 */

import { Router, Request, Response } from 'express';
import { isAuthenticated, belongsToBusiness } from '../auth';
import * as quickbooksService from '../services/quickbooksService';
import { db } from '../db';
import { businesses } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Check if QuickBooks is configured
router.get('/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.query.businessId as string);
    
    // Validate business ID
    if (!businessId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing business ID' 
      });
    }
    
    // Check if user has access to this business
    if (!belongsToBusiness(req, businessId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to access this business' 
      });
    }
    
    // Get business from database
    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId));
    
    if (!business) {
      return res.status(404).json({ 
        success: false, 
        error: 'Business not found' 
      });
    }
    
    // Check overall QuickBooks configuration status
    const isQuickBooksConfigured = quickbooksService.isConfigured();
    
    // Check if business has connected to QuickBooks
    const isBusinessConnected = !!(
      business.quickbooksRealmId &&
      business.quickbooksAccessToken &&
      business.quickbooksRefreshToken
    );
    
    // Check if credentials are expired
    let isExpired = false;
    if (
      isBusinessConnected && 
      business.quickbooksTokenExpiry && 
      new Date(business.quickbooksTokenExpiry) <= new Date()
    ) {
      isExpired = true;
    }
    
    res.json({
      success: true,
      configured: isQuickBooksConfigured,
      connected: isBusinessConnected,
      expired: isExpired,
      expiresAt: business.quickbooksTokenExpiry
    });
  } catch (error: any) {
    console.error('QuickBooks status check error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check QuickBooks connection status' 
    });
  }
});

// Generate authorization URL
router.get('/authorize', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.query.businessId as string);
    
    // Validate business ID
    if (!businessId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing business ID' 
      });
    }
    
    // Check if user has access to this business
    if (!belongsToBusiness(req, businessId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to access this business' 
      });
    }
    
    // Check if QuickBooks is configured
    if (!quickbooksService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'QuickBooks integration is not configured. Please contact the administrator.'
      });
    }
    
    // Get the authorization URL
    const authUrl = quickbooksService.getAuthorizationUrl(businessId);
    
    res.json({
      success: true,
      authUrl
    });
  } catch (error: any) {
    console.error('QuickBooks authorization error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate QuickBooks authorization URL' 
    });
  }
});

// Handle OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  try {
    // Get the business ID from state parameter
    const businessId = parseInt(req.query.state as string);
    if (!businessId) {
      throw new Error('Missing business ID');
    }
    
    // Process the callback
    const result = await quickbooksService.handleCallback(req.url);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to complete QuickBooks authorization');
    }
    
    // Store QuickBooks credentials for the business
    await db.update(businesses)
      .set({
        quickbooksRealmId: result.tokens.realmId,
        quickbooksAccessToken: result.tokens.access_token,
        quickbooksRefreshToken: result.tokens.refresh_token,
        quickbooksTokenExpiry: new Date(Date.now() + (result.tokens.expires_in * 1000))
      })
      .where(eq(businesses.id, businessId));
    
    // Redirect to settings page with success message
    res.redirect('/settings?tab=integrations&quickbooks=connected');
  } catch (error: any) {
    console.error('QuickBooks callback error:', error);
    res.redirect('/settings?tab=integrations&quickbooks=error');
  }
});

// Sync invoice to QuickBooks
router.post('/invoice', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { businessId, invoiceId, customerId, amount, description, itemId } = req.body;
    
    // Validate required fields
    if (!businessId || !invoiceId || !customerId || !amount || !itemId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Check if user has access to this business
    if (!belongsToBusiness(req, businessId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to access this business' 
      });
    }
    
    // Get business from database
    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId));
    
    if (!business) {
      return res.status(404).json({ 
        success: false, 
        error: 'Business not found' 
      });
    }
    
    // Check if business has connected to QuickBooks
    if (
      !business.quickbooksRealmId ||
      !business.quickbooksAccessToken ||
      !business.quickbooksRefreshToken
    ) {
      return res.status(400).json({ 
        success: false, 
        error: 'QuickBooks not connected for this business' 
      });
    }
    
    // Check if token needs refresh
    const credentials = {
      realmId: business.quickbooksRealmId,
      access_token: business.quickbooksAccessToken,
      refresh_token: business.quickbooksRefreshToken
    };
    
    if (
      business.quickbooksTokenExpiry && 
      new Date(business.quickbooksTokenExpiry) <= new Date()
    ) {
      const refreshResult = await quickbooksService.refreshToken(credentials);
      
      if (!refreshResult.success) {
        return res.status(401).json({ 
          success: false, 
          error: 'QuickBooks authentication expired. Please reconnect.' 
        });
      }
      
      // Update stored credentials
      await db.update(businesses)
        .set({
          quickbooksAccessToken: refreshResult.tokens.access_token,
          quickbooksRefreshToken: refreshResult.tokens.refresh_token,
          quickbooksTokenExpiry: new Date(Date.now() + (refreshResult.tokens.expires_in * 1000))
        })
        .where(eq(businesses.id, businessId));
        
      // Update credentials for current request
      credentials.access_token = refreshResult.tokens.access_token;
      credentials.refresh_token = refreshResult.tokens.refresh_token;
    }
    
    // Create invoice in QuickBooks
    const invoiceResult = await quickbooksService.createInvoice(credentials, {
      customerId,
      amount,
      description,
      itemId
    });
    
    if (!invoiceResult.success) {
      throw new Error(invoiceResult.error);
    }
    
    res.json({
      success: true,
      invoice: invoiceResult.invoice
    });
  } catch (error: any) {
    console.error('QuickBooks invoice creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create QuickBooks invoice' 
    });
  }
});

// Process payment through QuickBooks
router.post('/payment', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { businessId, customerId, amount, invoiceId, paymentMethodId } = req.body;
    
    // Validate required fields
    if (!businessId || !customerId || !amount || !paymentMethodId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Check if user has access to this business
    if (!belongsToBusiness(req, businessId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to access this business' 
      });
    }
    
    // Get business from database
    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId));
    
    if (!business) {
      return res.status(404).json({ 
        success: false, 
        error: 'Business not found' 
      });
    }
    
    // Check if business has connected to QuickBooks
    if (
      !business.quickbooksRealmId ||
      !business.quickbooksAccessToken ||
      !business.quickbooksRefreshToken
    ) {
      return res.status(400).json({ 
        success: false, 
        error: 'QuickBooks not connected for this business' 
      });
    }
    
    // Check if token needs refresh
    const credentials = {
      realmId: business.quickbooksRealmId,
      access_token: business.quickbooksAccessToken,
      refresh_token: business.quickbooksRefreshToken
    };
    
    if (
      business.quickbooksTokenExpiry && 
      new Date(business.quickbooksTokenExpiry) <= new Date()
    ) {
      const refreshResult = await quickbooksService.refreshToken(credentials);
      
      if (!refreshResult.success) {
        return res.status(401).json({ 
          success: false, 
          error: 'QuickBooks authentication expired. Please reconnect.' 
        });
      }
      
      // Update stored credentials
      await db.update(businesses)
        .set({
          quickbooksAccessToken: refreshResult.tokens.access_token,
          quickbooksRefreshToken: refreshResult.tokens.refresh_token,
          quickbooksTokenExpiry: new Date(Date.now() + (refreshResult.tokens.expires_in * 1000))
        })
        .where(eq(businesses.id, businessId));
        
      // Update credentials for current request
      credentials.access_token = refreshResult.tokens.access_token;
      credentials.refresh_token = refreshResult.tokens.refresh_token;
    }
    
    // Process payment in QuickBooks
    const paymentResult = await quickbooksService.chargeCustomer(credentials, {
      customerId,
      amount,
      invoiceId,
      paymentMethodId
    });
    
    if (!paymentResult.success) {
      throw new Error(paymentResult.error);
    }
    
    res.json({
      success: true,
      payment: paymentResult.payment
    });
  } catch (error: any) {
    console.error('QuickBooks payment processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to process QuickBooks payment' 
    });
  }
});

// Get customers from QuickBooks
router.get('/customers', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.query.businessId as string);
    
    // Validate business ID
    if (!businessId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing business ID' 
      });
    }
    
    // Check if user has access to this business
    if (!belongsToBusiness(req, businessId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to access this business' 
      });
    }
    
    // Get business from database
    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId));
    
    if (!business) {
      return res.status(404).json({ 
        success: false, 
        error: 'Business not found' 
      });
    }
    
    // Check if business has connected to QuickBooks
    if (
      !business.quickbooksRealmId ||
      !business.quickbooksAccessToken ||
      !business.quickbooksRefreshToken
    ) {
      return res.status(400).json({ 
        success: false, 
        error: 'QuickBooks not connected for this business' 
      });
    }
    
    // Check if token needs refresh
    const credentials = {
      realmId: business.quickbooksRealmId,
      access_token: business.quickbooksAccessToken,
      refresh_token: business.quickbooksRefreshToken
    };
    
    if (
      business.quickbooksTokenExpiry && 
      new Date(business.quickbooksTokenExpiry) <= new Date()
    ) {
      const refreshResult = await quickbooksService.refreshToken(credentials);
      
      if (!refreshResult.success) {
        return res.status(401).json({ 
          success: false, 
          error: 'QuickBooks authentication expired. Please reconnect.' 
        });
      }
      
      // Update stored credentials
      await db.update(businesses)
        .set({
          quickbooksAccessToken: refreshResult.tokens.access_token,
          quickbooksRefreshToken: refreshResult.tokens.refresh_token,
          quickbooksTokenExpiry: new Date(Date.now() + (refreshResult.tokens.expires_in * 1000))
        })
        .where(eq(businesses.id, businessId));
        
      // Update credentials for current request
      credentials.access_token = refreshResult.tokens.access_token;
      credentials.refresh_token = refreshResult.tokens.refresh_token;
    }
    
    // Get customers from QuickBooks
    const customersResult = await quickbooksService.getCustomers(credentials);
    
    if (!customersResult.success) {
      throw new Error(customersResult.error);
    }
    
    res.json({
      success: true,
      customers: customersResult.customers
    });
  } catch (error: any) {
    console.error('QuickBooks customers retrieval error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to retrieve QuickBooks customers' 
    });
  }
});

// Disconnect QuickBooks
router.post('/disconnect', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.body;
    
    // Validate business ID
    if (!businessId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing business ID' 
      });
    }
    
    // Check if user has access to this business
    if (!belongsToBusiness(req, businessId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to access this business' 
      });
    }
    
    // Clear QuickBooks credentials for the business
    await db.update(businesses)
      .set({
        quickbooksRealmId: null,
        quickbooksAccessToken: null,
        quickbooksRefreshToken: null,
        quickbooksTokenExpiry: null
      })
      .where(eq(businesses.id, businessId));
    
    res.json({
      success: true,
      message: 'QuickBooks disconnected successfully'
    });
  } catch (error: any) {
    console.error('QuickBooks disconnect error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to disconnect QuickBooks' 
    });
  }
});

export default router;