import { db } from "../db";
import { businesses } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
// We need to install the QuickBooks SDK packages
// These are the imports we'll need
import OAuthClient from "intuit-oauth";
import QuickBooks from "node-quickbooks";

// Check for required environment variables
const QUICKBOOKS_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
const QUICKBOOKS_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;
const REDIRECT_URI = process.env.NODE_ENV === 'production' 
  ? 'https://smallbizagent.replit.app/api/quickbooks/callback' 
  : 'http://localhost:5000/api/quickbooks/callback';

// Check if QuickBooks is configured
export function isQuickBooksConfigured(): boolean {
  return !!(QUICKBOOKS_CLIENT_ID && QUICKBOOKS_CLIENT_SECRET);
}

// Initialize OAuth2 client
export function getOAuthClient(): OAuthClient {
  if (!isQuickBooksConfigured()) {
    throw new Error('QuickBooks credentials not configured');
  }

  return new OAuthClient({
    clientId: QUICKBOOKS_CLIENT_ID!,
    clientSecret: QUICKBOOKS_CLIENT_SECRET!,
    environment: 'sandbox', // or 'production'
    redirectUri: REDIRECT_URI,
  });
}

// Generate authorization URL
export function getAuthorizationUrl(businessId: number): string {
  const oauthClient = getOAuthClient();
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: JSON.stringify({ businessId }),
  });
  
  return authUri;
}

// Process OAuth callback and save tokens
export async function processCallback(url: string, req: Request): Promise<any> {
  const oauthClient = getOAuthClient();
  
  try {
    // Exchange code for tokens
    const authResponse = await oauthClient.createToken(url);
    const tokens = authResponse.getJson();
    
    // Parse state to get businessId
    const state = JSON.parse(tokens.state);
    const businessId = state.businessId;
    
    // Get realmId (company ID)
    const realmId = tokens.realmId;
    
    // Save tokens to database
    await saveTokens(businessId, {
      realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      expiresIn: tokens.expires_in,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });
    
    return { success: true, businessId, realmId };
  } catch (error) {
    console.error('QuickBooks OAuth callback error:', error);
    throw error;
  }
}

// Save tokens to database
async function saveTokens(businessId: number, tokenData: any): Promise<void> {
  try {
    await db.update(businesses)
      .set({
        quickbooksRealmId: tokenData.realmId,
        quickbooksAccessToken: tokenData.accessToken,
        quickbooksRefreshToken: tokenData.refreshToken,
        quickbooksTokenExpiry: tokenData.expiresAt,
      })
      .where(eq(businesses.id, businessId));
  } catch (error) {
    console.error('Error saving QuickBooks tokens:', error);
    throw error;
  }
}

// Get QuickBooks tokens for a business
export async function getQuickBooksTokens(businessId: number): Promise<any> {
  try {
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.id, businessId)
    });
    
    if (!business) {
      throw new Error('Business not found');
    }
    
    return {
      realmId: business.quickbooksRealmId,
      accessToken: business.quickbooksAccessToken,
      refreshToken: business.quickbooksRefreshToken,
      tokenType: business.quickbooksTokenType,
      expiresAt: business.quickbooksTokenExpiry,
    };
  } catch (error) {
    console.error('Error getting QuickBooks tokens:', error);
    throw error;
  }
}

// Refresh tokens if expired
export async function refreshTokensIfNeeded(businessId: number): Promise<any> {
  try {
    const tokens = await getQuickBooksTokens(businessId);
    
    // Check if tokens are expired or will expire soon (within 5 minutes)
    const isExpired = tokens.expiresAt && new Date(tokens.expiresAt) < new Date(Date.now() + 5 * 60 * 1000);
    
    if (isExpired && tokens.refreshToken) {
      const oauthClient = getOAuthClient();
      
      // Set the refresh token in the client
      oauthClient.setToken({
        refresh_token: tokens.refreshToken,
        access_token: tokens.accessToken,
      });
      
      // Refresh the token
      const authResponse = await oauthClient.refresh();
      const newTokens = authResponse.getJson();
      
      // Save the new tokens
      await saveTokens(businessId, {
        realmId: tokens.realmId,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || tokens.refreshToken,
        tokenType: newTokens.token_type,
        expiresIn: newTokens.expires_in,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      });
      
      // Return the new tokens
      return {
        realmId: tokens.realmId,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || tokens.refreshToken,
        tokenType: newTokens.token_type,
        expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      };
    }
    
    return tokens;
  } catch (error) {
    console.error('Error refreshing QuickBooks tokens:', error);
    throw error;
  }
}

// Check if business is connected to QuickBooks
export async function isBusinessConnectedToQuickBooks(businessId: number): Promise<boolean> {
  try {
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.id, businessId)
    });
    
    return !!(business && business.quickbooksAccessToken && business.quickbooksRealmId);
  } catch (error) {
    console.error('Error checking QuickBooks connection:', error);
    return false;
  }
}

// Disconnect QuickBooks
export async function disconnectQuickBooks(businessId: number): Promise<void> {
  try {
    await db.update(businesses)
      .set({
        quickbooksRealmId: null,
        quickbooksAccessToken: null,
        quickbooksRefreshToken: null,
        quickbooksTokenType: null,
        quickbooksTokenExpiry: null,
      })
      .where(eq(businesses.id, businessId));
  } catch (error) {
    console.error('Error disconnecting QuickBooks:', error);
    throw error;
  }
}

// Create QuickBooks client instance
export async function getQuickBooksClient(businessId: number): Promise<any> {
  try {
    // Refresh tokens if needed
    const tokens = await refreshTokensIfNeeded(businessId);
    
    if (!tokens.accessToken || !tokens.realmId) {
      throw new Error('QuickBooks not connected');
    }
    
    // Create QuickBooks client
    return new QuickBooks(
      QUICKBOOKS_CLIENT_ID!,
      QUICKBOOKS_CLIENT_SECRET!,
      tokens.accessToken,
      false, // use the sandbox?
      tokens.realmId,
      true, // debug?
      null, // minor version
      '2.0', // oauth version
      tokens.refreshToken
    );
  } catch (error) {
    console.error('Error creating QuickBooks client:', error);
    throw error;
  }
}

// Create or update customer in QuickBooks
export async function createOrUpdateCustomer(businessId: number, customer: any): Promise<any> {
  try {
    const qbo = await getQuickBooksClient(businessId);
    
    // Check if customer exists in QuickBooks by email
    if (customer.email) {
      const existingCustomers = await new Promise((resolve, reject) => {
        qbo.findCustomers([
          { field: 'PrimaryEmailAddr', value: customer.email }
        ], (err: any, customers: any) => {
          if (err) reject(err);
          else resolve(customers.QueryResponse.Customer || []);
        });
      });
      
      if (Array.isArray(existingCustomers) && existingCustomers.length > 0) {
        // Update existing customer
        const existingCustomer = existingCustomers[0];
        const updatedCustomer = {
          Id: existingCustomer.Id,
          SyncToken: existingCustomer.SyncToken,
          DisplayName: customer.name,
          PrimaryEmailAddr: { Address: customer.email },
          PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
          BillAddr: customer.address ? {
            Line1: customer.address,
            City: customer.city,
            CountrySubDivisionCode: customer.state,
            PostalCode: customer.zip,
          } : undefined,
        };
        
        return new Promise((resolve, reject) => {
          qbo.updateCustomer(updatedCustomer, (err: any, result: any) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      }
    }
    
    // Create new customer
    const newCustomer = {
      DisplayName: customer.name,
      PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
      PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
      BillAddr: customer.address ? {
        Line1: customer.address,
        City: customer.city,
        CountrySubDivisionCode: customer.state,
        PostalCode: customer.zip,
      } : undefined,
    };
    
    return new Promise((resolve, reject) => {
      qbo.createCustomer(newCustomer, (err: any, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  } catch (error) {
    console.error('Error creating/updating QuickBooks customer:', error);
    throw error;
  }
}

// Create invoice in QuickBooks
export async function createInvoice(businessId: number, invoice: any): Promise<any> {
  try {
    const qbo = await getQuickBooksClient(businessId);
    
    // Create or update customer first
    const customer = await createOrUpdateCustomer(businessId, invoice.customer);
    
    // Create invoice
    const newInvoice = {
      CustomerRef: { value: customer.Id },
      TxnDate: new Date(invoice.createdAt || new Date()).toISOString().split('T')[0],
      DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : undefined,
      Line: invoice.items.map((item: any) => ({
        Description: item.description,
        Amount: item.amount,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          UnitPrice: item.unitPrice || item.amount,
          Qty: item.quantity || 1,
        },
      })),
      CustomerMemo: { value: invoice.notes || '' },
    };
    
    return new Promise((resolve, reject) => {
      qbo.createInvoice(newInvoice, (err: any, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  } catch (error) {
    console.error('Error creating QuickBooks invoice:', error);
    throw error;
  }
}

// Record payment in QuickBooks
export async function recordPayment(businessId: number, payment: any): Promise<any> {
  try {
    const qbo = await getQuickBooksClient(businessId);
    
    // Create payment
    const newPayment = {
      CustomerRef: { value: payment.customerId },
      TotalAmt: payment.amount,
      PaymentMethodRef: { value: payment.paymentMethod || 'CreditCard' },
    };
    
    if (payment.invoiceId) {
      // Link payment to invoice
      newPayment.LinkedTxn = [{
        TxnId: payment.invoiceId,
        TxnType: 'Invoice',
      }];
    }
    
    return new Promise((resolve, reject) => {
      qbo.createPayment(newPayment, (err: any, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  } catch (error) {
    console.error('Error recording QuickBooks payment:', error);
    throw error;
  }
}

// Get QuickBooks connection status
export async function getQuickBooksStatus(businessId: number): Promise<any> {
  try {
    // Check if QuickBooks is configured
    const configured = isQuickBooksConfigured();
    
    if (!configured) {
      return {
        configured: false,
        connected: false,
      };
    }
    
    // Check if business is connected
    const isConnected = await isBusinessConnectedToQuickBooks(businessId);
    
    if (!isConnected) {
      return {
        configured: true,
        connected: false,
      };
    }
    
    // Get tokens
    const tokens = await getQuickBooksTokens(businessId);
    
    // Check if tokens are expired
    const isExpired = tokens.expiresAt && new Date(tokens.expiresAt) < new Date();
    
    return {
      configured: true,
      connected: true,
      expired: isExpired,
      expiresAt: tokens.expiresAt,
    };
  } catch (error) {
    console.error('Error getting QuickBooks status:', error);
    throw error;
  }
}