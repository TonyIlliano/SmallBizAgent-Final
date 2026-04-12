import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { z } from "zod";
import {
  insertInvoiceSchema,
  insertInvoiceItemSchema,
} from "@shared/schema";
import { isAuthenticated, ApiKeyRequest } from "../auth";
import notificationService from "../services/notificationService";
import { fireEvent } from "../services/webhookService";
import { stripeConnectService } from "../services/stripeConnectService";

const router = Router();

// Helper function to get businessId from authenticated user or API key
// Returns 0 if no business is associated (caller must handle this)
const getBusinessId = (req: Request): number => {
  // If user is authenticated via session, use their businessId
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  // If authenticated via API key, use the attached businessId
  if ((req as ApiKeyRequest).apiKeyBusinessId) {
    return (req as ApiKeyRequest).apiKeyBusinessId!;
  }
  // No business associated - return 0 to indicate this
  // Callers should check for 0 and return appropriate error
  return 0;
};

// Helper to verify resource belongs to user's business
const verifyBusinessOwnership = (resource: { businessId: number } | null | undefined, req: Request): boolean => {
  if (!resource) return false;
  const userBusinessId = getBusinessId(req);
  return resource.businessId === userBusinessId;
};

// =================== INVOICES API ===================
router.get("/invoices", isAuthenticated, async (req: Request, res: Response) => {
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

    let allInvoices = await storage.getInvoices(businessId, params);

    // Filter by jobId if provided
    if (req.query.jobId) {
      const jobId = parseInt(req.query.jobId as string);
      if (!isNaN(jobId)) {
        allInvoices = allInvoices.filter((inv) => inv.jobId === jobId);
      }
    }

    // Fetch related data for each invoice
    const populatedInvoices = await Promise.all(
      allInvoices.map(async (invoice) => {
        const customer = await storage.getCustomer(invoice.customerId);
        const items = await storage.getInvoiceItems(invoice.id);

        return {
          ...invoice,
          customer,
          items
        };
      })
    );

    res.json(populatedInvoices);
  } catch (error) {
    res.status(500).json({ message: "Error fetching invoices" });
  }
});

router.get("/invoices/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid invoice ID" });
    }
    const invoice = await storage.getInvoice(id);
    if (!invoice || !verifyBusinessOwnership(invoice, req)) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Fetch related data
    const customer = await storage.getCustomer(invoice.customerId);
    const items = await storage.getInvoiceItems(invoice.id);

    res.json({
      ...invoice,
      customer,
      items
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching invoice" });
  }
});

router.post("/invoices", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const validatedData = insertInvoiceSchema.parse({ ...req.body, businessId });
    const invoice = await storage.createInvoice(validatedData);

    // Handle invoice items if provided
    if (req.body.items && Array.isArray(req.body.items)) {
      for (const item of req.body.items) {
        const validatedItem = insertInvoiceItemSchema.parse({
          ...item,
          invoiceId: invoice.id
        });
        await storage.createInvoiceItem(validatedItem);
      }
    }

    // Send invoice created notification (fire-and-forget)
    notificationService.sendInvoiceCreatedNotification(invoice.id, businessId).catch(err =>
      console.error('Background notification error:', err)
    );

    // Fire webhook event (fire-and-forget)
    fireEvent(businessId, 'invoice.created', { invoice })
      .catch(err => console.error('Webhook fire error:', err));

    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error creating invoice" });
  }
});

router.put("/invoices/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid invoice ID" });
    }
    const existing = await storage.getInvoice(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    const validatedData = insertInvoiceSchema.partial().parse(req.body);
    const invoice = await storage.updateInvoice(id, validatedData);

    // Queue payment confirmation + orchestration (reliable retry via pg-boss)
    if (validatedData.status === 'paid' && existing.status !== 'paid') {
      const { enqueue } = await import('../services/jobQueue');
      await enqueue('send-payment-confirmation', { invoiceId: invoice.id, businessId: existing.businessId });
      await enqueue('fire-webhook-event', { businessId: existing.businessId, event: 'invoice.paid', payload: { invoice } });
      await enqueue('dispatch-orchestration-event', {
        eventType: 'invoice.paid',
        businessId: existing.businessId,
        customerId: existing.customerId || undefined,
      });
    }

    res.json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error updating invoice" });
  }
});

router.delete("/invoices/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid invoice ID" });
    }
    const existing = await storage.getInvoice(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Delete all invoice items first
    const items = await storage.getInvoiceItems(id);
    for (const item of items) {
      await storage.deleteInvoiceItem(item.id);
    }

    // Then delete the invoice
    await storage.deleteInvoice(id, existing.businessId);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: "Error deleting invoice" });
  }
});

// =================== CUSTOMER PORTAL API (Public) ===================
// Generate access token for an invoice
router.post("/invoices/:id/generate-link", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid invoice ID" });
    }
    const existing = await storage.getInvoice(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Generate a unique access token
    const crypto = await import('crypto');
    const accessToken = crypto.randomBytes(32).toString('hex');

    // Update invoice with access token
    await storage.updateInvoice(id, { accessToken });

    // Build the public URL
    const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');
    const publicUrl = `${baseUrl}/portal/invoice/${accessToken}`;

    // Send invoice email and SMS to customer (fire-and-forget)
    notificationService.sendInvoiceSentNotification(id, existing.businessId, publicUrl).catch(err =>
      console.error('Background invoice notification error:', err)
    );

    res.json({
      success: true,
      accessToken,
      publicUrl,
      message: "Share this link with your customer to view and pay the invoice"
    });
  } catch (error) {
    console.error("Error generating invoice link:", error);
    res.status(500).json({ message: "Error generating link" });
  }
});

// Public endpoint - Get invoice by access token (NO AUTH REQUIRED)
router.get("/portal/invoice/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Find invoice by access token
    const invoice = await storage.getInvoiceByAccessToken(token);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found or link expired" });
    }

    // Get related data
    const customer = await storage.getCustomer(invoice.customerId);
    const business = await storage.getBusiness(invoice.businessId);
    const items = await storage.getInvoiceItems(invoice.id);

    // Build full address
    const fullAddress = business ? [
      business.address,
      business.city,
      business.state,
      business.zip
    ].filter(Boolean).join(', ') : '';

    // Check if business has Stripe Connect active (for payment gating)
    const paymentsEnabled = business?.stripeConnectStatus === 'active';

    // Return invoice data (without sensitive business info)
    res.json({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      tax: invoice.tax,
      total: invoice.total,
      dueDate: invoice.dueDate,
      status: invoice.status,
      notes: invoice.notes,
      createdAt: invoice.createdAt,
      paymentsEnabled,
      customer: customer ? {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone
      } : null,
      business: business ? {
        name: business.name,
        phone: business.phone,
        email: business.email,
        address: fullAddress
      } : null,
      items
    });
  } catch (error) {
    console.error("Error fetching portal invoice:", error);
    res.status(500).json({ message: "Error fetching invoice" });
  }
});

// Public endpoint - Create payment intent for portal invoice (NO AUTH REQUIRED)
// Uses Stripe Connect destination charges — money goes to business, NOT platform
router.post("/portal/invoice/:token/pay", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Find invoice by access token
    const invoice = await storage.getInvoiceByAccessToken(token);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ message: "Invoice already paid" });
    }

    const customer = await storage.getCustomer(invoice.customerId);

    // Use Stripe Connect service — will REJECT if business has no Connect account
    const result = await stripeConnectService.createPaymentIntentForInvoice({
      amount: invoice.total || 0,
      businessId: invoice.businessId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown',
      isPortalPayment: true,
    });

    // Update invoice with payment intent ID
    await storage.updateInvoice(invoice.id, {
      stripePaymentIntentId: result.paymentIntentId
    });

    res.json({ clientSecret: result.clientSecret });
  } catch (error: any) {
    console.error("Error creating portal payment:", error);
    // Return specific message for payment blocked (no Connect account)
    if (error.message?.includes('PAYMENT_BLOCKED')) {
      return res.status(403).json({
        message: "Online payments are not available for this business yet. Please contact the business directly.",
        code: "PAYMENT_BLOCKED"
      });
    }
    res.status(500).json({ message: "Error creating payment" });
  }
});

// Rate limiter for portal lookup (prevent enumeration attacks)
const portalLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP per 15 minutes
  message: { message: 'Too many lookup attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public endpoint - Get customer's invoice history by email AND phone (for returning customers)
router.post("/portal/lookup", portalLookupLimiter, async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;

    // Require BOTH email and phone to prevent enumeration
    if (!email || !phone) {
      return res.status(400).json({ message: "Both email and phone are required" });
    }

    // Find customer by email AND phone — both must match
    // For security, we only return invoices that have access tokens
    const invoices = await storage.getInvoicesWithAccessToken(email, phone);

    // Get business names for each invoice
    const invoicesWithBusiness = await Promise.all(
      invoices.map(async (inv) => {
        const business = await storage.getBusiness(inv.businessId);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          total: inv.total,
          status: inv.status,
          dueDate: inv.dueDate,
          createdAt: inv.createdAt,
          accessToken: inv.accessToken,
          businessName: business?.name || 'Unknown Business'
        };
      })
    );

    res.json({
      count: invoices.length,
      invoices: invoicesWithBusiness
    });
  } catch (error) {
    console.error("Error looking up invoices:", error);
    res.status(500).json({ message: "Error looking up invoices" });
  }
});

// Public endpoint - Get customer's appointment history by email AND phone
router.post("/portal/appointments", portalLookupLimiter, async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;

    if (!email || !phone) {
      return res.status(400).json({ message: "Both email and phone are required" });
    }

    const allAppointments = await storage.getAppointmentsByCustomerContact(email, phone);

    // Enrich with service, staff, and business names
    const enriched = await Promise.all(
      allAppointments.map(async (appt) => {
        const [service, staffMember, business] = await Promise.all([
          appt.serviceId ? storage.getService(appt.serviceId) : null,
          appt.staffId ? storage.getStaffMember(appt.staffId) : null,
          storage.getBusiness(appt.businessId),
        ]);

        const now = new Date();
        const startDate = new Date(appt.startDate);
        const isFuture = startDate > now;
        const isCancellable = isFuture && appt.status !== 'cancelled' && appt.status !== 'completed';

        return {
          id: appt.id,
          startDate: appt.startDate,
          endDate: appt.endDate,
          status: appt.status,
          serviceName: service?.name || 'Service',
          servicePrice: service?.price || null,
          staffName: staffMember ? `${staffMember.firstName} ${staffMember.lastName || ''}`.trim() : null,
          businessName: business?.name || 'Unknown Business',
          businessSlug: business?.bookingSlug || null,
          manageToken: isFuture ? appt.manageToken : null, // Only expose manage token for future appointments
          canReschedule: isCancellable,
          canCancel: isCancellable,
          isFuture,
        };
      })
    );

    res.json({
      count: enriched.length,
      upcoming: enriched.filter(a => a.isFuture).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
      past: enriched.filter(a => !a.isFuture).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    });
  } catch (error) {
    console.error("Error looking up appointments:", error);
    res.status(500).json({ message: "Error looking up appointments" });
  }
});

// =================== INVOICE ITEMS API ===================
router.get("/invoice-items/:invoiceId", async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ message: "Invalid invoice ID" });
    }
    // Verify invoice belongs to user's business
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || !verifyBusinessOwnership(invoice, req)) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    const items = await storage.getInvoiceItems(invoiceId);
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: "Error fetching invoice items" });
  }
});

router.post("/invoice-items", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validatedData = insertInvoiceItemSchema.parse(req.body);
    // Verify the invoice belongs to the user's business
    const invoice = await storage.getInvoice(validatedData.invoiceId);
    if (!invoice || !verifyBusinessOwnership(invoice, req)) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    const item = await storage.createInvoiceItem(validatedData);
    res.status(201).json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error creating invoice item" });
  }
});

router.put("/invoice-items/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid invoice item ID" });
    }
    const validatedData = insertInvoiceItemSchema.partial().parse(req.body);
    // Verify via invoiceId in request body or existing item
    const invoiceId = validatedData.invoiceId || req.body.invoiceId;
    if (!invoiceId) {
      return res.status(400).json({ message: "Invoice ID is required" });
    }
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || !verifyBusinessOwnership(invoice, req)) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    const item = await storage.updateInvoiceItem(id, validatedData);
    res.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error updating invoice item" });
  }
});

router.delete("/invoice-items/:invoiceId/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ message: "Invalid invoice ID" });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid invoice item ID" });
    }
    // Verify the invoice belongs to the user's business
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || !verifyBusinessOwnership(invoice, req)) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    await storage.deleteInvoiceItem(id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: "Error deleting invoice item" });
  }
});

// Keep backward-compatible delete route (authenticated)
router.delete("/invoice-items/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid invoice item ID" });
    }
    await storage.deleteInvoiceItem(id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: "Error deleting invoice item" });
  }
});

export default router;
