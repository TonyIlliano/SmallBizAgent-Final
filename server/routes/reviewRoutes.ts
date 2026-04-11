import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";

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

// =================== REVIEW REQUESTS API ===================
// Get review settings for a business
router.get("/review-settings", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const reviewService = await import('../services/reviewService');
    const settings = await reviewService.getReviewSettings(businessId);
    res.json(settings || {
      businessId,
      reviewRequestEnabled: false,
      autoSendAfterJobCompletion: false,
      preferredPlatform: 'google'
    });
  } catch (error) {
    console.error("Error fetching review settings:", error);
    res.status(500).json({ message: "Error fetching review settings" });
  }
});

// Update review settings
router.put("/review-settings", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const reviewService = await import('../services/reviewService');
    const settings = await reviewService.upsertReviewSettings(businessId, req.body);
    res.json(settings);
  } catch (error) {
    console.error("Error updating review settings:", error);
    res.status(500).json({ message: "Error updating review settings" });
  }
});

// Send review request manually
router.post("/review-requests/send", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const { customerId, jobId, via = 'sms' } = req.body;

    if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    const reviewService = await import('../services/reviewService');

    let result;
    if (via === 'email') {
      result = await reviewService.sendReviewRequestEmail(businessId, customerId, jobId);
    } else {
      result = await reviewService.sendReviewRequestSms(businessId, customerId, jobId);
    }

    if (result.success) {
      res.json({ success: true, requestId: result.requestId });
    } else {
      res.status(400).json({ success: false, message: result.error });
    }
  } catch (error: any) {
    console.error("Error sending review request:", error);
    res.status(500).json({ message: error.message || "Error sending review request" });
  }
});

// Send review request for a specific job
router.post("/jobs/:id/request-review", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ message: "Invalid job ID" });
    }
    const businessId = getBusinessId(req);

    // Verify job belongs to business
    const job = await storage.getJob(jobId);
    if (!job || !verifyBusinessOwnership(job, req)) {
      return res.status(404).json({ message: "Job not found" });
    }

    const reviewService = await import('../services/reviewService');
    const result = await reviewService.sendReviewRequestForCompletedJob(jobId, businessId);

    if (result.success) {
      res.json({ success: true, requestId: result.requestId, message: "Review request sent!" });
    } else {
      res.status(400).json({ success: false, message: result.error });
    }
  } catch (error: any) {
    console.error("Error sending review request for job:", error);
    res.status(500).json({ message: error.message || "Error sending review request" });
  }
});

// Get review request history
router.get("/review-requests", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const limit = parseInt(req.query.limit as string) || 50;
    const reviewService = await import('../services/reviewService');
    const requests = await reviewService.getReviewRequests(businessId, limit);
    res.json(requests);
  } catch (error) {
    console.error("Error fetching review requests:", error);
    res.status(500).json({ message: "Error fetching review requests" });
  }
});

// Get review statistics
router.get("/review-stats", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const reviewService = await import('../services/reviewService');
    const stats = await reviewService.getReviewStats(businessId);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching review stats:", error);
    res.status(500).json({ message: "Error fetching review stats" });
  }
});

// Track review link click (public endpoint)
router.get("/review-track/:requestId", async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId);
    if (isNaN(requestId)) {
      return res.redirect(req.query.url as string || '/');
    }
    const reviewService = await import('../services/reviewService');
    await reviewService.markReviewClicked(requestId);

    // Redirect to the actual review URL
    // In production, you'd lookup the review URL from the request
    res.redirect(req.query.url as string || '/');
  } catch (error) {
    console.error("Error tracking review click:", error);
    res.redirect(req.query.url as string || '/');
  }
});

export default router;
