/**
 * Support Chat API Routes
 * POST /api/support/chat — context-aware AI support responses
 * GET /api/support/suggestions — page-specific suggested questions
 */
import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { answerQuestion, getSuggestedQuestions } from '../services/supportChatService';
import { z } from 'zod';

const router = Router();

// Rate limiting: track per-user message counts
const rateLimits = new Map<number, { count: number; resetAt: number }>();

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + 60 * 1000 }); // 1-minute window
    return true;
  }
  if (entry.count >= 20) return false; // 20 messages per minute
  entry.count++;
  return true;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(rateLimits.keys());
  for (const userId of keys) {
    const entry = rateLimits.get(userId);
    if (entry && now > entry.resetAt) rateLimits.delete(userId);
  }
}, 5 * 60 * 1000);

const chatSchema = z.object({
  question: z.string().min(1).max(500),
  currentPage: z.string().max(200),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).default([]),
});

// POST /api/support/chat
router.post('/chat', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user?.businessId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Rate limit check
    if (!checkRateLimit(user.id)) {
      return res.status(429).json({ error: 'Too many messages. Please wait a moment.' });
    }

    // Validate body
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    }

    const { question, currentPage, history } = parsed.data;

    const result = await answerQuestion(user.id, user.businessId, question, currentPage, history);

    res.json(result);
  } catch (error: any) {
    console.error('[SupportChat Route] Error:', error.message);
    res.status(500).json({ error: 'Failed to process your question. Please try again.' });
  }
});

// GET /api/support/suggestions?page=/dashboard
router.get('/suggestions', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentPage = (req.query.page as string) || '/dashboard';
    const suggestions = getSuggestedQuestions(currentPage);
    res.json({ suggestions });
  } catch (error: any) {
    res.status(500).json({ suggestions: ['How do I get started?', 'What can the AI do?', 'How do I contact support?'] });
  }
});

export default router;
