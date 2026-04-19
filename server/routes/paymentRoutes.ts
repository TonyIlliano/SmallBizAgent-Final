import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import Stripe from "stripe";
import { stripeConnectService } from "../services/stripeConnectService";
import { toMoney, roundMoney } from "../utils/money";

// SECURITY: Stripe key is required - no fallback
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.warn('  STRIPE_SECRET_KEY not configured - payment features will not work');
}
const stripe = stripeKey ? new Stripe(stripeKey) : null;

const router = Router();

// Rate limit payment intent creation (10/min/IP) to prevent invoice ID walking
const paymentIntentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many payment requests. Please try again in a moment." },
});

// =================== PAYMENT API (STRIPE CONNECT) ===================
// Uses Stripe Connect destination charges - money goes to business, NOT platform
router.post("/create-payment-intent", paymentIntentLimiter, async (req: Request, res: Response) => {
  try {
    const { amount, invoiceId, accessToken } = req.body;

    // SECURITY: Validate invoiceId
    const invoiceIdNum = typeof invoiceId === 'number' ? invoiceId : parseInt(invoiceId);
    if (!Number.isFinite(invoiceIdNum) || invoiceIdNum <= 0) {
      return res.status(400).json({ message: "Invalid invoice ID" });
    }

    // Fetch invoice to get customer details
    const invoice = await storage.getInvoice(invoiceIdNum);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // SECURITY: Authorization check — must be authenticated owner OR have valid access token
    const isAuthenticatedOwner =
      req.isAuthenticated?.() &&
      (req.user?.role === 'admin' || req.user?.businessId === invoice.businessId);

    const hasValidAccessToken =
      !!accessToken &&
      !!invoice.accessToken &&
      String(accessToken) === String(invoice.accessToken);

    // If access token provided, also check expiry
    if (hasValidAccessToken && invoice.accessTokenExpiresAt) {
      const expiresAt = new Date(invoice.accessTokenExpiresAt as any).getTime();
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        return res.status(410).json({ message: "Payment link has expired. Please request a new one." });
      }
    }

    if (!isAuthenticatedOwner && !hasValidAccessToken) {
      return res.status(403).json({ message: "Access denied" });
    }

    // SECURITY: Reject already-paid invoices
    if (invoice.status === 'paid') {
      return res.status(400).json({ message: "Invoice is already paid" });
    }

    // SECURITY: Validate amount equals invoice.total exactly (to the cent)
    const requestedAmount = roundMoney(toMoney(amount));
    const invoiceTotal = roundMoney(toMoney(invoice.total));

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    // Use integer cents comparison to avoid floating-point drift
    if (Math.round(requestedAmount * 100) !== Math.round(invoiceTotal * 100)) {
      return res.status(400).json({
        message: "Payment amount must match the invoice total exactly",
      });
    }

    const customer = await storage.getCustomer(invoice.customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Use Stripe Connect service - will REJECT if business has no Connect account
    const result = await stripeConnectService.createPaymentIntentForInvoice({
      amount: requestedAmount,
      businessId: invoice.businessId,
      invoiceId: invoiceIdNum,
      invoiceNumber: invoice.invoiceNumber,
      customerName: `${customer.firstName} ${customer.lastName}`,
      isPortalPayment: hasValidAccessToken && !isAuthenticatedOwner,
    });

    // Update invoice with payment intent ID
    await storage.updateInvoice(invoiceIdNum, {
      stripePaymentIntentId: result.paymentIntentId
    });

    res.json({ clientSecret: result.clientSecret });
  } catch (error: any) {
    console.error("Error creating payment intent:", error);
    // Return specific message for payment blocked (no Connect account)
    if (error.message?.includes('PAYMENT_BLOCKED')) {
      return res.status(403).json({
        message: "Online payments are not available. Please connect your Stripe account in Settings > Integrations first.",
        code: "PAYMENT_BLOCKED"
      });
    }
    res.status(500).json({ message: "Error creating payment intent" });
  }
});

// Webhook to handle Stripe events
router.post("/stripe-webhook", async (req: Request, res: Response) => {
  // SECURITY: Require Stripe webhook secret in production
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  if (!stripe) {
    console.error('Stripe not configured - rejecting webhook');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'] as string;
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const invoiceId = parseInt(paymentIntent.metadata?.invoiceId);

      // Update invoice status to paid
      if (invoiceId) {
        try {
          await storage.updateInvoice(invoiceId, { status: 'paid' });

          // Notify business owner of payment (fire-and-forget)
          const paidInvoice = await storage.getInvoice(invoiceId);
          if (paidInvoice) {
            import('../services/ownerNotificationService').then(mod => {
              mod.notifyOwnerPaymentReceived(invoiceId, paidInvoice.businessId, paymentIntent.amount / 100)
                .catch(err => console.error('[OwnerNotify] Payment alert error:', err));
            }).catch(err => console.error('[OwnerNotify] Import error:', err));

            // Orchestrator: route invoice.paid to recalculate customer insights (fire-and-forget)
            import('../services/orchestrationService').then(mod => {
              mod.dispatchEvent('invoice.paid', {
                businessId: paidInvoice.businessId,
                customerId: paidInvoice.customerId || undefined,
              }).catch(err => console.error('[Orchestrator] Error dispatching invoice.paid:', err));
            }).catch(err => console.error('[Orchestrator] Import error:', err));
          }
        } catch (error) {
          console.error('Error updating invoice status:', error);
        }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const failedPayment = event.data.object;
      const failedInvoiceId = parseInt(failedPayment.metadata?.invoiceId);
      if (failedInvoiceId) {
        console.warn(`[Stripe] Payment failed for invoice ${failedInvoiceId}: ${failedPayment.last_payment_error?.message || 'Unknown reason'}`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const deletedSub = event.data.object;
      console.warn(`[Stripe] Subscription deleted: ${deletedSub.id} - customer: ${deletedSub.customer}`);
      // Note: subscription lifecycle is also handled by subscriptionRoutes webhook
      break;
    }

    case 'invoice.payment_failed': {
      const failedInvoice = event.data.object as any;
      console.warn(`[Stripe] Invoice payment failed: ${failedInvoice.id} - subscription: ${failedInvoice.subscription || 'N/A'}`);
      break;
    }

    case 'account.updated': {
      // Stripe Connect: sync connected account status when it changes
      try {
        const account = event.data.object;
        await stripeConnectService.handleAccountUpdated(account);
      } catch (error) {
        console.error('Error handling account.updated webhook:', error);
      }
      break;
    }

    default:
      // Log unhandled events for monitoring (not an error, just informational)
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
      }
  }

  // Return a response to acknowledge receipt of the event
  res.json({received: true});
});

export default router;
