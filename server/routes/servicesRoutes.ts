import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { insertServiceSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, checkIsAdmin, checkBelongsToBusiness } from "../auth";
import { dataCache } from "../services/callToolHandlers";
import retellProvisioningService from "../services/retellProvisioningService";
import { coerceMoneyFields } from "../utils/money";

const router = Router();

// Helper to get businessId from authenticated request
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

// =================== SERVICES API ===================
router.get("/services", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const services = await storage.getServices(businessId);
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: "Error fetching services" });
  }
});

router.get("/services/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid service ID" });
    }
    const service = await storage.getService(id);
    if (!service || !verifyBusinessOwnership(service, req)) {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: "Error fetching service" });
  }
});

router.post("/services", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const validatedData = insertServiceSchema.parse(coerceMoneyFields({ ...req.body, businessId }));
    const service = await storage.createService(validatedData);

    // Invalidate services cache
    dataCache.invalidate(businessId, 'services');

    // Update Retell agent with new services (debounced to prevent race conditions)
    retellProvisioningService.debouncedUpdateRetellAgent(businessId);

    res.status(201).json(service);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error creating service" });
  }
});

// Apply industry-specific service templates
router.post("/services/template", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { businessId, services } = req.body;

    if (!businessId) {
      return res.status(400).json({ message: "Business ID is required" });
    }

    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ message: "Services array is required" });
    }

    // Check if user has access to this business
    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Unauthorized to add services to this business" });
    }

    const createdServices = [];

    // Create services one by one
    for (const serviceData of services) {
      const validatedData = insertServiceSchema.parse(coerceMoneyFields({ ...serviceData, businessId, active: true }));

      const service = await storage.createService(validatedData);
      createdServices.push(service);
    }

    // Seed industry-specific agent configs based on the template being applied
    // The client also sends industryType in the body to identify the template
    const industryType = req.body.industryType || '';
    if (industryType === 'landscaping') {
      try {
        // Follow-up agent: landscaping-specific thank-you and upsell messages
        await storage.upsertAgentSettings(businessId, 'follow_up', true, {
          thankYouTemplate: "Hi {customerName}! Thank you for choosing {businessName} for your lawn and landscape needs. We hope everything looks great! Reply if you need anything.",
          upsellTemplate: "Hi {customerName}, your property is probably due for some attention. Book your next service with {businessName}: {bookingLink}",
          thankYouDelayMinutes: 60,
          upsellDelayHours: 72,
          enableThankYou: true,
          enableUpsell: true,
        });

        // Rebooking agent: weekly mowing cycle + seasonal service intervals
        await storage.upsertAgentSettings(businessId, 'rebooking', true, {
          defaultIntervalDays: 7,
          serviceIntervals: {
            'Lawn Mowing': 7,
            'Fertilization Treatment': 42,
            'Tree & Shrub Trimming': 90,
            'Mulching': 180,
            'Lawn Aeration & Seeding': 365,
            'Spring Cleanup': 365,
            'Fall Leaf Cleanup': 365,
          },
          messageTemplate: "Hi {customerName}! It's been {daysSinceVisit} days since your last {serviceName} with {businessName}. Ready for us to come back? Reply YES to schedule!",
          bookingReplyTemplate: "Great! Book your next service here: {bookingLink} or call us at {businessPhone}",
          declineReplyTemplate: "No problem, {customerName}! We'll be here when your yard needs us. - {businessName}",
        });

        // No-show agent: tuned for estimate walkthroughs
        await storage.upsertAgentSettings(businessId, 'no_show', true, {
          messageTemplate: "Hey {customerName}, we stopped by for your estimate walkthrough with {businessName} but didn't catch you. Want to reschedule? Reply YES!",
          rescheduleReplyTemplate: "Great! Book your free estimate here: {bookingLink} or call {businessPhone}.",
          declineReplyTemplate: "No problem! Whenever you're ready for that free estimate, just give us a call. - {businessName}",
          expirationHours: 48,
        });

        // Estimate follow-up agent: patient cadence with seasonal urgency
        await storage.upsertAgentSettings(businessId, 'estimate_follow_up', true, {
          messageTemplates: [
            "Hi {customerName}! Just following up on your estimate from {businessName}. Any questions about the work we discussed?",
            "Hi {customerName}, wanted to check in on your landscaping estimate. Spots are filling up — let us know if you'd like to get on the schedule!",
            "Hi {customerName}, last check-in on your estimate from {businessName}. We'd love to help transform your property!",
          ],
          attemptIntervalHours: [72, 168, 336],
          maxAttempts: 3,
          autoExpire: true,
        });

        console.log(`[Template] Seeded landscaping-specific agent configs for business ${businessId}`);
      } catch (agentErr) {
        console.error(`[Template] Failed to seed landscaping agent configs for business ${businessId}:`, agentErr);
        // Non-fatal — services were still created successfully
      }
    }

    // Invalidate services cache after bulk creation
    dataCache.invalidate(businessId, 'services');

    res.status(201).json({
      message: `Created ${createdServices.length} services`,
      services: createdServices
    });
  } catch (error) {
    console.error("Error applying service template:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error applying service template" });
  }
});

router.put("/services/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid service ID" });
    }
    // Verify ownership before update
    const existing = await storage.getService(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Service not found" });
    }
    const validatedData = insertServiceSchema.partial().parse(coerceMoneyFields(req.body));
    const service = await storage.updateService(id, validatedData);

    // Invalidate services cache
    dataCache.invalidate(existing.businessId, 'services');

    // Update Retell agent with updated services (debounced to prevent race conditions)
    retellProvisioningService.debouncedUpdateRetellAgent(existing.businessId);

    res.json(service);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error updating service" });
  }
});

router.delete("/services/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid service ID" });
    }
    // Verify ownership before delete
    const existing = await storage.getService(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Service not found" });
    }
    const businessId = existing.businessId;
    await storage.deleteService(id, businessId);

    // Invalidate services cache
    dataCache.invalidate(businessId, 'services');

    // Update Retell agent after service deletion (debounced to prevent race conditions)
    retellProvisioningService.debouncedUpdateRetellAgent(businessId);

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: "Error deleting service" });
  }
});

export default router;
