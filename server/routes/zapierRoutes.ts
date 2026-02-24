/**
 * Zapier Integration Routes + API Key Management
 *
 * Provides:
 * 1. API Key CRUD (session auth — user must be logged in to manage keys)
 * 2. Zapier REST Hook subscribe/unsubscribe (API key auth)
 * 3. Polling endpoints for Zapier editor sample data (API key auth)
 * 4. Action endpoints — create records via Zapier (API key auth)
 * 5. Search endpoints — find records via Zapier (API key auth)
 */

import { Request, Response } from 'express';
import { randomBytes, createHash } from 'crypto';
import { isAuthenticated, authenticateApiKey } from '../auth';
import { pool } from '../db';
import * as webhookService from '../services/webhookService';
import { fireEvent } from '../services/webhookService';
import {
  insertCustomerSchema,
  insertAppointmentSchema,
  insertJobSchema,
  insertInvoiceSchema,
  insertInvoiceItemSchema,
} from '@shared/schema';

// Helper: get businessId from either session or API key
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as any).apiKeyBusinessId) {
    return (req as any).apiKeyBusinessId;
  }
  throw new Error('Business ID not found');
};

// Generate a new API key: sbz_ + 32 random hex chars
function generateApiKey(): string {
  return 'sbz_' + randomBytes(16).toString('hex');
}

export function registerZapierRoutes(app: any) {

  // ============================================================
  // API KEY MANAGEMENT (session auth — user must be logged in)
  // ============================================================

  /**
   * GET /api/api-keys — List all API keys for the business
   */
  app.get('/api/api-keys', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await pool.query(
        `SELECT id, business_id, name, key_prefix, last_used_at, active, created_at
         FROM api_keys
         WHERE business_id = $1
         ORDER BY created_at DESC`,
        [businessId]
      );
      res.json(result.rows);
    } catch (error: any) {
      console.error('[ApiKeys] Error listing:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/api-keys — Generate a new API key
   * Returns the full key ONCE (stored as hash, never shown again)
   */
  app.post('/api/api-keys', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'Name is required' });
      }

      const apiKey = generateApiKey();
      const keyHash = createHash('sha256').update(apiKey).digest('hex');
      const keyPrefix = apiKey.substring(0, 12) + '...'; // "sbz_a1b2c3d4..."

      const result = await pool.query(
        `INSERT INTO api_keys (business_id, name, key_hash, key_prefix)
         VALUES ($1, $2, $3, $4)
         RETURNING id, business_id, name, key_prefix, active, created_at`,
        [businessId, name.trim(), keyHash, keyPrefix]
      );

      // Return the full key ONCE — it's never stored in plaintext
      res.status(201).json({
        ...result.rows[0],
        key: apiKey, // Only returned on creation!
      });
    } catch (error: any) {
      console.error('[ApiKeys] Error creating:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * DELETE /api/api-keys/:id — Revoke an API key
   */
  app.delete('/api/api-keys/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const keyId = parseInt(req.params.id);
      const result = await pool.query(
        `DELETE FROM api_keys WHERE id = $1 AND business_id = $2 RETURNING id`,
        [keyId, businessId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'API key not found' });
      }
      res.json({ message: 'API key revoked' });
    } catch (error: any) {
      console.error('[ApiKeys] Error deleting:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/api-keys/test — Test API key auth (used by Zapier to verify connection)
   */
  app.get('/api/api-keys/test', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = (req as any).apiKeyBusinessId;
      const businessName = (req as any).apiKeyBusinessName;
      res.json({
        ok: true,
        businessId,
        businessName,
        message: 'API key is valid',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // ZAPIER REST HOOK ENDPOINTS (API key auth)
  // ============================================================

  /**
   * POST /api/zapier/hooks — Subscribe (Zapier calls this when a Zap is turned on)
   * Body: { hookUrl: string, event: string }
   * Returns: { id: number } — Zapier stores this for unsubscribe
   */
  app.post('/api/zapier/hooks', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { hookUrl, event } = req.body;

      if (!hookUrl || !event) {
        return res.status(400).json({ message: 'hookUrl and event are required' });
      }

      // Validate URL
      try {
        new URL(hookUrl);
      } catch {
        return res.status(400).json({ message: 'Invalid hookUrl format' });
      }

      // Validate event
      if (!webhookService.WEBHOOK_EVENTS.includes(event as any)) {
        return res.status(400).json({ message: `Invalid event: ${event}. Supported: ${webhookService.WEBHOOK_EVENTS.join(', ')}` });
      }

      // Create a webhook with source = 'zapier'
      const webhook = await webhookService.createWebhook(businessId, hookUrl, [event], 'Zapier subscription', 'zapier');
      res.status(201).json({ id: webhook.id });
    } catch (error: any) {
      console.error('[Zapier] Error subscribing hook:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * DELETE /api/zapier/hooks/:id — Unsubscribe (Zapier calls this when a Zap is turned off)
   */
  app.delete('/api/zapier/hooks/:id', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const webhookId = parseInt(req.params.id);
      const deleted = await webhookService.deleteWebhook(webhookId, businessId);
      if (!deleted) {
        return res.status(404).json({ message: 'Hook not found' });
      }
      res.json({ message: 'Unsubscribed' });
    } catch (error: any) {
      console.error('[Zapier] Error unsubscribing hook:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================
  // POLLING ENDPOINTS (API key auth — sample data for Zapier editor)
  // ============================================================

  /**
   * GET /api/zapier/polling/appointments — Recent appointments
   */
  app.get('/api/zapier/polling/appointments', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await pool.query(
        `SELECT a.*, c.first_name AS customer_first_name, c.last_name AS customer_last_name
         FROM appointments a
         LEFT JOIN customers c ON c.id = a.customer_id
         WHERE a.business_id = $1
         ORDER BY a.created_at DESC
         LIMIT 5`,
        [businessId]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/zapier/polling/customers — Recent customers
   */
  app.get('/api/zapier/polling/customers', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await pool.query(
        `SELECT * FROM customers WHERE business_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [businessId]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/zapier/polling/invoices — Recent invoices
   */
  app.get('/api/zapier/polling/invoices', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await pool.query(
        `SELECT i.*, c.first_name AS customer_first_name, c.last_name AS customer_last_name
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.business_id = $1
         ORDER BY i.created_at DESC
         LIMIT 5`,
        [businessId]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/zapier/polling/jobs — Recent jobs
   */
  app.get('/api/zapier/polling/jobs', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await pool.query(
        `SELECT j.*, c.first_name AS customer_first_name, c.last_name AS customer_last_name
         FROM jobs j
         LEFT JOIN customers c ON c.id = j.customer_id
         WHERE j.business_id = $1
         ORDER BY j.created_at DESC
         LIMIT 5`,
        [businessId]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/zapier/polling/calls — Recent call logs
   */
  app.get('/api/zapier/polling/calls', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await pool.query(
        `SELECT * FROM call_logs WHERE business_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [businessId]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/zapier/polling/quotes — Recent quotes
   */
  app.get('/api/zapier/polling/quotes', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await pool.query(
        `SELECT q.*, c.first_name AS customer_first_name, c.last_name AS customer_last_name
         FROM quotes q
         LEFT JOIN customers c ON c.id = q.customer_id
         WHERE q.business_id = $1
         ORDER BY q.created_at DESC
         LIMIT 5`,
        [businessId]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================
  // ACTION ENDPOINTS (API key auth — Zapier creates records)
  // ============================================================

  /**
   * POST /api/zapier/actions/customers — Create a customer
   */
  app.post('/api/zapier/actions/customers', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { firstName, lastName, phone, email, address, city, state, zip, notes } = req.body;

      if (!firstName && !lastName) {
        return res.status(400).json({ message: 'At least firstName or lastName is required' });
      }

      const result = await pool.query(
        `INSERT INTO customers (business_id, first_name, last_name, phone, email, address, city, state, zip, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [businessId, firstName || '', lastName || '', phone || null, email || null, address || null, city || null, state || null, zip || null, notes || null]
      );

      const customer = result.rows[0];

      // Fire webhook event
      fireEvent(businessId, 'customer.created', { customer }).catch(err =>
        console.error('[Zapier] Webhook fire error:', err)
      );

      res.status(201).json(customer);
    } catch (error: any) {
      console.error('[Zapier] Error creating customer:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/zapier/actions/appointments — Create an appointment
   */
  app.post('/api/zapier/actions/appointments', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { customerId, staffId, serviceId, startDate, endDate, status, notes } = req.body;

      if (!customerId || !startDate || !endDate) {
        return res.status(400).json({ message: 'customerId, startDate, and endDate are required' });
      }

      const result = await pool.query(
        `INSERT INTO appointments (business_id, customer_id, staff_id, service_id, start_date, end_date, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [businessId, customerId, staffId || null, serviceId || null, startDate, endDate, status || 'scheduled', notes || null]
      );

      const appointment = result.rows[0];

      // Fire webhook event
      fireEvent(businessId, 'appointment.created', { appointment }).catch(err =>
        console.error('[Zapier] Webhook fire error:', err)
      );

      res.status(201).json(appointment);
    } catch (error: any) {
      console.error('[Zapier] Error creating appointment:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/zapier/actions/jobs — Create a job
   */
  app.post('/api/zapier/actions/jobs', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { customerId, appointmentId, staffId, title, description, scheduledDate, status, notes } = req.body;

      if (!title) {
        return res.status(400).json({ message: 'title is required' });
      }

      const result = await pool.query(
        `INSERT INTO jobs (business_id, customer_id, appointment_id, staff_id, title, description, scheduled_date, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING *`,
        [businessId, customerId || null, appointmentId || null, staffId || null, title, description || null, scheduledDate || null, status || 'pending', notes || null]
      );

      const job = result.rows[0];

      // Fire webhook event
      fireEvent(businessId, 'job.created', { job }).catch(err =>
        console.error('[Zapier] Webhook fire error:', err)
      );

      res.status(201).json(job);
    } catch (error: any) {
      console.error('[Zapier] Error creating job:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/zapier/actions/invoices — Create an invoice
   */
  app.post('/api/zapier/actions/invoices', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { customerId, jobId, invoiceNumber, amount, tax, total, dueDate, notes, items } = req.body;

      if (!customerId) {
        return res.status(400).json({ message: 'customerId is required' });
      }

      // Auto-generate invoice number if not provided
      const invNumber = invoiceNumber || `INV-${Date.now()}`;
      const invTotal = total || (amount || 0) + (tax || 0);

      const result = await pool.query(
        `INSERT INTO invoices (business_id, customer_id, job_id, invoice_number, amount, tax, total, due_date, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unpaid', $9, NOW(), NOW())
         RETURNING *`,
        [businessId, customerId, jobId || null, invNumber, amount || 0, tax || 0, invTotal, dueDate || null, notes || null]
      );

      const invoice = result.rows[0];

      // Create invoice items if provided
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await pool.query(
            `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
             VALUES ($1, $2, $3, $4, $5)`,
            [invoice.id, item.description || '', item.quantity || 1, item.unitPrice || 0, item.amount || 0]
          );
        }
      }

      // Fire webhook event
      fireEvent(businessId, 'invoice.created', { invoice }).catch(err =>
        console.error('[Zapier] Webhook fire error:', err)
      );

      res.status(201).json(invoice);
    } catch (error: any) {
      console.error('[Zapier] Error creating invoice:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/zapier/actions/quotes — Create a quote
   */
  app.post('/api/zapier/actions/quotes', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { customerId, quoteNumber, amount, tax, total, validUntil, notes, items } = req.body;

      if (!customerId) {
        return res.status(400).json({ message: 'customerId is required' });
      }

      const qNumber = quoteNumber || `QTE-${Date.now()}`;
      const qTotal = total || (amount || 0) + (tax || 0);

      const result = await pool.query(
        `INSERT INTO quotes (business_id, customer_id, quote_number, amount, tax, total, valid_until, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, NOW(), NOW())
         RETURNING *`,
        [businessId, customerId, qNumber, amount || 0, tax || 0, qTotal, validUntil || null, notes || null]
      );

      const quote = result.rows[0];

      // Create quote items if provided
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await pool.query(
            `INSERT INTO quote_items (quote_id, description, quantity, unit_price, amount)
             VALUES ($1, $2, $3, $4, $5)`,
            [quote.id, item.description || '', item.quantity || 1, item.unitPrice || 0, item.amount || 0]
          );
        }
      }

      // Fire webhook event
      fireEvent(businessId, 'quote.created', { quote }).catch(err =>
        console.error('[Zapier] Webhook fire error:', err)
      );

      res.status(201).json(quote);
    } catch (error: any) {
      console.error('[Zapier] Error creating quote:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================
  // SEARCH ENDPOINTS (API key auth — Zapier finds records)
  // ============================================================

  /**
   * GET /api/zapier/search/customers — Find customers by name, email, or phone
   */
  app.get('/api/zapier/search/customers', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { email, phone, name } = req.query;

      let query = `SELECT * FROM customers WHERE business_id = $1`;
      const params: any[] = [businessId];

      if (email) {
        params.push(email);
        query += ` AND LOWER(email) = LOWER($${params.length})`;
      }
      if (phone) {
        params.push(phone);
        query += ` AND phone = $${params.length}`;
      }
      if (name) {
        params.push(`%${name}%`);
        query += ` AND (LOWER(first_name) LIKE LOWER($${params.length}) OR LOWER(last_name) LIKE LOWER($${params.length}))`;
      }

      query += ` ORDER BY created_at DESC LIMIT 10`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error: any) {
      console.error('[Zapier] Error searching customers:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/zapier/search/appointments — Find appointments by customer, date, or status
   */
  app.get('/api/zapier/search/appointments', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { customerId, date, status } = req.query;

      let query = `SELECT a.*, c.first_name AS customer_first_name, c.last_name AS customer_last_name
                    FROM appointments a
                    LEFT JOIN customers c ON c.id = a.customer_id
                    WHERE a.business_id = $1`;
      const params: any[] = [businessId];

      if (customerId) {
        params.push(parseInt(customerId as string));
        query += ` AND a.customer_id = $${params.length}`;
      }
      if (date) {
        params.push(date);
        query += ` AND DATE(a.start_date) = DATE($${params.length}::timestamp)`;
      }
      if (status) {
        params.push(status);
        query += ` AND a.status = $${params.length}`;
      }

      query += ` ORDER BY a.start_date DESC LIMIT 10`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error: any) {
      console.error('[Zapier] Error searching appointments:', error);
      res.status(500).json({ message: error.message });
    }
  });
}
