/**
 * Social Media Routes
 *
 * OAuth flows for connecting social platforms + post CRUD for admin review workflow.
 * All routes except OAuth callbacks require admin auth.
 */

import { Router, Request, Response } from "express";
import { isAdmin } from "../middleware/auth";
import { db } from "../db";
import { socialMediaPosts, videoBriefs, videoClips } from "../../shared/schema";
import { eq, desc, sql, and, asc } from "drizzle-orm";
import multer from "multer";

const router = Router();

const VALID_PLATFORMS = ['twitter', 'facebook', 'instagram', 'linkedin'] as const;
type SocialPlatform = typeof VALID_PLATFORMS[number];

function isValidPlatform(platform: string): platform is SocialPlatform {
  return VALID_PLATFORMS.includes(platform as SocialPlatform);
}

/**
 * GET /status — Get connection status for all 4 platforms
 */
router.get('/status', isAdmin, async (req: Request, res: Response) => {
  try {
    const { socialMediaService } = await import("../services/socialMediaService");
    const statuses = await socialMediaService.getAllConnectionStatuses();
    res.json(statuses);
  } catch (error: any) {
    console.error('[SocialMedia] Error fetching connection statuses:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /posts/winners — List winner posts (for generate-from-winners and video-brief)
 * Query params: ?platform=&industry=
 */
router.get('/posts/winners', isAdmin, async (req: Request, res: Response) => {
  try {
    const { platform, industry } = req.query;

    const conditions = [
      eq(socialMediaPosts.status, 'published'),
      eq(socialMediaPosts.isWinner, true),
    ];

    if (platform && typeof platform === 'string') {
      conditions.push(eq(socialMediaPosts.platform, platform));
    }
    if (industry && typeof industry === 'string') {
      conditions.push(eq(socialMediaPosts.industry, industry));
    }

    const winners = await db
      .select()
      .from(socialMediaPosts)
      .where(and(...conditions))
      .orderBy(desc(socialMediaPosts.engagementScore))
      .limit(20);

    res.json(winners);
  } catch (error: any) {
    console.error('[SocialMedia] Error fetching winners:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /:platform/auth-url — Generate OAuth URL for a platform
 */
router.get('/:platform/auth-url', isAdmin, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;

    if (!isValidPlatform(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }

    const { socialMediaService } = await import("../services/socialMediaService");
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const url = await socialMediaService.getAuthUrl(platform, baseUrl);
    if (!url) {
      return res.status(501).json({ error: `${platform} is not configured yet. OAuth credentials are missing on the server.` });
    }
    res.json({ url });
  } catch (error: any) {
    console.error('[SocialMedia] Error generating auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /:platform/callback — Handle OAuth callback from provider
 * NO auth middleware — this is the redirect from the social platform
 */
router.get('/:platform/callback', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;

    if (!isValidPlatform(platform)) {
      return res.status(400).send('<html><body><p>Invalid platform.</p></body></html>');
    }

    const { code, state } = req.query;

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.status(400).send('<html><body><p>Missing required parameters.</p></body></html>');
    }

    const { socialMediaService } = await import("../services/socialMediaService");
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    await socialMediaService.handleCallback(platform, code, state, baseUrl);

    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

    res.send(`<html><body><p>\u2713 ${platformName} Connected!</p><script>
if(window.opener){window.opener.postMessage({type:'social-connected',platform:'${platform}'},window.opener.location.origin);}
setTimeout(function(){window.close();},2000);
</script></body></html>`);
  } catch (error: any) {
    console.error('[SocialMedia] OAuth callback error:', error);
    res.status(500).send(`<html><body><p>Error connecting platform: ${error.message || 'Unknown error'}</p><p>Please close this window and try again.</p></body></html>`);
  }
});

/**
 * DELETE /:platform — Disconnect a social media platform
 */
router.delete('/:platform', isAdmin, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;

    if (!isValidPlatform(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }

    const { socialMediaService } = await import("../services/socialMediaService");
    await socialMediaService.disconnect(platform);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[SocialMedia] Error disconnecting platform:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /posts — List posts with optional status filter
 * Query params: ?status=draft|approved|published|failed|rejected
 */
router.get('/posts', isAdmin, async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;
    const validStatuses = ['draft', 'approved', 'published', 'failed', 'rejected'];

    let posts;
    if (statusFilter && validStatuses.includes(statusFilter)) {
      posts = await db
        .select()
        .from(socialMediaPosts)
        .where(eq(socialMediaPosts.status, statusFilter))
        .orderBy(desc(socialMediaPosts.createdAt))
        .limit(100);
    } else {
      posts = await db
        .select()
        .from(socialMediaPosts)
        .orderBy(desc(socialMediaPosts.createdAt))
        .limit(100);
    }
    res.json(posts);
  } catch (error: any) {
    console.error('[SocialMedia] Error fetching posts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /posts/:id — Get a single post by ID
 */
router.get('/posts/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const [post] = await db
      .select()
      .from(socialMediaPosts)
      .where(eq(socialMediaPosts.id, id))
      .limit(1);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(post);
  } catch (error: any) {
    console.error('[SocialMedia] Error fetching post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /posts/:id/approve — Approve a draft post
 * Body: { scheduledFor?: string } (ISO date, optional)
 */
router.post('/posts/:id/approve', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const { scheduledFor } = req.body || {};

    const updateValues: Record<string, any> = {
      status: 'approved',
      updatedAt: new Date(),
    };

    if (scheduledFor) {
      updateValues.scheduledFor = new Date(scheduledFor);
    }

    const [updated] = await db
      .update(socialMediaPosts)
      .set(updateValues)
      .where(eq(socialMediaPosts.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[SocialMedia] Error approving post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /posts/:id/reject — Reject a draft post
 * Body: { reason?: string }
 */
router.post('/posts/:id/reject', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const { reason } = req.body || {};

    const [updated] = await db
      .update(socialMediaPosts)
      .set({
        status: 'rejected',
        rejectionReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(socialMediaPosts.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[SocialMedia] Error rejecting post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /posts/:id — Edit post content
 * Body: { content: string }
 */
router.put('/posts/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required and must be a string' });
    }

    const [updated] = await db
      .update(socialMediaPosts)
      .set({
        editedContent: content,
        updatedAt: new Date(),
      })
      .where(eq(socialMediaPosts.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('[SocialMedia] Error editing post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /posts/:id/publish — Publish a post immediately
 */
router.post('/posts/:id/publish', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const { socialMediaService } = await import("../services/socialMediaService");
    const result = await socialMediaService.publishPost(id);
    res.json(result);
  } catch (error: any) {
    console.error('[SocialMedia] Error publishing post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /posts/:id — Delete a draft or rejected post
 */
router.delete('/posts/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    // Only allow deleting draft or rejected posts
    const [post] = await db
      .select()
      .from(socialMediaPosts)
      .where(eq(socialMediaPosts.id, id))
      .limit(1);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.status !== 'draft' && post.status !== 'rejected') {
      return res.status(400).json({ error: 'Only draft or rejected posts can be deleted' });
    }

    await db
      .delete(socialMediaPosts)
      .where(eq(socialMediaPosts.id, id));

    res.json({ success: true });
  } catch (error: any) {
    console.error('[SocialMedia] Error deleting post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /generate — Manually trigger the social media agent
 */
router.post('/generate', isAdmin, async (req: Request, res: Response) => {
  try {
    const { runSocialMediaAgent } = await import("../services/platformAgents/socialMediaAgent");
    const result = await runSocialMediaAgent();
    res.json(result);
  } catch (error: any) {
    console.error('[SocialMedia] Error running social media agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /posts/:id/generate-video — Generate a video for an existing text post
 */
router.post('/posts/:id/generate-video', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const [post] = await db
      .select()
      .from(socialMediaPosts)
      .where(eq(socialMediaPosts.id, id))
      .limit(1);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { isVideoGenerationAvailable, generateMarketingVideo } = await import("../services/videoGenerationService");

    if (!isVideoGenerationAvailable()) {
      return res.status(503).json({ error: 'Video generation not configured. Set SHOTSTACK_API_KEY.' });
    }

    // Generate video asynchronously — update the post when done
    const platform = post.platform as any;
    const industry = post.industry || 'Small Business';
    const content = post.editedContent || post.content;

    // Return immediately with a "generating" status
    res.json({ status: 'generating', postId: id });

    // Generate in background
    try {
      const result = await generateMarketingVideo(platform, industry, content);

      if (result.success && result.videoUrl) {
        await db
          .update(socialMediaPosts)
          .set({
            mediaUrl: result.videoUrl,
            mediaType: 'video',
            thumbnailUrl: result.thumbnailUrl || null,
            details: {
              ...(post.details as Record<string, any> || {}),
              video: {
                renderId: result.renderId,
                duration: result.duration,
                template: result.template,
                generatedAt: new Date().toISOString(),
              },
            },
            updatedAt: new Date(),
          })
          .where(eq(socialMediaPosts.id, id));

        console.log(`[SocialMedia] Video generated for post ${id}: ${result.videoUrl}`);
      } else {
        console.error(`[SocialMedia] Video generation failed for post ${id}: ${result.error}`);
      }
    } catch (err) {
      console.error(`[SocialMedia] Background video generation error for post ${id}:`, err);
    }
  } catch (error: any) {
    console.error('[SocialMedia] Error triggering video generation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /posts/:id/video-status — Check video generation status for a post
 */
router.get('/posts/:id/video-status', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const [post] = await db
      .select()
      .from(socialMediaPosts)
      .where(eq(socialMediaPosts.id, id))
      .limit(1);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const details = post.details as Record<string, any> || {};
    const videoMeta = details.video || null;

    res.json({
      postId: id,
      mediaType: post.mediaType || 'text',
      mediaUrl: post.mediaUrl || null,
      thumbnailUrl: post.thumbnailUrl || null,
      videoMeta,
      hasVideo: post.mediaType === 'video' && !!post.mediaUrl,
    });
  } catch (error: any) {
    console.error('[SocialMedia] Error checking video status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /video-available — Check if video generation is configured
 */
router.get('/video-available', isAdmin, async (req: Request, res: Response) => {
  try {
    const { isVideoGenerationAvailable } = await import("../services/videoGenerationService");
    res.json({ available: isVideoGenerationAvailable() });
  } catch (error: any) {
    res.json({ available: false });
  }
});

// ── Performance Review: Engagement Metrics + Winners ──────────────────

/**
 * PUT /posts/:id/metrics — Save engagement metrics for a published post
 * Body: { likes, comments, shares, saves, reach }
 */
router.put('/posts/:id/metrics', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid post ID' });

    const { likes = 0, comments = 0, shares = 0, saves = 0, reach = 0 } = req.body;

    // Validate all are non-negative numbers
    const metrics = { likes: Number(likes), comments: Number(comments), shares: Number(shares), saves: Number(saves), reach: Number(reach) };
    for (const [key, val] of Object.entries(metrics)) {
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ error: `${key} must be a non-negative number` });
      }
    }

    // Verify post exists and is published
    const [post] = await db.select().from(socialMediaPosts).where(eq(socialMediaPosts.id, id)).limit(1);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'published') return res.status(400).json({ error: 'Metrics can only be set on published posts' });

    // Compute engagement score: (saves×3 + shares×2 + comments×1.5 + likes×1) / max(reach, 1)
    const engagementScore = (metrics.saves * 3 + metrics.shares * 2 + metrics.comments * 1.5 + metrics.likes) / Math.max(metrics.reach, 1);

    const [updated] = await db
      .update(socialMediaPosts)
      .set({ ...metrics, engagementScore, updatedAt: new Date() })
      .where(eq(socialMediaPosts.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('[SocialMedia] Error updating metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /posts/:id/winner — Toggle winner status on a published post
 */
router.post('/posts/:id/winner', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid post ID' });

    const [post] = await db.select().from(socialMediaPosts).where(eq(socialMediaPosts.id, id)).limit(1);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'published') return res.status(400).json({ error: 'Only published posts can be marked as winners' });

    const [updated] = await db
      .update(socialMediaPosts)
      .set({ isWinner: !post.isWinner, updatedAt: new Date() })
      .where(eq(socialMediaPosts.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('[SocialMedia] Error toggling winner:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Generate from Winners ─────────────────────────────────────────────

/**
 * POST /generate-from-winners — Generate posts modeled after winner content
 * Body: { vertical: string, platform: string, count?: number }
 */
router.post('/generate-from-winners', isAdmin, async (req: Request, res: Response) => {
  try {
    const { vertical, platform, count = 5 } = req.body;

    if (!vertical || typeof vertical !== 'string') {
      return res.status(400).json({ error: 'vertical is required' });
    }
    if (!platform || !isValidPlatform(platform)) {
      return res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }
    const postCount = Math.min(Math.max(Number(count) || 5, 1), 10);

    // Fetch winner posts
    const winners = await db
      .select()
      .from(socialMediaPosts)
      .where(and(
        eq(socialMediaPosts.isWinner, true),
        eq(socialMediaPosts.status, 'published'),
      ))
      .orderBy(desc(socialMediaPosts.engagementScore))
      .limit(10);

    if (winners.length === 0) {
      return res.status(400).json({ error: 'No winner posts found. Mark some published posts as winners first.' });
    }

    // Build prompt with winner examples as few-shot training
    const winnerExamples = winners
      .map((w, i) => {
        const content = w.editedContent || w.content;
        const score = w.engagementScore ? ` (engagement score: ${(w.engagementScore * 100).toFixed(2)}%)` : '';
        return `Example ${i + 1} [${w.platform}${w.industry ? ` | ${w.industry}` : ''}]${score}:\n${content}`;
      })
      .join('\n\n');

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: `You are a social media strategist for SmallBizAgent (smallbizagent.ai) — an AI-powered business management platform for small service businesses. The platform includes AI voice reception, SMS automation, CRM, scheduling, invoicing, and marketing tools.

Analyze these top-performing posts and create ${postCount} new ${platform} posts targeting ${vertical} business owners. Model them after what made the winners work — their hook style, tone, structure, and emotional triggers.

Top-performing posts:
${winnerExamples}

Each post must follow this structure:
- Line 1: Pain-first hook that stops the scroll
- Body: Specific scenario, stat, or outcome relevant to ${vertical}
- End: One CTA tied to SmallBizAgent

Rotate through these content pillars across the posts:
1. Pain Amplification  2. Feature in Context  3. Social Proof / Outcome  4. Education  5. Behind the Build

Return ONLY valid JSON array. No markdown, no explanation:
[{ "pillar": "...", "content": "full post text", "hashtags": ["tag1", "tag2"] }]`,
        },
      ],
      temperature: 0.85,
      max_completion_tokens: 2000,
    });

    const text = response.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    let generated: Array<{ pillar: string; content: string; hashtags: string[] }>;

    try {
      generated = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response. Try again.' });
    }

    // Insert all as drafts
    let draftsGenerated = 0;
    for (const post of generated) {
      const hashtagString = post.hashtags?.length ? '\n\n' + post.hashtags.map(h => `#${h}`).join(' ') : '';
      await db.insert(socialMediaPosts).values({
        platform,
        content: post.content + hashtagString,
        industry: vertical.toLowerCase(),
        agentType: 'platform:social_media',
        status: 'draft',
        details: {
          generatedVia: 'winner_training',
          pillar: post.pillar,
          sourceWinners: winners.map(w => w.id),
          model: 'gpt-5.4-mini',
        },
      });
      draftsGenerated++;
    }

    res.json({ draftsGenerated, sourceWinners: winners.length });
  } catch (error: any) {
    console.error('[SocialMedia] Error generating from winners:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Video Brief Generator ─────────────────────────────────────────────

/**
 * POST /video-brief — Generate a video ad brief via OpenAI
 * Body: { vertical: string, platform: string, pillar?: string, useWinners?: boolean }
 */
router.post('/video-brief', isAdmin, async (req: Request, res: Response) => {
  try {
    const { vertical, platform, pillar, useWinners = false } = req.body;

    if (!vertical || typeof vertical !== 'string') {
      return res.status(400).json({ error: 'vertical is required' });
    }
    if (!platform || typeof platform !== 'string') {
      return res.status(400).json({ error: 'platform is required' });
    }

    // Optionally fetch winner posts for inspiration
    let winnerContext = '';
    let winnerIds: number[] = [];
    if (useWinners) {
      const winners = await db
        .select()
        .from(socialMediaPosts)
        .where(and(eq(socialMediaPosts.isWinner, true), eq(socialMediaPosts.status, 'published')))
        .orderBy(desc(socialMediaPosts.engagementScore))
        .limit(5);

      if (winners.length > 0) {
        winnerIds = winners.map(w => w.id);
        winnerContext = `\n\nTop-performing post content for tone/style reference:\n${winners.map(w => `- "${(w.editedContent || w.content).slice(0, 200)}"`).join('\n')}`;
      }
    }

    const pillarLabel = pillar || 'Pain Amplification';

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: `You are a social media video ad strategist for SmallBizAgent (smallbizagent.ai) — an AI-powered platform for small service businesses (AI voice reception, SMS automation, CRM, scheduling, invoicing, marketing).

Create a split-screen video ad brief targeting ${vertical} owners on ${platform}.

Content pillar: ${pillarLabel}
${winnerContext}

Video format:
- TOP HALF: Screen recording of SmallBizAgent UI in action
- BOTTOM HALF: B-roll lifestyle footage of a ${vertical.toLowerCase()} professional working, hands busy, phone untouched
- Duration: 15–30 seconds
- Hook must land in first 2 seconds

Return ONLY valid JSON, no markdown:
{
  "hook": "First 2-second attention-grabbing text/voiceover",
  "voiceover": "Full spoken script (null if text-only)",
  "screen_sequence": [
    { "duration": "X sec", "clip": "What to show on screen", "note": "UI details" }
  ],
  "broll": "Description of the lifestyle footage to source",
  "caption": "Full social media caption",
  "hashtags": ["tag1", "tag2", "tag3"],
  "cta_overlay": "Text shown in last 3 seconds",
  "boost_targeting": "One-line Meta ad targeting summary",
  "boost_budget": "$X/day",
  "stock_search_terms": ["search term 1", "search term 2"],
  "estimated_duration": 25
}`,
        },
      ],
      temperature: 0.8,
      max_completion_tokens: 1500,
    });

    const text = response.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    let briefData: any;

    try {
      briefData = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response. Try again.' });
    }

    // Save to database
    const [brief] = await db
      .insert(videoBriefs)
      .values({
        vertical,
        platform,
        pillar: pillarLabel,
        briefData,
        sourceWinnerIds: winnerIds.length > 0 ? winnerIds : null,
      })
      .returning();

    res.json(brief);
  } catch (error: any) {
    console.error('[SocialMedia] Error generating video brief:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /video-briefs — List video briefs
 * Query params: ?vertical=&platform=
 */
router.get('/video-briefs', isAdmin, async (req: Request, res: Response) => {
  try {
    const { vertical, platform } = req.query;
    const conditions: any[] = [];

    if (vertical && typeof vertical === 'string') {
      conditions.push(eq(videoBriefs.vertical, vertical));
    }
    if (platform && typeof platform === 'string') {
      conditions.push(eq(videoBriefs.platform, platform));
    }

    const briefs = conditions.length > 0
      ? await db.select().from(videoBriefs).where(and(...conditions)).orderBy(desc(videoBriefs.createdAt)).limit(50)
      : await db.select().from(videoBriefs).orderBy(desc(videoBriefs.createdAt)).limit(50);

    res.json(briefs);
  } catch (error: any) {
    console.error('[SocialMedia] Error fetching video briefs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /video-briefs/:id — Get a single video brief
 */
router.get('/video-briefs/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid brief ID' });

    const [brief] = await db.select().from(videoBriefs).where(eq(videoBriefs.id, id)).limit(1);
    if (!brief) return res.status(404).json({ error: 'Brief not found' });

    res.json(brief);
  } catch (error: any) {
    console.error('[SocialMedia] Error fetching video brief:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /video-briefs/:id — Delete a video brief
 */
router.delete('/video-briefs/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid brief ID' });

    const [brief] = await db.select().from(videoBriefs).where(eq(videoBriefs.id, id)).limit(1);
    if (!brief) return res.status(404).json({ error: 'Brief not found' });

    await db.delete(videoBriefs).where(eq(videoBriefs.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('[SocialMedia] Error deleting video brief:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Clip Library ──────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
});

/**
 * GET /clips — List all clips in the library
 */
router.get('/clips', isAdmin, async (_req: Request, res: Response) => {
  try {
    const clips = await db.select().from(videoClips).orderBy(asc(videoClips.sortOrder), desc(videoClips.createdAt));
    res.json(clips);
  } catch (error: any) {
    console.error('[SocialMedia] Error fetching clips:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /clips — Upload a new clip to the library
 * Multipart form: file (video), name, description, category, tags (JSON string array)
 */
router.post('/clips', isAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const { name, description, category, tags } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'category is required' });
    }

    const { uploadBufferToS3, isS3Configured } = await import('../utils/s3Upload');

    if (!isS3Configured()) {
      return res.status(503).json({ error: 'S3 is not configured — cannot upload clips' });
    }

    const timestamp = Date.now();
    const ext = req.file.originalname.split('.').pop() || 'mp4';
    const s3Key = `social-media/clip-library/${category}/${timestamp}-${name.replace(/\s+/g, '-').toLowerCase()}.${ext}`;

    const s3Url = await uploadBufferToS3(req.file.buffer, s3Key, req.file.mimetype);

    let parsedTags: string[] | null = null;
    if (tags) {
      try {
        parsedTags = JSON.parse(tags);
      } catch {
        parsedTags = tags.split(',').map((t: string) => t.trim());
      }
    }

    const [clip] = await db.insert(videoClips).values({
      name,
      description: description || null,
      category,
      s3Key,
      s3Url,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      tags: parsedTags,
    }).returning();

    console.log(`[SocialMedia] Clip uploaded: "${name}" (${(req.file.size / 1024 / 1024).toFixed(1)}MB) → ${s3Url}`);
    res.json(clip);
  } catch (error: any) {
    console.error('[SocialMedia] Error uploading clip:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GIF-to-MP4 Converter ────────────────────────────────────────────────

const gifUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for GIFs
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/gif') {
      cb(null, true);
    } else {
      cb(new Error('Only GIF files are allowed'));
    }
  },
});

/**
 * POST /clips/from-gif — Upload a GIF, convert to MP4 via FFmpeg, save to S3 clip library
 * Multipart form: file (GIF), name, description, category, tags (JSON string array)
 */
router.post('/clips/from-gif', isAdmin, gifUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No GIF file uploaded' });
    }

    const { name, description, category, tags } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'category is required' });
    }

    const { uploadBufferToS3, isS3Configured } = await import('../utils/s3Upload');
    if (!isS3Configured()) {
      return res.status(503).json({ error: 'S3 is not configured — cannot upload clips' });
    }

    const { convertGifToMp4 } = await import('../utils/gifToMp4');

    console.log(`[SocialMedia] Converting GIF to MP4: "${name}" (${(req.file.size / 1024 / 1024).toFixed(1)}MB)`);
    const { mp4Buffer, metadata } = await convertGifToMp4(req.file.buffer);

    const timestamp = Date.now();
    const s3Key = `social-media/clip-library/${category}/${timestamp}-${name.replace(/\s+/g, '-').toLowerCase()}.mp4`;
    const s3Url = await uploadBufferToS3(mp4Buffer, s3Key, 'video/mp4');

    let parsedTags: string[] | null = null;
    if (tags) {
      try {
        parsedTags = JSON.parse(tags);
      } catch {
        parsedTags = tags.split(',').map((t: string) => t.trim());
      }
    }

    const [clip] = await db.insert(videoClips).values({
      name,
      description: description || null,
      category,
      s3Key,
      s3Url,
      durationSeconds: metadata.durationSeconds,
      width: metadata.width,
      height: metadata.height,
      fileSize: metadata.fileSize,
      mimeType: 'video/mp4',
      tags: parsedTags,
    }).returning();

    console.log(`[SocialMedia] GIF→MP4 clip saved: "${name}" (${(metadata.fileSize / 1024 / 1024).toFixed(1)}MB, ${metadata.durationSeconds.toFixed(1)}s, ${metadata.width}x${metadata.height}) → ${s3Url}`);
    res.json(clip);
  } catch (error: any) {
    console.error('[SocialMedia] Error converting GIF to clip:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /clips/from-url — Download a GIF from a URL, convert to MP4, save to S3 clip library
 * JSON body: { url, name, category, description?, tags? }
 */
router.post('/clips/from-url', isAdmin, async (req: Request, res: Response) => {
  try {
    const { url, name, description, category, tags } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'category is required' });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are allowed' });
    }

    const { uploadBufferToS3, isS3Configured } = await import('../utils/s3Upload');
    if (!isS3Configured()) {
      return res.status(503).json({ error: 'S3 is not configured — cannot upload clips' });
    }

    // Download the GIF
    console.log(`[SocialMedia] Downloading GIF from URL: ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: globalThis.Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to download GIF: HTTP ${response.status}` });
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      return res.status(413).json({ error: 'GIF too large (max 50MB)' });
    }

    const gifBuffer = Buffer.from(await response.arrayBuffer());

    // Verify GIF magic bytes
    if (gifBuffer.length < 3 || gifBuffer.toString('ascii', 0, 3) !== 'GIF') {
      return res.status(400).json({ error: 'Downloaded file is not a GIF' });
    }

    const { convertGifToMp4 } = await import('../utils/gifToMp4');

    console.log(`[SocialMedia] Converting downloaded GIF to MP4: "${name}" (${(gifBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
    const { mp4Buffer, metadata } = await convertGifToMp4(gifBuffer);

    const timestamp = Date.now();
    const s3Key = `social-media/clip-library/${category}/${timestamp}-${name.replace(/\s+/g, '-').toLowerCase()}.mp4`;
    const s3Url = await uploadBufferToS3(mp4Buffer, s3Key, 'video/mp4');

    let parsedTags: string[] | null = null;
    if (tags) {
      if (Array.isArray(tags)) {
        parsedTags = tags;
      } else if (typeof tags === 'string') {
        try {
          parsedTags = JSON.parse(tags);
        } catch {
          parsedTags = tags.split(',').map((t: string) => t.trim());
        }
      }
    }

    const [clip] = await db.insert(videoClips).values({
      name,
      description: description || null,
      category,
      s3Key,
      s3Url,
      durationSeconds: metadata.durationSeconds,
      width: metadata.width,
      height: metadata.height,
      fileSize: metadata.fileSize,
      mimeType: 'video/mp4',
      tags: parsedTags,
    }).returning();

    console.log(`[SocialMedia] GIF→MP4 clip saved from URL: "${name}" (${(metadata.fileSize / 1024 / 1024).toFixed(1)}MB, ${metadata.durationSeconds.toFixed(1)}s) → ${s3Url}`);
    res.json(clip);
  } catch (error: any) {
    console.error('[SocialMedia] Error converting GIF URL to clip:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /clips/:id — Update clip metadata
 */
router.put('/clips/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid clip ID' });

    const { name, description, category, tags, sortOrder, durationSeconds, width, height } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (durationSeconds !== undefined) updateData.durationSeconds = durationSeconds;
    if (width !== undefined) updateData.width = width;
    if (height !== undefined) updateData.height = height;

    const [updated] = await db.update(videoClips).set(updateData).where(eq(videoClips.id, id)).returning();
    if (!updated) return res.status(404).json({ error: 'Clip not found' });

    res.json(updated);
  } catch (error: any) {
    console.error('[SocialMedia] Error updating clip:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /clips/:id — Delete a clip from the library
 */
router.delete('/clips/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid clip ID' });

    const [clip] = await db.select().from(videoClips).where(eq(videoClips.id, id)).limit(1);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });

    // Note: S3 object not deleted (can be cleaned up manually)
    await db.delete(videoClips).where(eq(videoClips.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('[SocialMedia] Error deleting clip:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Video Render Pipeline ──────────────────────────────────────────────

/**
 * POST /video-briefs/:id/render — Start rendering a video from a brief
 * Body: { aspectRatio?: "9:16" | "16:9", voice?: string }
 * Returns immediately with 202, rendering happens in background
 */
router.post('/video-briefs/:id/render', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid brief ID' });

    const [brief] = await db.select().from(videoBriefs).where(eq(videoBriefs.id, id)).limit(1);
    if (!brief) return res.status(404).json({ error: 'Brief not found' });

    if (brief.renderStatus === 'rendering') {
      return res.status(409).json({ error: 'Brief is already being rendered' });
    }

    const { aspectRatio = '9:16', voice = 'nova' } = req.body;

    // Start rendering in background (don't await)
    const { renderVideoFromBrief } = await import('../services/videoAssemblyService');

    // Fire and forget — responds immediately
    renderVideoFromBrief(id, { aspectRatio, voice }).catch((err) => {
      console.error(`[SocialMedia] Background render failed for brief #${id}:`, err);
    });

    res.status(202).json({
      status: 'rendering',
      briefId: id,
      message: 'Video rendering started. Poll GET /video-briefs/:id/render-status for updates.',
    });
  } catch (error: any) {
    console.error('[SocialMedia] Error starting render:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /video-briefs/:id/render-status — Check render progress
 */
router.get('/video-briefs/:id/render-status', isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid brief ID' });

    const { getBriefRenderStatus } = await import('../services/videoAssemblyService');
    const status = await getBriefRenderStatus(id);
    if (!status) return res.status(404).json({ error: 'Brief not found' });

    res.json(status);
  } catch (error: any) {
    console.error('[SocialMedia] Error checking render status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /tts-voices — List available TTS voices
 */
router.get('/tts-voices', isAdmin, async (_req: Request, res: Response) => {
  try {
    const { VOICE_OPTIONS, isTTSAvailable } = await import('../services/ttsService');
    res.json({ available: isTTSAvailable(), voices: VOICE_OPTIONS });
  } catch (error: any) {
    console.error('[SocialMedia] Error fetching TTS voices:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /pipeline-status — Check which pipeline services are configured
 */
router.get('/pipeline-status', isAdmin, async (_req: Request, res: Response) => {
  try {
    const { isVideoAssemblyAvailable } = await import('../services/videoAssemblyService');
    const { isPexelsConfigured } = await import('../services/pexelsService');
    const { isTTSAvailable } = await import('../services/ttsService');
    const { isS3Configured } = await import('../utils/s3Upload');
    const { isFFmpegAvailable } = await import('../utils/gifToMp4');

    res.json({
      shotstack: isVideoAssemblyAvailable(),
      pexels: isPexelsConfigured(),
      tts: isTTSAvailable(),
      s3: isS3Configured(),
      ffmpeg: isFFmpegAvailable(),
      ready: isVideoAssemblyAvailable() && isS3Configured(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
