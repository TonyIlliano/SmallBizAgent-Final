/**
 * QuickBooks Integration Service
 * 
 * This service provides integration with QuickBooks for invoicing, payment processing, 
 * and accounting synchronization.
 */

import OAuthClient from 'intuit-oauth';
import QuickBooks from 'node-quickbooks';

// Environment variables
const QUICKBOOKS_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID || '';
const QUICKBOOKS_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.QUICKBOOKS_REDIRECT_URI || `${process.env.HOST_URL || 'http://localhost:5000'}/api/quickbooks/callback`;
const ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';

// Initialize OAuth Client (if credentials are available)
let oauthClient: any = null;

if (QUICKBOOKS_CLIENT_ID && QUICKBOOKS_CLIENT_SECRET) {
  oauthClient = new OAuthClient({
    clientId: QUICKBOOKS_CLIENT_ID,
    clientSecret: QUICKBOOKS_CLIENT_SECRET,
    environment: ENVIRONMENT,
    redirectUri: REDIRECT_URI
  });
}

/**
 * Check if QuickBooks is configured with valid credentials
 */
export function isConfigured(): boolean {
  return !!(QUICKBOOKS_CLIENT_ID && QUICKBOOKS_CLIENT_SECRET && oauthClient);
}

/**
 * Get authorization URL for connecting a business to QuickBooks
 * @returns {string} The authorization URL
 */
export function getAuthorizationUrl(businessId: string | number): string {
  if (!isConfigured()) {
    throw new Error('QuickBooks is not configured with valid credentials');
  }

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.Payment],
    state: businessId.toString()
  });
  return authUri;
}

/**
 * Process OAuth callback and retrieve tokens
 * @param {string} url - The callback URL with authorization code
 * @returns {Promise<Object>} The OAuth tokens
 */
export async function handleCallback(url: string): Promise<any> {
  if (!isConfigured()) {
    throw new Error('QuickBooks is not configured with valid credentials');
  }

  try {
    const authResponse = await oauthClient.createToken(url);
    const tokens = authResponse.getJson();
    return {
      success: true,
      tokens
    };
  } catch (error: any) {
    console.error('Error processing OAuth callback:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a QuickBooks client instance for a business
 * @param {Object} credentials - The QuickBooks OAuth credentials
 * @returns {Object} The QuickBooks client
 */
function createQuickBooksClient(credentials: any): any {
  if (!isConfigured()) {
    throw new Error('QuickBooks is not configured with valid credentials');
  }
  
  if (!credentials || !credentials.access_token || !credentials.realmId) {
    throw new Error('Invalid QuickBooks credentials');
  }

  return new QuickBooks(
    QUICKBOOKS_CLIENT_ID,
    QUICKBOOKS_CLIENT_SECRET,
    credentials.access_token,
    false, // no token secret for OAuth2
    credentials.realmId,
    ENVIRONMENT === 'production' ? false : true, // sandbox
    false, // debug
    null, // minor version
    '2.0', // OAuth version
    credentials.refresh_token
  );
}

/**
 * Create an invoice in QuickBooks
 * @param {Object} credentials - The QuickBooks OAuth credentials
 * @param {Object} invoiceData - The invoice data
 * @returns {Promise<Object>} The created invoice
 */
export async function createInvoice(credentials: any, invoiceData: any): Promise<any> {
  if (!isConfigured()) {
    throw new Error('QuickBooks is not configured with valid credentials');
  }
  
  try {
    const qbo = createQuickBooksClient(credentials);
    
    // Create invoice object according to QuickBooks API format
    const invoice = {
      Line: [
        {
          Amount: invoiceData.amount,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: {
              value: invoiceData.itemId
            },
            Qty: invoiceData.quantity || 1,
            UnitPrice: invoiceData.unitPrice || invoiceData.amount
          },
          Description: invoiceData.description
        }
      ],
      CustomerRef: {
        value: invoiceData.customerId
      },
      TxnDate: new Date().toISOString().split('T')[0]
    };
    
    return new Promise((resolve, reject) => {
      qbo.createInvoice(invoice, (err: any, response: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            invoice: response
          });
        }
      });
    });
    
  } catch (error: any) {
    console.error('Error creating QuickBooks invoice:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Charge a customer through QuickBooks Payments
 * @param {Object} credentials - The QuickBooks OAuth credentials
 * @param {Object} paymentData - The payment data including token and amount
 * @returns {Promise<Object>} The payment result
 */
export async function chargeCustomer(credentials: any, paymentData: any): Promise<any> {
  if (!isConfigured()) {
    throw new Error('QuickBooks is not configured with valid credentials');
  }
  
  try {
    const qbo = createQuickBooksClient(credentials);
    
    // Create payment object according to QuickBooks API format
    const charge = {
      CustomerRef: {
        value: paymentData.customerId
      },
      TotalAmt: paymentData.amount,
      PaymentMethodRef: {
        value: paymentData.paymentMethodId
      }
    };
    
    if (paymentData.invoiceId) {
      charge.LinkedTxn = [{
        TxnId: paymentData.invoiceId,
        TxnType: 'Invoice'
      }];
    }
    
    return new Promise((resolve, reject) => {
      qbo.createPayment(charge, (err: any, response: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            payment: response
          });
        }
      });
    });
    
  } catch (error: any) {
    console.error('Error charging customer in QuickBooks:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get customers from QuickBooks
 * @param {Object} credentials - The QuickBooks OAuth credentials
 * @returns {Promise<Object>} The list of customers
 */
export async function getCustomers(credentials: any): Promise<any> {
  if (!isConfigured()) {
    throw new Error('QuickBooks is not configured with valid credentials');
  }
  
  try {
    const qbo = createQuickBooksClient(credentials);
    
    return new Promise((resolve, reject) => {
      qbo.findCustomers({}, (err: any, customers: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            success: true,
            customers: customers.QueryResponse.Customer
          });
        }
      });
    });
    
  } catch (error: any) {
    console.error('Error getting QuickBooks customers:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Refresh OAuth token
 * @param {Object} credentials - The QuickBooks OAuth credentials
 * @returns {Promise<Object>} The new OAuth tokens
 */
export async function refreshToken(credentials: any): Promise<any> {
  if (!isConfigured()) {
    throw new Error('QuickBooks is not configured with valid credentials');
  }
  
  try {
    oauthClient.setToken(credentials);
    const authResponse = await oauthClient.refresh();
    const tokens = authResponse.getJson();
    return {
      success: true,
      tokens
    };
  } catch (error: any) {
    console.error('Error refreshing OAuth token:', error);
    return {
      success: false,
      error: error.message
    };
  }
}