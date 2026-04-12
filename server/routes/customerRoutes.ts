import { Router } from "express";
import { storage } from "../storage";
import { eq, and, desc, like, ilike, or } from "drizzle-orm";
import { customers, insertCustomerSchema } from "@shared/schema";
import { z } from "zod";
import { pool } from "../db";

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

    // Get query parameters for filtering and searching
    const search = req.query.search as string;

    let query = storage.getCustomers(businessId);
    
    if (search) {
      // TODO: Implement search if needed
    }

    const allCustomers = await query;

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

    res.status(201).json(newCustomer);
  } catch (error: any) {
    console.error("Error creating customer:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid customer data", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to create customer" });
  }
});

// Update a customer
router.patch("/customers/:id", async (req, res) => {
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
      tags: z.array(z.string()).optional(), // Customer tags/labels
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
      updateData.tags = JSON.stringify(validatedData.tags);
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

    res.json(updatedCustomer);
  } catch (error: any) {
    console.error("Error updating customer:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid customer data", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to update customer" });
  }
});

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

    // Check if the customer exists and belongs to the business
    const existingCustomer = await storage.getCustomer(customerId);
    if (!existingCustomer || existingCustomer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Delete the customer
    await storage.deleteCustomer(customerId, businessId);

    res.json({ success: true });
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

export default router;