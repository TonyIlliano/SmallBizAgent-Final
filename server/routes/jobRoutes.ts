import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { insertJobSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { dataCache } from "../services/callToolHandlers";
import { fireEvent } from "../services/webhookService";
import notificationService from "../services/notificationService";

const router = Router();

// Helper to get business ID from session or API key
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as any).apiKeyBusinessId) {
    return (req as any).apiKeyBusinessId;
  }
  return 0;
};

// Helper to verify resource belongs to user's business
const verifyBusinessOwnership = (resource: any, req: Request): boolean => {
  if (!resource) return false;
  const userBusinessId = getBusinessId(req);
  return resource.businessId === userBusinessId;
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
      const job = await storage.updateJob(id, validatedData);

      // Job status change SMS notifications (fire-and-forget)
      if (validatedData.status === 'in_progress' && existing.status !== 'in_progress') {
        import('../services/notificationService').then(mod => {
          mod.sendJobInProgressNotification(job.id, existing.businessId).catch(err =>
            console.error('Background job in_progress notification error:', err)
          );
        }).catch(err => console.error('Import error:', err));
      }
      if (validatedData.status === 'waiting_parts' && existing.status !== 'waiting_parts') {
        import('../services/notificationService').then(mod => {
          mod.sendJobWaitingPartsNotification(job.id, existing.businessId).catch(err =>
            console.error('Background job waiting_parts notification error:', err)
          );
        }).catch(err => console.error('Import error:', err));
      }
      if (validatedData.status === 'in_progress' && existing.status === 'waiting_parts') {
        import('../services/notificationService').then(mod => {
          mod.sendJobResumedNotification(job.id, existing.businessId).catch(err =>
            console.error('Background job resumed notification error:', err)
          );
        }).catch(err => console.error('Import error:', err));
      }

      // Send job completed notification if status changed to completed
      if (validatedData.status === 'completed' && existing.status !== 'completed') {
        notificationService.sendJobCompletedNotification(job.id, existing.businessId).catch(err =>
          console.error('Background notification error:', err)
        );

        // Fire webhook event for job completed (fire-and-forget)
        fireEvent(existing.businessId, 'job.completed', { job })
          .catch(err => console.error('Webhook fire error:', err));

        // Auto-send review request after job completion (fire-and-forget, respects opt-in + cooldown)
        import('../services/reviewService').then(reviewService => {
          // Use configured delay (default 2 hours) before sending
          reviewService.getReviewSettings(existing.businessId).then(settings => {
            if (settings?.autoSendAfterJobCompletion && settings?.reviewRequestEnabled) {
              const delayMs = (settings.delayHoursAfterCompletion || 2) * 60 * 60 * 1000;
              setTimeout(() => {
                reviewService.sendReviewRequestForCompletedJob(job.id, existing.businessId)
                  .then(result => {
                    if (result.success) {
                      console.log(`[Review] Auto-sent review request for job ${job.id}`);
                    } else {
                      console.log(`[Review] Skipped auto-review for job ${job.id}: ${result.error}`);
                    }
                  })
                  .catch(err => console.error('[Review] Auto-review error:', err));
              }, delayMs);
            }
          }).catch(err => console.error('[Review] Error checking review settings:', err));
        }).catch(err => console.error('[Review] Error importing review service:', err));

        // Orchestrator: route job.completed to appropriate agents (follow-up, review, etc.)
        import('../services/orchestrationService').then(mod => {
          mod.dispatchEvent('job.completed', {
            businessId: existing.businessId,
            customerId: job.customerId || undefined,
            referenceType: 'job',
            referenceId: job.id,
          }).catch(err => console.error('[Orchestrator] Error dispatching job.completed:', err));
        }).catch(err => console.error('[Orchestrator] Import error:', err));

        // Auto-generate invoice on job completion if enabled
        try {
          const business = await storage.getBusiness(existing.businessId);
          if (business?.autoInvoiceOnJobCompletion) {
            const lineItems = await storage.getJobLineItems(job.id);
            if (lineItems.length > 0) {
              const taxRate = 0.08;
              const subtotal = lineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
              const taxableAmount = lineItems.filter((item: any) => item.taxable).reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
              const tax = taxableAmount * taxRate;
              const total = subtotal + tax;
              const invoiceDate = new Date();
              const invoiceNumber = `INV-${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}${String(invoiceDate.getDate()).padStart(2, '0')}-${job.id}`;
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 30);
              const invoice = await storage.createInvoice({
                businessId: existing.businessId,
                customerId: job.customerId,
                jobId: job.id,
                invoiceNumber,
                amount: subtotal,
                tax,
                total,
                dueDate: dueDate.toISOString().split('T')[0],
                status: 'pending',
              });
              for (const lineItem of lineItems) {
                await storage.createInvoiceItem({
                  invoiceId: invoice.id,
                  description: `${lineItem.type?.toUpperCase() || 'ITEM'}: ${lineItem.description}`,
                  quantity: lineItem.quantity || 1,
                  unitPrice: lineItem.unitPrice,
                  amount: lineItem.amount || 0,
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
        unitPrice,
        amount,
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
        unitPrice,
        amount,
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
      const taxRate = req.body.taxRate || 0.08; // Default 8% tax
      const subtotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      const taxableAmount = lineItems
        .filter(item => item.taxable)
        .reduce((sum, item) => sum + (item.amount || 0), 0);
      const tax = taxableAmount * taxRate;
      const total = subtotal + tax;

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
        amount: subtotal,
        tax,
        total,
        dueDate: dueDate.toISOString().split('T')[0],
        status: 'pending'
      });

      // Create invoice items from job line items
      for (const lineItem of lineItems) {
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: `${lineItem.type.toUpperCase()}: ${lineItem.description}`,
          quantity: lineItem.quantity || 1,
          unitPrice: lineItem.unitPrice,
          amount: lineItem.amount || 0
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

export default router;
