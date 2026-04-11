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

// =================== AI KNOWLEDGE BASE API ===================

// Trigger website scrape
router.post("/knowledge/scrape-website", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Use URL from request body, or fall back to business profile website
    const url = req.body.url || business.website;
    if (!url) {
      return res.status(400).json({ message: "No website URL provided. Set your business website in Settings or provide a URL." });
    }

    // Start scrape in background (don't await)
    const { scrapeWebsite } = await import('../services/websiteScraperService');
    scrapeWebsite(businessId, url)
      .catch(err => console.error('Background website scrape error:', err));

    res.json({ message: "Website scan started", status: "scraping" });
  } catch (error) {
    console.error("Error starting website scrape:", error);
    res.status(500).json({ message: "Error starting website scan" });
  }
});

// Get website scrape status
router.get("/knowledge/scrape-status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const cache = await storage.getWebsiteScrapeCache(businessId);
    if (!cache) {
      return res.json({ status: 'none' });
    }
    // Also return count of website-sourced knowledge entries
    const websiteEntries = await storage.getBusinessKnowledge(businessId, { source: 'website' });
    res.json({ ...cache, knowledgeEntriesCount: websiteEntries.length });
  } catch (error) {
    res.status(500).json({ message: "Error fetching scrape status" });
  }
});

// List knowledge entries
router.get("/knowledge", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const params: any = {};
    if (req.query.isApproved !== undefined) params.isApproved = req.query.isApproved === 'true';
    if (req.query.source) params.source = req.query.source as string;
    if (req.query.category) params.category = req.query.category as string;
    const entries = await storage.getBusinessKnowledge(businessId, params);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ message: "Error fetching knowledge entries" });
  }
});

// Create manual knowledge entry
router.post("/knowledge", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const { question, answer, category } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ message: "Question and answer are required" });
    }
    const entry = await storage.createBusinessKnowledge({
      businessId,
      question,
      answer,
      category: category || 'faq',
      source: 'owner',
      isApproved: true,
      priority: 10, // Manual entries get highest priority
    });

    // Trigger Retell agent update to include new knowledge
    try {
      const { debouncedUpdateRetellAgent } = await import('../services/retellProvisioningService');
      debouncedUpdateRetellAgent(businessId);
    } catch (e) { console.error(`[Knowledge] Failed to update Retell agent for business ${businessId}:`, e); }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ message: "Error creating knowledge entry" });
  }
});

// Update knowledge entry
router.put("/knowledge/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid knowledge entry ID" });
    }
    const existing = await storage.getBusinessKnowledgeEntry(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Knowledge entry not found" });
    }
    const { question, answer, category, isApproved, priority } = req.body;
    const updated = await storage.updateBusinessKnowledge(id, {
      ...(question !== undefined && { question }),
      ...(answer !== undefined && { answer }),
      ...(category !== undefined && { category }),
      ...(isApproved !== undefined && { isApproved }),
      ...(priority !== undefined && { priority }),
    });

    // Trigger Retell agent update
    try {
      const { debouncedUpdateRetellAgent } = await import('../services/retellProvisioningService');
      debouncedUpdateRetellAgent(existing.businessId);
    } catch (e) { console.error(`[Knowledge] Failed to update Retell agent for business ${existing.businessId}:`, e); }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Error updating knowledge entry" });
  }
});

// Delete knowledge entry
router.delete("/knowledge/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid knowledge entry ID" });
    }
    const existing = await storage.getBusinessKnowledgeEntry(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Knowledge entry not found" });
    }
    await storage.deleteBusinessKnowledge(id, existing.businessId);

    // Trigger Retell agent update
    try {
      const { debouncedUpdateRetellAgent } = await import('../services/retellProvisioningService');
      debouncedUpdateRetellAgent(existing.businessId);
    } catch (e) { console.error(`[Knowledge] Failed to update Retell agent for business ${existing.businessId}:`, e); }

    res.json({ message: "Knowledge entry deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting knowledge entry" });
  }
});

// =================== UNANSWERED QUESTIONS ===================

// List unanswered questions
router.get("/unanswered-questions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const params: any = {};
    if (req.query.status) params.status = req.query.status as string;
    const questions = await storage.getUnansweredQuestions(businessId, params);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching unanswered questions" });
  }
});

// Get pending unanswered question count (for notification badge)
router.get("/unanswered-questions/count", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const count = await storage.getUnansweredQuestionCount(businessId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: "Error fetching question count" });
  }
});

// Answer an unanswered question (promotes to knowledge base)
router.post("/unanswered-questions/:id/answer", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid question ID" });
    }
    const { answer } = req.body;
    if (!answer) {
      return res.status(400).json({ message: "Answer is required" });
    }

    const question = await storage.getUnansweredQuestion(id);
    if (!question || !verifyBusinessOwnership(question, req)) {
      return res.status(404).json({ message: "Question not found" });
    }

    const { promoteToKnowledge } = await import('../services/unansweredQuestionService');
    const result = await promoteToKnowledge(id, answer);

    if (result.success) {
      res.json({ message: "Answer saved to knowledge base", knowledgeEntryId: result.knowledgeEntryId });
    } else {
      res.status(400).json({ message: result.error });
    }
  } catch (error) {
    res.status(500).json({ message: "Error answering question" });
  }
});

// Dismiss an unanswered question
router.post("/unanswered-questions/:id/dismiss", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid question ID" });
    }
    const question = await storage.getUnansweredQuestion(id);
    if (!question || !verifyBusinessOwnership(question, req)) {
      return res.status(404).json({ message: "Question not found" });
    }
    await storage.updateUnansweredQuestion(id, { status: 'dismissed' });
    res.json({ message: "Question dismissed" });
  } catch (error) {
    res.status(500).json({ message: "Error dismissing question" });
  }
});

// Delete an unanswered question
router.delete("/unanswered-questions/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid question ID" });
    }
    const question = await storage.getUnansweredQuestion(id);
    if (!question || !verifyBusinessOwnership(question, req)) {
      return res.status(404).json({ message: "Question not found" });
    }
    await storage.deleteUnansweredQuestion(id, question.businessId);
    res.json({ message: "Question deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting question" });
  }
});

export default router;
