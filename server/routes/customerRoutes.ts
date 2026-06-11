import { Router } from "express";
import { storage } from "../storage";
import { eq, and, desc, like, ilike, or } from "drizzle-orm";
import { customers, insertCustomerSchema } from "@shared/schema";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { logAndSwallow } from '../utils/safeAsync';
import { toMoney } from '../utils/money';
import { fireEvent } from '../services/webhookService';

const router = Router();

// Get all customers for the current business
router.get("/customers", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Get query parameters for filtering, searching, and pagination
    const search = req.query.search as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

    const allCustomers = await storage.getCustomers(businessId, {
      limit: limit && !isNaN(limit) ? Math.min(limit, 500) : undefined,
      offset: offset && !isNaN(offset) ? offset : undefined,
    });

    res.json(allCustomers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// Get enriched customer list with stats (revenue, calls, last visit, status)
router.get("/customers/enriched", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    const search = (req.query.search as string) || '';
    const archived = req.query.archived === 'true';

    // Single query that joins customers with invoice totals, appointment data (with service revenue), and call counts
    let query = `
      SELECT
        c.*,
        COALESCE(inv.invoice_revenue, 0) AS invoice_revenue,
        COALESCE(inv.paid_invoice_count, 0) AS paid_invoice_count,
        COALESCE(inv.open_invoice_count, 0) AS open_invoice_count,
        COALESCE(apt.appointment_revenue, 0) AS appointment_revenue,
        COALESCE(inv.invoice_revenue, 0) + COALESCE(apt.appointment_revenue, 0) AS total_revenue,
        apt.last_visit,
        COALESCE(apt.appointment_count, 0) AS appointment_count,
        COALESCE(apt.completed_count, 0) AS completed_appointment_count,
        COALESCE(calls.call_count, 0) AS call_count,
        calls.last_call_date
      FROM customers c
      LEFT JOIN (
        SELECT
          customer_id,
          SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) AS invoice_revenue,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_invoice_count,
          COUNT(CASE WHEN status IN ('pending', 'overdue') THEN 1 END) AS open_invoice_count
        FROM invoices
        WHERE business_id = $1
        GROUP BY customer_id
      ) inv ON inv.customer_id = c.id
      LEFT JOIN (
        SELECT
          a.customer_id,
          MAX(CASE WHEN a.status IN ('completed', 'confirmed') THEN a.start_date END) AS last_visit,
          COUNT(*) AS appointment_count,
          COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS completed_count,
          COALESCE(SUM(CASE WHEN a.status = 'completed' THEN s.price ELSE 0 END), 0) AS appointment_revenue
        FROM appointments a
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.business_id = $1
        GROUP BY a.customer_id
      ) apt ON apt.customer_id = c.id
      LEFT JOIN (
        SELECT
          caller_id,
          COUNT(*) AS call_count,
          MAX(call_time) AS last_call_date
        FROM call_logs
        WHERE business_id = $1
        GROUP BY caller_id
      ) calls ON calls.caller_id = c.phone
      WHERE c.business_id = $1 AND c.deleted_at IS NULL
    `;

    const params: any[] = [businessId];

    // Filter by archived status
    if (archived) {
      query += ` AND c.is_archived = true`;
    } else {
      query += ` AND (c.is_archived = false OR c.is_archived IS NULL)`;
    }

    if (search) {
      params.push(`%${search}%`);
      const searchIdx = params.length;
      query += ` AND (
        c.first_name ILIKE $${searchIdx}
        OR c.last_name ILIKE $${searchIdx}
        OR c.phone ILIKE $${searchIdx}
        OR c.email ILIKE $${searchIdx}
      )`;
    }

    query += ` ORDER BY c.created_at DESC`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching enriched customers:", error);
    res.status(500).json({ error: "Failed to fetch enriched customers" });
  }
});

// Get all unique tags for a business — MUST be before /customers/:id to avoid route collision
router.get("/customers/tags", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessId = req.user.businessId;
    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    const allCustomers = await storage.getCustomers(businessId);
    const tagSet = new Set<string>();
    for (const c of allCustomers) {
      if ((c as any).tags) {
        try {
          const parsed = JSON.parse((c as any).tags);
          if (Array.isArray(parsed)) parsed.forEach((t: string) => tagSet.add(t));
        } catch (err) { console.error('[CustomerRoutes] Error:', err instanceof Error ? err.message : err); }
      }
    }
    res.json(Array.from(tagSet).sort());
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// Bulk import customers from CSV data
router.post("/customers/import", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const businessId = req.user.businessId;
    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    const importSchema = z.object({
      customers: z.array(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().optional().default(""),
        phone: z.string().min(1),
        tags: z.string().optional(),
        notes: z.string().optional(),
      })).min(1, "At least one customer is required").max(500, "Maximum 500 customers per import"),
    });

    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid import data",
        details: parsed.error.errors,
      });
    }

    const rows = parsed.data.customers;
    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Validate email format if provided
        if (row.email && row.email.trim()) {
          const emailCheck = z.string().email().safeParse(row.email.trim());
          if (!emailCheck.success) {
            errors.push({ row: i + 1, reason: `Invalid email: ${row.email}` });
            skipped++;
            continue;
          }
        }

        // Validate phone has at least some digits
        const phoneDigits = row.phone.replace(/\D/g, "");
        if (phoneDigits.length < 7) {
          errors.push({ row: i + 1, reason: `Invalid phone number: ${row.phone}` });
          skipped++;
          continue;
        }

        // Check for duplicate phone within this business
        const existing = await storage.getCustomerByPhone(row.phone, businessId);
        if (existing) {
          errors.push({ row: i + 1, reason: `Duplicate phone number: ${row.phone} (${existing.firstName} ${existing.lastName})` });
          skipped++;
          continue;
        }

        await storage.createCustomer({
          businessId,
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          email: row.email?.trim() || null,
          phone: row.phone.trim(),
          notes: row.notes?.trim() || null,
          tags: row.tags?.trim() || null,
        });

        imported++;
      } catch (err: any) {
        // Handle unique constraint violations (race condition on duplicate phone)
        if (err.code === "23505") {
          errors.push({ row: i + 1, reason: `Duplicate phone number: ${row.phone}` });
          skipped++;
        } else {
          errors.push({ row: i + 1, reason: `Failed to create: ${err.message || "Unknown error"}` });
          skipped++;
        }
      }
    }

    res.json({ imported, skipped, errors });
  } catch (error: any) {
    console.error("Error importing customers:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid import data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to import customers" });
  }
});

// Communication timeline for a specific customer
router.get("/customers/:id/timeline", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const businessId = req.user.businessId;
    const customerId = parseInt(req.params.id);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }
    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    // Verify customer belongs to this business
    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Fetch all communication data in parallel
    const notificationsQuery = pool.query(
      `SELECT id, type, channel, recipient, subject, message, status, reference_type, reference_id, sent_at
       FROM notification_log
       WHERE business_id = $1 AND customer_id = $2
       ORDER BY sent_at DESC
       LIMIT $3`,
      [businessId, customerId, limit]
    );

    const agentActivityQuery = pool.query(
      `SELECT id, agent_type, action, reference_type, reference_id, details, created_at
       FROM agent_activity_log
       WHERE business_id = $1 AND customer_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [businessId, customerId, limit]
    );

    const smsConversationsQuery = pool.query(
      `SELECT id, agent_type, reference_type, reference_id, state, context, last_message_sent_at, last_reply_received_at, created_at
       FROM sms_conversations
       WHERE business_id = $1 AND customer_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [businessId, customerId, limit]
    );

    const callLogsQuery = pool.query(
      `SELECT id, caller_id, caller_name, status, transcript, intent_detected, call_duration, recording_url, call_time, created_at
       FROM call_logs
       WHERE business_id = $1 AND caller_id = $2
       ORDER BY call_time DESC
       LIMIT $3`,
      [businessId, customer.phone, limit]
    );

    const appointmentsQuery = pool.query(
      `SELECT a.id, a.start_date, a.end_date, a.status, a.notes, s.name as service_name,
              CONCAT(st.first_name, ' ', st.last_name) as staff_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN staff st ON st.id = a.staff_id
       WHERE a.business_id = $1 AND a.customer_id = $2
       ORDER BY a.start_date DESC
       LIMIT $3`,
      [businessId, customerId, limit]
    );

    const [notifications, agentActivity, smsConvos, callLogs, appointments] = await Promise.all([
      notificationsQuery.catch(() => ({ rows: [] })),
      agentActivityQuery.catch(() => ({ rows: [] })),
      smsConversationsQuery.catch(() => ({ rows: [] })),
      callLogsQuery.catch(() => ({ rows: [] })),
      appointmentsQuery.catch(() => ({ rows: [] })),
    ]);

    // Build unified timeline
    const timeline: Array<{
      type: string;
      timestamp: string;
      title: string;
      details: string | null;
      channel?: string;
      id: number;
      status?: string | null;
    }> = [];

    // Notification log entries
    for (const n of notifications.rows) {
      const channelLabel = n.channel === 'sms' ? 'SMS' : 'Email';
      const typeLabel = (n.type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      timeline.push({
        type: n.channel === 'sms' ? 'sms' : 'email',
        timestamp: n.sent_at,
        title: `${channelLabel}: ${typeLabel}`,
        details: n.message ? (n.message.length > 150 ? n.message.substring(0, 150) + '...' : n.message) : null,
        channel: n.channel,
        id: n.id,
        status: n.status,
      });
    }

    // Agent activity entries
    for (const a of agentActivity.rows) {
      const agentLabel = (a.agent_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const actionLabel = (a.action || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      let detailText: string | null = null;
      if (a.details) {
        try {
          const d = typeof a.details === 'string' ? JSON.parse(a.details) : a.details;
          detailText = d.message || d.response || d.reason || null;
        } catch { /* ignore */ }
      }
      timeline.push({
        type: 'agent',
        timestamp: a.created_at,
        title: `${agentLabel} - ${actionLabel}`,
        details: detailText,
        id: a.id,
      });
    }

    // SMS conversation entries
    for (const s of smsConvos.rows) {
      const agentLabel = (s.agent_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      timeline.push({
        type: 'sms',
        timestamp: s.created_at,
        title: `SMS Conversation: ${agentLabel}`,
        details: `State: ${(s.state || '').replace(/_/g, ' ')}`,
        channel: 'sms',
        id: s.id,
        status: s.state,
      });
    }

    // Call log entries
    for (const c of callLogs.rows) {
      const isSms = c.status === 'sms';
      timeline.push({
        type: isSms ? 'sms' : 'call',
        timestamp: c.call_time || c.created_at,
        title: isSms ? 'SMS Message' : `Phone Call${c.intent_detected ? ` - ${c.intent_detected}` : ''}`,
        details: isSms
          ? (c.transcript ? (c.transcript.length > 150 ? c.transcript.substring(0, 150) + '...' : c.transcript) : null)
          : (c.call_duration ? `${Math.floor(c.call_duration / 60)}m ${c.call_duration % 60}s` : null),
        channel: isSms ? 'sms' : 'phone',
        id: c.id,
        status: c.status,
      });
    }

    // Appointment entries
    for (const a of appointments.rows) {
      let title = a.service_name || 'Appointment';
      if (a.staff_name && a.staff_name.trim()) title += ` with ${a.staff_name.trim()}`;
      timeline.push({
        type: 'appointment',
        timestamp: a.start_date,
        title,
        details: null,
        id: a.id,
        status: a.status,
      });
    }

    // Sort by timestamp descending, take limit
    timeline.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return dateB - dateA;
    });

    res.json(timeline.slice(0, limit));
  } catch (error) {
    console.error("Error fetching customer timeline:", error);
    res.status(500).json({ error: "Failed to fetch customer timeline" });
  }
});

// Get a specific customer by ID
router.get("/customers/:id", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const customerId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    const customer = await storage.getCustomer(customerId);
    
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
});

// Create a new customer
router.post("/customers", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Define the schema for the request body
    const createCustomerSchema = z.object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      email: z.string().email("Invalid email address"),
      phone: z.string().min(1, "Phone number is required"),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipcode: z.string().optional(),
      birthday: z.string().optional(), // MM-DD format
      tags: z.array(z.string()).optional(), // Customer tags/labels
      // SMS consent fields (TCPA compliance)
      smsOptIn: z.boolean().optional(),
      smsOptInDate: z.string().optional(),
      smsOptInMethod: z.string().optional(),
      marketingOptIn: z.boolean().optional(),
      marketingOptInDate: z.string().optional(),
    });

    // Validate the request body
    const validatedData = createCustomerSchema.parse(req.body);

    // Create the customer
    const customerData: any = {
      businessId,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      email: validatedData.email,
      phone: validatedData.phone,
      address: validatedData.address || null,
      city: validatedData.city || null,
      state: validatedData.state || null,
      zipcode: validatedData.zipcode || null,
      birthday: validatedData.birthday || null,
      tags: validatedData.tags ? JSON.stringify(validatedData.tags) : null,
    };

    // Add SMS consent fields if provided
    if (validatedData.smsOptIn !== undefined) {
      customerData.smsOptIn = validatedData.smsOptIn;
      if (validatedData.smsOptIn) {
        customerData.smsOptInDate = validatedData.smsOptInDate ? new Date(validatedData.smsOptInDate) : new Date();
        customerData.smsOptInMethod = validatedData.smsOptInMethod || 'manual';
      }
    }
    if (validatedData.marketingOptIn !== undefined) {
      customerData.marketingOptIn = validatedData.marketingOptIn;
      if (validatedData.marketingOptIn) {
        customerData.marketingOptInDate = validatedData.marketingOptInDate ? new Date(validatedData.marketingOptInDate) : new Date();
      }
    }

    const newCustomer = await storage.createCustomer(customerData);

    // Send TCPA welcome SMS if customer was created with smsOptIn
    if (newCustomer.smsOptIn && newCustomer.phone) {
      import('../services/notificationService').then(ns => {
        ns.sendSmsOptInWelcome(newCustomer.id, businessId).catch(logAndSwallow('CustomerRoutes'));
      }).catch(logAndSwallow('CustomerRoutes'));
    }

    // Fire webhook event (fire-and-forget)
    fireEvent(businessId, 'customer.created', { customer: newCustomer })
      .catch(err => console.error('Webhook fire error:', err));

    res.status(201).json(newCustomer);
  } catch (error: any) {
    console.error("Error creating customer:", error);

    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid customer data", details: error.errors });
    }

    res.status(500).json({ error: "Failed to create customer" });
  }
});

// Update a customer (PUT + PATCH for compatibility)
const updateCustomerHandler: import("express").RequestHandler = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const customerId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    // Check if the customer exists and belongs to the business
    const existingCustomer = await storage.getCustomer(customerId);
    if (!existingCustomer || existingCustomer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Define the schema for the request body
    const updateCustomerSchema = z.object({
      firstName: z.string().min(1, "First name is required").optional(),
      lastName: z.string().min(1, "Last name is required").optional(),
      email: z.string().email("Invalid email address").optional(),
      phone: z.string().min(1, "Phone number is required").optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipcode: z.string().optional(),
      birthday: z.string().optional(), // MM-DD format
      tags: z.union([z.array(z.string()), z.string()]).optional(), // Customer tags/labels (array or JSON string)
      // SMS consent fields (TCPA compliance)
      smsOptIn: z.boolean().optional(),
      smsOptInDate: z.string().optional(),
      smsOptInMethod: z.string().optional(),
      marketingOptIn: z.boolean().optional(),
      marketingOptInDate: z.string().optional(),
    });

    // Validate the request body
    const validatedData = updateCustomerSchema.parse(req.body);

    // Build update data with consent timestamps
    const updateData: any = { ...validatedData };
    if (validatedData.tags) {
      updateData.tags = Array.isArray(validatedData.tags)
        ? JSON.stringify(validatedData.tags)
        : validatedData.tags; // Already a JSON string
    }
    if (validatedData.smsOptIn === true && !existingCustomer.smsOptIn) {
      updateData.smsOptInDate = validatedData.smsOptInDate ? new Date(validatedData.smsOptInDate) : new Date();
      updateData.smsOptInMethod = validatedData.smsOptInMethod || 'manual';
    }
    if (validatedData.marketingOptIn === true && !existingCustomer.marketingOptIn) {
      updateData.marketingOptInDate = validatedData.marketingOptInDate ? new Date(validatedData.marketingOptInDate) : new Date();
    }

    // Update the customer
    const updatedCustomer = await storage.updateCustomer(customerId, updateData);

    // Fire webhook event (fire-and-forget)
    fireEvent(businessId, 'customer.updated', { customer: updatedCustomer })
      .catch(err => console.error('Webhook fire error:', err));

    res.json(updatedCustomer);
  } catch (error: any) {
    console.error("Error updating customer:", error);

    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid customer data", details: error.errors });
    }

    res.status(500).json({ error: "Failed to update customer" });
  }
};
router.put("/customers/:id", updateCustomerHandler);
router.patch("/customers/:id", updateCustomerHandler);

// Delete a customer
router.delete("/customers/:id", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const customerId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    // Check if the customer exists and belongs to the business
    const existingCustomer = await storage.getCustomer(customerId);
    if (!existingCustomer || existingCustomer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Delete the customer
    await storage.deleteCustomer(customerId, businessId);

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

// ── Archive / Restore ──

// Archive a customer
router.post("/customers/:id/archive", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessId = req.user.businessId;
    const customerId = parseInt(req.params.id);
    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }
    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const updated = await storage.archiveCustomer(customerId, businessId);
    res.json(updated);
  } catch (error) {
    console.error("Error archiving customer:", error);
    res.status(500).json({ error: "Failed to archive customer" });
  }
});

// Restore a customer (unarchive + clear deletedAt)
router.post("/customers/:id/restore", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessId = req.user.businessId;
    const customerId = parseInt(req.params.id);
    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }
    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const updated = await storage.restoreCustomer(customerId, businessId);
    res.json(updated);
  } catch (error) {
    console.error("Error restoring customer:", error);
    res.status(500).json({ error: "Failed to restore customer" });
  }
});

// ── GDPR / CCPA Data Subject Rights ──

/**
 * POST /customers/:id/erase — GDPR Art. 17 erasure.
 *
 * IRREVERSIBLE. Anonymizes the customer record, scrubs PII from retained
 * transactional records (appointments/jobs/invoices/quotes/call logs), hard-
 * deletes behavioral data (AI intelligence, insights, SMS threads, equipment,
 * etc.), and deletes Mem0 AI memories. Requires `{ "confirm": true }` in the
 * body so a stray client call can't destroy data. Refused (409) while the
 * customer has an active membership — cancel billing first.
 */
router.post("/customers/:id/erase", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessId = req.user.businessId;
    const customerId = parseInt(req.params.id);
    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }
    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        error: "Erasure is irreversible. Pass { \"confirm\": true } to proceed.",
        code: "CONFIRMATION_REQUIRED",
      });
    }

    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const { eraseCustomer } = await import("../services/customerErasureService");
    const result = await eraseCustomer(customerId, businessId, req.user.id);

    if (!result.ok) {
      if (result.reason === 'active_membership') {
        return res.status(409).json({ error: result.message, code: "ACTIVE_MEMBERSHIP" });
      }
      if (result.reason === 'customer_not_found') {
        return res.status(404).json({ error: "Customer not found" });
      }
      return res.status(500).json({ error: result.message || "Erasure failed" });
    }

    res.json({ success: true, counts: result.counts, mem0Deleted: result.mem0Deleted });
  } catch (error) {
    console.error("Error erasing customer:", error);
    res.status(500).json({ error: "Failed to erase customer" });
  }
});

/**
 * GET /customers/:id/export — GDPR Art. 20 / CCPA right-to-know.
 * Returns a JSON bundle of everything held about the customer.
 */
router.get("/customers/:id/export", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessId = req.user.businessId;
    const customerId = parseInt(req.params.id);
    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }
    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const { exportCustomerData } = await import("../services/customerErasureService");
    const bundle = await exportCustomerData(customerId, businessId, req.user.id);
    if (!bundle) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.setHeader('Content-Disposition', `attachment; filename="customer-${customerId}-export.json"`);
    res.json(bundle);
  } catch (error) {
    console.error("Error exporting customer data:", error);
    res.status(500).json({ error: "Failed to export customer data" });
  }
});

// ── Customer Tags ──

// Add tags to a customer
router.post("/customers/:id/tags", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessId = req.user.businessId;
    const customerId = parseInt(req.params.id);
    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const { tags } = z.object({ tags: z.array(z.string()) }).parse(req.body);

    // Merge with existing tags
    let existingTags: string[] = [];
    if ((customer as any).tags) {
      try { existingTags = JSON.parse((customer as any).tags); } catch (err) { console.error('[CustomerRoutes] Error:', err instanceof Error ? err.message : err); }
    }
    const merged = Array.from(new Set([...existingTags, ...tags]));

    const updated = await storage.updateCustomer(customerId, { tags: JSON.stringify(merged) } as any);
    res.json(updated);
  } catch (error: any) {
    console.error("Error adding tags:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid tag data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to add tags" });
  }
});

// Remove a tag from a customer
router.delete("/customers/:id/tags/:tag", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const businessId = req.user.businessId;
    const customerId = parseInt(req.params.id);
    const tagToRemove = decodeURIComponent(req.params.tag);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    let existingTags: string[] = [];
    if ((customer as any).tags) {
      try { existingTags = JSON.parse((customer as any).tags); } catch (err) { console.error('[CustomerRoutes] Error:', err instanceof Error ? err.message : err); }
    }
    const filtered = existingTags.filter(t => t !== tagToRemove);

    const updated = await storage.updateCustomer(customerId, { tags: JSON.stringify(filtered) } as any);
    res.json(updated);
  } catch (error) {
    console.error("Error removing tag:", error);
    res.status(500).json({ error: "Failed to remove tag" });
  }
});

// ── Customer Activity (stats + timeline) ──
router.get("/customers/:id/activity", isAuthenticated, async (req, res) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) {
      return res.status(400).json({ error: "No business associated with this account" });
    }

    const customerId = parseInt(req.params.id);
    if (isNaN(customerId)) {
      return res.status(400).json({ error: "Invalid customer ID" });
    }

    // Verify customer belongs to this business
    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Fetch all related data in parallel (including call logs, services, staff, and call intelligence)
    const [customerJobs, customerInvoices, customerAppointments, customerQuotes, allCallLogs, allServices, allStaff] = await Promise.all([
      storage.getJobs(businessId, { customerId }),
      storage.getInvoices(businessId, { customerId }),
      storage.getAppointments(businessId, { customerId }),
      storage.getAllQuotes(businessId, { customerId }),
      storage.getCallLogs(businessId).catch(() => []),
      storage.getServices(businessId).catch(() => []),
      storage.getStaff(businessId).catch(() => []),
    ]);

    // Build lookup maps for service/staff names
    const serviceMap = new Map((allServices as any[]).map(s => [s.id, s.name]));
    const staffMap = new Map((allStaff as any[]).map(s => [s.id, `${s.firstName} ${s.lastName}`.trim()]));

    // Filter call logs for this customer (by phone number match)
    const customerCallLogs = customer.phone
      ? allCallLogs.filter((log: any) => {
          const normalizedLogPhone = (log.callerId || '').replace(/\D/g, '');
          const normalizedCustomerPhone = (customer.phone || '').replace(/\D/g, '');
          return normalizedLogPhone === normalizedCustomerPhone ||
                 normalizedLogPhone.endsWith(normalizedCustomerPhone) ||
                 normalizedCustomerPhone.endsWith(normalizedLogPhone);
        })
      : [];

    // Calculate stats
    const totalJobs = customerJobs.length;

    const paidInvoices = customerInvoices.filter((inv) => inv.status === "paid");
    const totalSpent = paidInvoices.reduce((sum, inv) => sum + toMoney(inv.total), 0);

    const activeInvoices = customerInvoices.filter(
      (inv) => inv.status === "pending" || inv.status === "overdue"
    ).length;

    // Most recent completed appointment
    const completedAppointments = customerAppointments
      .filter((apt) => apt.status === "completed" || apt.status === "confirmed")
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    const lastVisit = completedAppointments.length > 0
      ? completedAppointments[0].startDate
      : null;

    // Build timeline array sorted by date (newest first)
    const timeline: Array<{
      type: string;
      id: number;
      title: string;
      status: string | null;
      date: string | Date | null;
      amount?: number | null;
      serviceName?: string | null;
      staffName?: string | null;
      callDuration?: number | null;
      summary?: string | null;
      intentDetected?: string | null;
      transcript?: string | null;
    }> = [];

    for (const job of customerJobs) {
      timeline.push({
        type: "job",
        id: job.id,
        title: job.title,
        status: job.status,
        date: job.createdAt,
      });
    }

    for (const inv of customerInvoices) {
      timeline.push({
        type: "invoice",
        id: inv.id,
        title: `Invoice #${inv.invoiceNumber}`,
        status: inv.status,
        date: inv.createdAt,
        amount: toMoney(inv.total),
      });
    }

    for (const apt of customerAppointments) {
      const svcName = apt.serviceId ? serviceMap.get(apt.serviceId) : null;
      const stfName = apt.staffId ? staffMap.get(apt.staffId) : null;
      timeline.push({
        type: "appointment",
        id: apt.id,
        title: apt.notes || "Appointment",
        status: apt.status,
        date: apt.startDate,
        serviceName: svcName || null,
        staffName: stfName || null,
      });
    }

    for (const q of customerQuotes) {
      timeline.push({
        type: "quote",
        id: q.id,
        title: `Quote #${q.quoteNumber}`,
        status: q.status,
        date: q.createdAt,
        amount: q.total,
      });
    }

    for (const call of customerCallLogs) {
      const callStatus = (call as any).status || 'answered';
      const isSms = callStatus === 'sms';
      timeline.push({
        type: isSms ? "sms" : "call",
        id: call.id,
        title: isSms
          ? "SMS Message"
          : `Phone Call${(call as any).intentDetected ? ` — ${(call as any).intentDetected}` : ''}`,
        status: callStatus,
        date: (call as any).callTime || (call as any).createdAt,
        callDuration: isSms ? null : ((call as any).callDuration || null),
        summary: isSms ? null : ((call as any).summary || null),
        intentDetected: isSms ? null : ((call as any).intentDetected || null),
        transcript: isSms ? ((call as any).transcript || null) : null,
      });
    }

    // Sort timeline by date, newest first
    timeline.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    res.json({
      stats: {
        totalJobs,
        totalSpent,
        lastVisit,
        activeInvoices,
      },
      timeline,
    });
  } catch (error) {
    console.error("Customer activity error:", error);
    res.status(500).json({ error: "Error fetching customer activity" });
  }
});

// ============================================================================
// Customer Equipment (Step 3 of HVAC roadmap)
// ============================================================================
// All endpoints are tenant-scoped: businessId is read from the session, then
// passed to storage methods that AND it into the WHERE clause. The customer's
// existence + ownership is verified before any equipment operation so a 404
// from a wrong-tenant request is indistinguishable from a 404 for a real
// not-found.
//
// The Industry Capability Matrix gates whether the UI surfaces these — the
// server-side endpoints are universal so a misconfigured frontend (or a
// future industry that turns this on) doesn't 404.
// ============================================================================

import { insertCustomerEquipmentSchema } from "@shared/schema";

// Zod schema for PATCH — partial of the insert schema minus immutable fields.
// businessId, customerId, and id can't be changed after creation.
const patchEquipmentSchema = insertCustomerEquipmentSchema
  .omit({ businessId: true, customerId: true })
  .partial();

// Helper: verify the customer exists AND belongs to the requesting business.
// Returns null and writes the response on failure so the caller can early-return.
async function verifyCustomerOwnership(
  req: any,
  res: any,
  customerIdRaw: string,
): Promise<{ businessId: number; customerId: number } | null> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const businessId = req.user?.businessId;
  if (!businessId) {
    res.status(400).json({ error: "No business associated with user" });
    return null;
  }
  const customerId = parseInt(customerIdRaw, 10);
  if (isNaN(customerId)) {
    res.status(400).json({ error: "Invalid customer ID" });
    return null;
  }
  const customer = await storage.getCustomer(customerId);
  if (!customer || customer.businessId !== businessId) {
    // Don't leak existence — 404 for both wrong-tenant and not-found
    res.status(404).json({ error: "Customer not found" });
    return null;
  }
  return { businessId, customerId };
}

// GET /api/customers/:id/equipment — list all (active) equipment for a customer
router.get("/customers/:id/equipment", async (req, res) => {
  try {
    const ownership = await verifyCustomerOwnership(req, res, req.params.id);
    if (!ownership) return;

    const includeInactive = req.query.includeInactive === "true";
    const rows = await storage.getCustomerEquipment(
      ownership.customerId,
      ownership.businessId,
      { includeInactive },
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching customer equipment:", error);
    res.status(500).json({ error: "Failed to fetch customer equipment" });
  }
});

// POST /api/customers/:id/equipment — create a new equipment row
router.post("/customers/:id/equipment", async (req, res) => {
  try {
    const ownership = await verifyCustomerOwnership(req, res, req.params.id);
    if (!ownership) return;

    // Ignore any businessId/customerId in the payload — the URL is authoritative.
    const { businessId: _ignoredBusiness, customerId: _ignoredCustomer, ...rest } = req.body || {};
    const parsed = insertCustomerEquipmentSchema.safeParse({
      ...rest,
      businessId: ownership.businessId,
      customerId: ownership.customerId,
    });
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid equipment data",
        details: parsed.error.flatten(),
      });
    }

    const row = await storage.createCustomerEquipment(parsed.data);
    res.status(201).json(row);
  } catch (error) {
    console.error("Error creating customer equipment:", error);
    res.status(500).json({ error: "Failed to create customer equipment" });
  }
});

// PATCH /api/customers/:id/equipment/:equipmentId — update an equipment row
router.patch("/customers/:id/equipment/:equipmentId", async (req, res) => {
  try {
    const ownership = await verifyCustomerOwnership(req, res, req.params.id);
    if (!ownership) return;

    const equipmentId = parseInt(req.params.equipmentId, 10);
    if (isNaN(equipmentId)) {
      return res.status(400).json({ error: "Invalid equipment ID" });
    }

    const parsed = patchEquipmentSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid equipment patch",
        details: parsed.error.flatten(),
      });
    }

    const updated = await storage.updateCustomerEquipment(
      equipmentId,
      ownership.businessId,
      parsed.data,
    );
    if (!updated) {
      return res.status(404).json({ error: "Equipment not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating customer equipment:", error);
    res.status(500).json({ error: "Failed to update customer equipment" });
  }
});

// DELETE /api/customers/:id/equipment/:equipmentId — hard delete an equipment row.
// Prefer the PATCH route with `{ active: false }` for retiring equipment while
// preserving history; this endpoint is for owner-initiated mistake removal.
router.delete("/customers/:id/equipment/:equipmentId", async (req, res) => {
  try {
    const ownership = await verifyCustomerOwnership(req, res, req.params.id);
    if (!ownership) return;

    const equipmentId = parseInt(req.params.equipmentId, 10);
    if (isNaN(equipmentId)) {
      return res.status(400).json({ error: "Invalid equipment ID" });
    }

    const deleted = await storage.deleteCustomerEquipment(
      equipmentId,
      ownership.businessId,
    );
    if (!deleted) {
      return res.status(404).json({ error: "Equipment not found" });
    }
    res.status(204).end();
  } catch (error) {
    console.error("Error deleting customer equipment:", error);
    res.status(500).json({ error: "Failed to delete customer equipment" });
  }
});

export default router;