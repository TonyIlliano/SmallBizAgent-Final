import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { insertJobSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, ApiKeyRequest } from "../auth";
import { dataCache } from "../services/callToolHandlers";
import { fireEvent } from "../services/webhookService";
import notificationService from "../services/notificationService";
import multer from "multer";
import { uploadBufferToS3, isS3Configured } from "../utils/s3Upload";
import { toMoney, roundMoney } from "../utils/money";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { randomBytes } from "crypto";

// Multer for job photo uploads (5MB max, images only)
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

const router = Router();

// Helper to get business ID from session or API key
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as ApiKeyRequest).apiKeyBusinessId) {
    return (req as ApiKeyRequest).apiKeyBusinessId!;
  }
  return 0;
};

// Helper to verify resource belongs to user's business
const verifyBusinessOwnership = (resource: { businessId: number } | null | undefined, req: Request): boolean => {
  if (!resource) return false;
  const userBusinessId = getBusinessId(req);
  return resource.businessId === userBusinessId;
};

// Default tax rate when a business has not configured one (8%).
const DEFAULT_TAX_RATE = 0.08;

// Resolve the tax rate fraction for a business. `businesses.taxRate` is stored
// as a percent string via Drizzle NUMERIC (e.g. "8.00" = 8%). We convert to a
// fraction (0.08) for arithmetic. Invalid / blank / negative values fall back
// to DEFAULT_TAX_RATE so callers always get a sane number.
const resolveTaxRate = (business: { taxRate?: string | number | null } | null | undefined): number => {
  if (!business) return DEFAULT_TAX_RATE;
  const raw = (business as any).taxRate;
  if (raw === null || raw === undefined || raw === "") return DEFAULT_TAX_RATE;
  const pct = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(pct) || pct < 0) return DEFAULT_TAX_RATE;
  return pct / 100;
};

// =================== JOBS API ===================
router.get("/", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};

      if (req.query.status) {
        params.status = req.query.status as string;
      }

      if (req.query.customerId) {
        const customerId = parseInt(req.query.customerId as string);
        if (isNaN(customerId)) {
          return res.status(400).json({ message: "Invalid customer ID" });
        }
        params.customerId = customerId;
      }

      if (req.query.staffId) {
        const staffId = parseInt(req.query.staffId as string);
        if (isNaN(staffId)) {
          return res.status(400).json({ message: "Invalid staff ID" });
        }
        params.staffId = staffId;
      }

      if (req.query.limit) {
        const limit = parseInt(req.query.limit as string);
        if (!isNaN(limit)) params.limit = Math.min(limit, 500);
      }
      if (req.query.offset) {
        const offset = parseInt(req.query.offset as string);
        if (!isNaN(offset)) params.offset = offset;
      }

      const jobs = await storage.getJobs(businessId, params);

      // Fetch related data for each job
      const populatedJobs = await Promise.all(
        jobs.map(async (job) => {
          const customer = await storage.getCustomer(job.customerId);
          const staff = job.staffId ? await storage.getStaffMember(job.staffId) : null;
          // Include linked appointment time data for calendar view
          const appointment = job.appointmentId
            ? await storage.getAppointment(job.appointmentId)
            : null;

          return {
            ...job,
            customer,
            staff,
            appointment: appointment ? {
              id: appointment.id,
              startDate: appointment.startDate,
              endDate: appointment.endDate,
              status: appointment.status,
              serviceId: appointment.serviceId,
            } : null,
          };
        })
      );

      res.json(populatedJobs);
    } catch (error) {
      res.status(500).json({ message: "Error fetching jobs" });
    }
  });

router.get("/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
      const job = await storage.getJob(id);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Fetch related data
      const customer = await storage.getCustomer(job.customerId);
      const staff = job.staffId ? await storage.getStaffMember(job.staffId) : null;

      res.json({
        ...job,
        customer,
        staff
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching job" });
    }
  });

router.post("/", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const validatedData = insertJobSchema.parse({ ...req.body, businessId });
      const job = await storage.createJob(validatedData);

      // Fire webhook event (fire-and-forget)
      fireEvent(businessId, 'job.created', { job })
        .catch(err => console.error('Webhook fire error:', err));

      // Auto-create a linked appointment if the job has a scheduled date
      if (job.scheduledDate && job.customerId && !job.appointmentId) {
        try {
          // Parse the scheduled date and create a 1-hour appointment block
          const startDate = new Date(job.scheduledDate + 'T09:00:00');
          const endDate = new Date(startDate);
          endDate.setMinutes(endDate.getMinutes() + 60);

          // Use safe transactional booking to prevent double-booking
          const { createAppointmentSafely } = await import('../services/appointmentService');
          const safeResult = await createAppointmentSafely({
            businessId,
            customerId: job.customerId,
            staffId: job.staffId || null,
            serviceId: null,
            startDate,
            endDate,
            status: 'scheduled',
            notes: `Auto-created from job: ${job.title}`,
          });

          if (safeResult.success && safeResult.appointment) {
            const appointment = safeResult.appointment;
            // Link the appointment back to the job
            await storage.updateJob(job.id, { appointmentId: appointment.id });
            job.appointmentId = appointment.id;

            // Invalidate appointments cache after auto-creation
            dataCache.invalidate(businessId, 'appointments');

            console.log(`Auto-created appointment ${appointment.id} for job ${job.id}`);
          } else {
            console.warn(`Skipped auto-creating appointment for job ${job.id}: ${safeResult.error}`);
          }
        } catch (aptErr: any) {
          console.error('Failed to auto-create appointment for job:', aptErr.message);
          // Non-blocking — job is still created successfully
        }
      }

      res.status(201).json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating job" });
    }
  });

router.put("/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
      const existing = await storage.getJob(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const validatedData = insertJobSchema.partial().parse(req.body);

      // If the tech is marking the job as en_route, stamp enRouteAt = now
      // server-side so the customer SMS uses an authoritative timestamp.
      // The client may also pass etaMinutes (15/30/45/60).
      if (validatedData.status === 'en_route' && existing.status !== 'en_route') {
        (validatedData as any).enRouteAt = new Date();
      }

      const job = await storage.updateJob(id, validatedData);

      // Queue job status SMS notifications (reliable retry via pg-boss)
      const { enqueue } = await import('../services/jobQueue');
      if (validatedData.status === 'en_route' && existing.status !== 'en_route') {
        await enqueue('send-job-status-notification', { jobId: job.id, businessId: existing.businessId, statusType: 'en_route' });
      }
      if (validatedData.status === 'in_progress' && existing.status !== 'in_progress') {
        await enqueue('send-job-status-notification', { jobId: job.id, businessId: existing.businessId, statusType: 'in_progress' });
      }
      if (validatedData.status === 'waiting_parts' && existing.status !== 'waiting_parts') {
        await enqueue('send-job-status-notification', { jobId: job.id, businessId: existing.businessId, statusType: 'waiting_parts' });
      }
      if (validatedData.status === 'in_progress' && existing.status === 'waiting_parts') {
        await enqueue('send-job-status-notification', { jobId: job.id, businessId: existing.businessId, statusType: 'resumed' });
      }

      // Queue job completed jobs (notification, webhook, orchestration)
      if (validatedData.status === 'completed' && existing.status !== 'completed') {
        await enqueue('send-job-completed-notification', { jobId: job.id, businessId: existing.businessId });
        await enqueue('fire-webhook-event', { businessId: existing.businessId, event: 'job.completed', payload: { job } });
        await enqueue('dispatch-orchestration-event', {
          eventType: 'job.completed',
          businessId: existing.businessId,
          customerId: job.customerId || undefined,
          referenceType: 'job',
          referenceId: job.id,
        });

        // Auto-generate invoice on job completion if enabled
        try {
          const business = await storage.getBusiness(existing.businessId);
          if (business?.autoInvoiceOnJobCompletion) {
            const lineItems = await storage.getJobLineItems(job.id);
            if (lineItems.length > 0) {
              const taxRate = resolveTaxRate(business);
              const subtotal = lineItems.reduce((sum: number, item: any) => sum + toMoney(item.amount), 0);
              const taxableAmount = lineItems.filter((item: any) => item.taxable).reduce((sum: number, item: any) => sum + toMoney(item.amount), 0);
              const tax = roundMoney(taxableAmount * taxRate);
              const total = roundMoney(subtotal + tax);
              const invoiceDate = new Date();
              const invoiceNumber = `INV-${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}${String(invoiceDate.getDate()).padStart(2, '0')}-${job.id}`;
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 30);
              const invoice = await storage.createInvoice({
                businessId: existing.businessId,
                customerId: job.customerId,
                jobId: job.id,
                invoiceNumber,
                amount: String(subtotal),
                tax: String(tax),
                total: String(total),
                dueDate: dueDate.toISOString().split('T')[0],
                status: 'pending',
              });
              for (const lineItem of lineItems) {
                await storage.createInvoiceItem({
                  invoiceId: invoice.id,
                  description: `${lineItem.type?.toUpperCase() || 'ITEM'}: ${lineItem.description}`,
                  quantity: lineItem.quantity || 1,
                  unitPrice: lineItem.unitPrice || '0',
                  amount: lineItem.amount || '0',
                });
              }
              console.log(`[AutoInvoice] Created invoice ${invoiceNumber} for completed job ${job.id}`);
            }
          }
        } catch (autoInvoiceErr: any) {
          console.error(`[AutoInvoice] Error for job ${job.id}:`, autoInvoiceErr.message);
        }
      }

      // Sync linked appointment when job changes
      if (job.appointmentId) {
        try {
          const linkedAppointment = await storage.getAppointment(job.appointmentId);
          if (linkedAppointment) {
            const appointmentUpdates: any = {};

            // Sync scheduled date change
            if (validatedData.scheduledDate && validatedData.scheduledDate !== existing.scheduledDate) {
              appointmentUpdates.startDate = new Date(validatedData.scheduledDate + 'T09:00:00');
              appointmentUpdates.endDate = new Date(appointmentUpdates.startDate);
              appointmentUpdates.endDate.setMinutes(appointmentUpdates.endDate.getMinutes() + 60);
            }

            // Sync staff change
            if (validatedData.staffId !== undefined && validatedData.staffId !== existing.staffId) {
              appointmentUpdates.staffId = validatedData.staffId;
            }

            // Sync status: cancelled job → cancel appointment
            if (validatedData.status === 'cancelled' && existing.status !== 'cancelled') {
              appointmentUpdates.status = 'cancelled';
              appointmentUpdates.notes = `${linkedAppointment.notes || ''}\n[Cancelled: linked job was cancelled]`.trim();
            }

            // Sync status: completed job → complete appointment
            if (validatedData.status === 'completed' && existing.status !== 'completed') {
              if (linkedAppointment.status !== 'completed' && linkedAppointment.status !== 'cancelled') {
                appointmentUpdates.status = 'completed';
              }
            }

            if (Object.keys(appointmentUpdates).length > 0) {
              await storage.updateAppointment(job.appointmentId, appointmentUpdates);
              // Invalidate appointments cache after syncing job changes
              dataCache.invalidate(existing.businessId, 'appointments');
              console.log(`Synced appointment ${job.appointmentId} with job ${job.id} changes`);
            }
          }
        } catch (syncErr: any) {
          console.error('Failed to sync appointment with job update:', syncErr.message);
        }
      }

      res.json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating job" });
    }
  });

router.delete("/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
      const existing = await storage.getJob(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      await storage.deleteJob(id, existing.businessId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting job" });
    }
  });

  // =================== JOB BRIEFING API ===================

  // GET /api/jobs/:id/briefing — AI-generated job briefing
router.get("/:id/briefing", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const businessId = getBusinessId(req);
      const job = await storage.getJob(jobId);
      if (!verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ error: "Job not found" });
      }

      const { generateJobBriefing } = await import("../services/jobBriefingService");
      const briefing = await generateJobBriefing(jobId, businessId);
      res.json(briefing);
    } catch (err: any) {
      console.error("[Jobs] Briefing generation error:", err);
      res.status(500).json({ error: "Failed to generate briefing" });
    }
  });

  // =================== JOB LINE ITEMS API ===================
router.get("/:jobId/line-items", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
      // Verify job belongs to user's business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const items = await storage.getJobLineItems(jobId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Error fetching job line items" });
    }
  });

router.post("/:jobId/line-items", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
      // Verify job belongs to user's business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const { type, description, quantity, unitPrice, taxable } = req.body;

      const amount = (quantity || 1) * unitPrice;
      const item = await storage.createJobLineItem({
        jobId,
        type,
        description,
        quantity: quantity || 1,
        unitPrice: String(unitPrice),
        amount: String(amount),
        taxable: taxable !== false
      });
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating job line item:", error);
      res.status(500).json({ message: "Error creating job line item" });
    }
  });

router.put("/:jobId/line-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
      // Verify job belongs to user's business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid line item ID" });
      }
      const { type, description, quantity, unitPrice, taxable } = req.body;

      const amount = (quantity || 1) * unitPrice;
      const item = await storage.updateJobLineItem(id, {
        type,
        description,
        quantity: quantity || 1,
        unitPrice: String(unitPrice),
        amount: String(amount),
        taxable
      });
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Error updating job line item" });
    }
  });

router.delete("/:jobId/line-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
      // Verify job belongs to user's business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid line item ID" });
      }
      await storage.deleteJobLineItem(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting job line item" });
    }
  });

  // Generate invoice from job
router.post("/:jobId/generate-invoice", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }

      // Get the job and verify ownership
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Get job line items
      const lineItems = await storage.getJobLineItems(jobId);
      if (lineItems.length === 0) {
        return res.status(400).json({ message: "No line items on this job. Add labor, parts, or services before generating an invoice." });
      }

      // Calculate totals
      const business = await storage.getBusiness(job.businessId);
      // req.body.taxRate, if provided, is a fraction override (e.g. 0.08). Otherwise fall
      // back to the business's configured rate (stored as a percent, normalized to a fraction).
      const taxRate = typeof req.body.taxRate === "number" ? req.body.taxRate : resolveTaxRate(business); // Default 8% tax
      const subtotal = lineItems.reduce((sum, item) => sum + toMoney(item.amount), 0);
      const taxableAmount = lineItems
        .filter(item => item.taxable)
        .reduce((sum, item) => sum + toMoney(item.amount), 0);
      const tax = roundMoney(taxableAmount * taxRate);
      const total = roundMoney(subtotal + tax);

      // Generate invoice number
      const date = new Date();
      const invoiceNumber = `INV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${jobId}`;

      // Set due date (default 30 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create the invoice
      const invoice = await storage.createInvoice({
        businessId: job.businessId,
        customerId: job.customerId,
        jobId: job.id,
        invoiceNumber,
        amount: String(subtotal),
        tax: String(tax),
        total: String(total),
        dueDate: dueDate.toISOString().split('T')[0],
        status: 'pending'
      });

      // Create invoice items from job line items
      for (const lineItem of lineItems) {
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: `${lineItem.type.toUpperCase()}: ${lineItem.description}`,
          quantity: lineItem.quantity || 1,
          unitPrice: lineItem.unitPrice || '0',
          amount: lineItem.amount || '0'
        });
      }

      // Fetch the complete invoice with items
      const items = await storage.getInvoiceItems(invoice.id);
      const customer = await storage.getCustomer(invoice.customerId);

      res.status(201).json({
        ...invoice,
        items,
        customer,
        job
      });
    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ message: "Error generating invoice from job" });
    }
  });

// POST /api/jobs/:jobId/send-invoice — one-tap: ensure an invoice exists for the job
// (auto-create from line items using the business tax rate if needed), then send it to the
// customer via the standard invoice notification (respects Free-plan gate + SMS opt-out).
router.post('/:jobId/send-invoice', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ message: 'Invalid job ID' });

    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!verifyBusinessOwnership(job, req)) {
      return res.status(403).json({ message: 'Not authorized to access this job' });
    }
    if (!job.customerId) {
      return res.status(400).json({ message: 'This job has no customer to send an invoice to' });
    }

    const business = await storage.getBusiness(job.businessId);

    // Reuse an existing invoice for this job if one was already generated.
    let invoice: any = null;
    try {
      const existingInvoices = await storage.getInvoices(job.businessId);
      invoice = (existingInvoices || []).find((inv: any) => inv.jobId === jobId) || null;
    } catch (e: any) {
      console.error('[send-invoice] lookup existing invoices failed:', e?.message);
    }

    if (!invoice) {
      // Auto-create from the job's line items.
      const lineItems = await storage.getJobLineItems(jobId);
      if (!lineItems || lineItems.length === 0) {
        return res.status(400).json({ message: 'Add at least one line item before sending an invoice' });
      }

      const subtotal = lineItems.reduce(
        (sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      );
      const taxRate = resolveTaxRate(business);
      const taxAmount = roundMoney(subtotal * taxRate);
      const total = roundMoney(subtotal + taxAmount);

      const accessToken = randomBytes(24).toString('base64url');
      const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${jobId}`;

      invoice = await storage.createInvoice({
        businessId: job.businessId,
        customerId: job.customerId,
        jobId: jobId,
        invoiceNumber,
        amount: String(subtotal),
        tax: String(taxAmount),
        total: String(total),
        status: 'pending',
        accessToken,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      } as any);

      for (const item of lineItems) {
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        } as any);
      }
    } else if (!invoice.accessToken) {
      // Older invoices may predate access-token generation — backfill so the portal link works.
      const accessToken = randomBytes(24).toString('base64url');
      await storage.updateInvoice(invoice.id, { accessToken } as any);
      invoice = { ...invoice, accessToken };
    }

    // Send via the canonical invoice notification (handles Free-plan gate, SMS opt-out).
    const APP_URL = process.env.APP_URL || 'http://localhost:5000';
    const invoiceUrl = `${APP_URL}/portal/invoice/${invoice.accessToken}`;
    let notified = false;
    try {
      const { sendInvoiceSentNotification } = await import('../services/notificationService');
      await sendInvoiceSentNotification(invoice.id, job.businessId, invoiceUrl);
      notified = true;
    } catch (e: any) {
      console.error('[send-invoice] notification failed:', e?.message);
    }

    return res.json({ success: true, invoice, notified });
  } catch (error: any) {
    console.error('[send-invoice] error:', error?.message);
    return res.status(500).json({ message: 'Failed to send invoice' });
  }
});

// POST /api/jobs/:jobId/send-quote — HVAC Step 5: one-tap quote send from a
// completed (or in-progress) job. Mirrors /send-invoice in shape but builds a
// quote instead of an invoice — used when a tech wants to surface a "real
// estimate" (compressor replacement, full system install, etc.) for the
// customer to approve via SMS or the portal link.
//
// - Auto-applies the customer's active membership discount (snapshot at
//   send-time; quote = price commitment, so later membership changes do not
//   re-price the quote).
// - Idempotent: a second tap returns the existing pending/sent quote on the
//   same job rather than creating a duplicate with a new access token.
// - Uses the business tax rate from `resolveTaxRate()` (matches invoice path).
// - Notification goes through `sendQuoteSentNotification` which already
//   respects Free-plan gate + SMS opt-out + TCPA footer.
router.post('/:jobId/send-quote', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ message: 'Invalid job ID' });

    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!verifyBusinessOwnership(job, req)) {
      return res.status(403).json({ message: 'Not authorized to access this job' });
    }
    if (!job.customerId) {
      return res.status(400).json({ message: 'This job has no customer to send a quote to' });
    }

    const business = await storage.getBusiness(job.businessId);
    if (!business) return res.status(404).json({ message: 'Business not found' });

    // Idempotency: if there's already a pending/sent quote linked to this job
    // (the tech double-tapped, or the prior request raced), reuse it instead
    // of creating a duplicate with a new access token. Matches the send-invoice
    // pattern so dispatchers can tap freely without making a mess.
    let quote: any = null;
    try {
      const existing = await storage.getQuotesByJob(jobId, job.businessId);
      quote = (existing || []).find(
        (q: any) => q.status === 'pending' || q.status === 'sent',
      ) || null;
    } catch (e: any) {
      console.error('[send-quote] lookup existing quotes failed:', e?.message);
    }

    if (!quote) {
      const lineItems = await storage.getJobLineItems(jobId);
      if (!lineItems || lineItems.length === 0) {
        return res.status(400).json({ message: 'Add at least one line item before sending a quote' });
      }

      // Snapshot the customer's active membership discount at send-time. The
      // quote represents a price commitment — if the customer cancels their
      // membership tomorrow, the price they were quoted today should still
      // honor the discount they saw. Symmetric: if they enroll tomorrow, the
      // already-sent quote does not retroactively become cheaper.
      let memberDiscountFraction = 0;
      try {
        const membership = await storage.getActiveMembershipByCustomer(
          job.customerId,
          job.businessId,
        );
        if (membership?.planId) {
          const plan = await storage.getMembershipPlanById(membership.planId, job.businessId);
          const rawPct = plan?.memberDiscountPercent;
          if (rawPct !== null && rawPct !== undefined) {
            const pct = typeof rawPct === 'number' ? rawPct : parseFloat(String(rawPct));
            if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
              memberDiscountFraction = pct / 100;
            }
          }
        }
      } catch (e: any) {
        // Membership lookup is opportunistic — failure means no discount applied,
        // but the quote still goes out at the rack-rate price.
        console.error('[send-quote] membership lookup failed:', e?.message);
      }

      // Compute subtotal from the discounted unit prices so the quote lines
      // already reflect the member rate. The quote portal then renders the
      // discounted prices directly (matches what the customer sees in any
      // member-aware UI shipped in Step 4).
      const subtotal = lineItems.reduce((sum: number, item: any) => {
        const qty = Number(item.quantity || 0);
        const unit = Number(item.unitPrice || 0);
        const discountedUnit = unit * (1 - memberDiscountFraction);
        return sum + qty * discountedUnit;
      }, 0);
      const taxRate = resolveTaxRate(business);
      const taxAmount = roundMoney(subtotal * taxRate);
      const total = roundMoney(subtotal + taxAmount);

      const accessToken = randomBytes(24).toString('base64url');
      const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      const quoteNumber = `Q-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${jobId}`;
      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10); // YYYY-MM-DD per schema column type

      quote = await storage.createQuote({
        businessId: job.businessId,
        customerId: job.customerId,
        jobId: jobId,
        quoteNumber,
        amount: String(roundMoney(subtotal)),
        tax: String(taxAmount),
        total: String(total),
        status: 'pending',
        accessToken,
        accessTokenExpiresAt,
        validUntil,
      } as any);

      // Mirror line items with the discounted unit price so the portal shows
      // the same numbers we computed the total from. No discount-line trick;
      // the price field IS the member price.
      for (const item of lineItems) {
        const qty = Number(item.quantity || 0);
        const unit = Number(item.unitPrice || 0);
        const discountedUnit = roundMoney(unit * (1 - memberDiscountFraction));
        const amount = roundMoney(qty * discountedUnit);
        await storage.createQuoteItem({
          quoteId: quote.id,
          description: item.description,
          quantity: qty,
          unitPrice: String(discountedUnit),
          amount: String(amount),
        } as any);
      }
    } else if (!quote.accessToken) {
      // Defensive backfill for quotes predating the access-token field
      // (mirrors the invoice path).
      const accessToken = randomBytes(24).toString('base64url');
      const accessTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await storage.updateQuote(quote.id, { accessToken, accessTokenExpiresAt } as any);
      quote = { ...quote, accessToken, accessTokenExpiresAt };
    }

    const APP_URL = process.env.APP_URL || 'http://localhost:5000';
    const quoteUrl = `${APP_URL}/portal/quote/${quote.accessToken}`;
    let notified = false;
    try {
      const { sendQuoteSentNotification } = await import('../services/notificationService');
      await sendQuoteSentNotification(quote.id, job.businessId, quoteUrl);
      notified = true;
    } catch (e: any) {
      console.error('[send-quote] notification failed:', e?.message);
    }

    return res.json({ success: true, quote, quoteUrl, notified });
  } catch (error: any) {
    console.error('[send-quote] error:', error?.message);
    return res.status(500).json({ message: 'Failed to send quote' });
  }
});


/**
 * POST /api/jobs/:id/voice-notes — Process transcribed voice notes with AI
 *
 * The tech dictates notes into their phone (using keyboard dictation),
 * and this endpoint parses the raw transcript into structured data:
 * clean notes, parts used, equipment info, follow-up opportunities.
 */
router.post("/:id/voice-notes", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

    const job = await storage.getJob(jobId);
    if (!job || !verifyBusinessOwnership(job, req)) {
      return res.status(404).json({ error: "Job not found" });
    }

    const { transcript } = req.body;
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return res.status(400).json({ error: "Missing or empty transcript" });
    }

    // Cap transcript length to prevent abuse (10,000 chars ~ 5 minutes of speech)
    const trimmedTranscript = transcript.trim().substring(0, 10000);

    try {
      const { claudeJson } = await import("../services/claudeClient.js");

      const parsed = await claudeJson<{
        notes: string;
        partsUsed: Array<{ name: string; quantity?: number }>;
        equipmentInfo: string | null;
        followUpNeeded: boolean;
        followUpDescription: string | null;
        estimatedFollowUpCost: number | null;
        completionSummary: string;
      }>({
        system: `You are a field service job notes parser. Parse this technician's voice notes into structured data.

Extract:
- notes: A clean, professional version of what the tech said (fix grammar, remove filler words like "um", "uh", "you know", keep all technical details intact)
- partsUsed: Array of parts mentioned with name and quantity (default quantity 1 if not specified). Only include actual parts/materials, not tools.
- equipmentInfo: Any equipment make/model/serial number mentioned. null if none.
- followUpNeeded: true if the tech mentioned anything that needs a follow-up visit, return trip, or additional work
- followUpDescription: If followUpNeeded is true, describe what needs to happen on the return visit. null otherwise.
- estimatedFollowUpCost: If they mentioned a price, quote, or estimate for follow-up work (as a number in dollars). null otherwise.
- completionSummary: One concise sentence summarizing what was done on this job.

Return valid JSON only. No markdown, no code fences.`,
        prompt: `Technician voice notes for job "${job.title}":\n\n"${trimmedTranscript}"`,
        maxTokens: 1024,
      });

      // Save the cleaned notes to the job
      if (parsed.notes) {
        await storage.updateJob(jobId, { notes: parsed.notes });
      }

      // If parts were identified, auto-add them as line items (best-effort)
      if (parsed.partsUsed && parsed.partsUsed.length > 0) {
        for (const part of parsed.partsUsed) {
          try {
            await storage.createJobLineItem({
              jobId,
              type: 'part',
              description: part.name,
              quantity: part.quantity || 1,
              unitPrice: '0', // Price unknown from voice — tech can update later
              amount: '0',
              taxable: true,
            });
          } catch (lineItemErr: any) {
            console.error(`[VoiceNotes] Failed to create line item for part "${part.name}":`, lineItemErr.message);
          }
        }
      }

      res.json({
        parsed,
        saved: true,
      });
    } catch (aiErr: any) {
      console.error('[VoiceNotes] AI parsing failed:', aiErr.message);
      // Fallback: save raw transcript as notes if AI fails
      await storage.updateJob(jobId, { notes: trimmedTranscript });
      res.json({
        parsed: {
          notes: trimmedTranscript,
          partsUsed: [],
          equipmentInfo: null,
          followUpNeeded: false,
          followUpDescription: null,
          estimatedFollowUpCost: null,
          completionSummary: 'Voice notes saved (AI parsing unavailable).',
        },
        saved: true,
        fallback: true,
      });
    }
  } catch (error: any) {
    console.error("[VoiceNotes] Error processing voice notes:", error);
    res.status(500).json({ error: "Error processing voice notes" });
  }
});

/**
 * POST /api/jobs/:id/send-tracking-link — Send opt-in tracking link SMS to customer.
 *
 * Triggered explicitly by the tech tapping "Send tracking link to customer" on
 * the OnMyWayCard. Sends a SEPARATE transactional SMS — does NOT modify the
 * existing en_route SMS. Customer-share toggle (business.gpsCustomerShareEnabled)
 * checked at link-creation time in /api/gps/links; this endpoint trusts that.
 */
router.post("/:id/send-tracking-link", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

    const businessId = getBusinessId(req);
    if (!businessId) return res.status(401).json({ error: "Not authenticated" });

    const job = await storage.getJob(jobId);
    if (!verifyBusinessOwnership(job, req)) {
      return res.status(404).json({ error: "Job not found" });
    }

    const { trackingUrl } = req.body as { trackingUrl?: string };
    if (!trackingUrl || typeof trackingUrl !== 'string') {
      return res.status(400).json({ error: "trackingUrl is required" });
    }

    // Validate URL is on our domain so techs can't trick the system into sending arbitrary URLs
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    if (!trackingUrl.startsWith(appUrl) && !trackingUrl.startsWith('https://smallbizagent.ai') && !trackingUrl.startsWith('https://www.smallbizagent.ai')) {
      return res.status(400).json({ error: "trackingUrl must be a SmallBizAgent tracking link" });
    }

    await notificationService.sendJobTrackingLinkNotification(jobId, businessId, trackingUrl);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("[GPS] send-tracking-link error:", error);
    res.status(500).json({ error: "Failed to send tracking link" });
  }
});

/**
 * POST /api/jobs/:id/photos — Upload a photo to a job (mobile app camera)
 */
router.post("/api/jobs/:id/photos", isAuthenticated, photoUpload.single("photo"), async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

    const businessId = getBusinessId(req);
    const job = await storage.getJob(jobId);
    if (!verifyBusinessOwnership(job, req)) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    if (!isS3Configured()) {
      return res.status(503).json({ error: "File storage not configured" });
    }

    const ext = req.file.originalname.split(".").pop() || "jpg";
    const key = `job-photos/job-${jobId}-${Date.now()}.${ext}`;
    const photoUrl = await uploadBufferToS3(req.file.buffer, key, req.file.mimetype);

    // Append to existing photos array
    const existingPhotos: Array<{ url: string; caption?: string; takenAt: string }> =
      (job as any)?.photos || [];
    existingPhotos.push({
      url: photoUrl,
      takenAt: new Date().toISOString(),
    });

    await db.execute(
      sql`UPDATE jobs SET photos = ${JSON.stringify(existingPhotos)}::jsonb, updated_at = NOW() WHERE id = ${jobId}`
    );

    res.json({ photoUrl, totalPhotos: existingPhotos.length });
  } catch (error: any) {
    console.error("[Jobs] Photo upload error:", error);
    res.status(500).json({ error: error.message || "Upload failed" });
  }
});

export default router;
