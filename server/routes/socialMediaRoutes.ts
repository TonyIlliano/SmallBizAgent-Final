/**
 * Social Media Routes
 *
 * OAuth flows for connecting social platforms + post CRUD for admin review workflow.
 * All routes except OAuth callbacks require admin auth.
 */

import { Router, Request, Response } from "express";
import { isAdmin } from "../middleware/auth";
import { db } from "../db";
import { socialMediaPosts } from "../../shared/schema";
import { eq, desc, sql } from "drizzle-orm";

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
 * GET /:platform/auth-url — Generate OAuth URL for a platform
 */
router.get('/:platform/auth-url', isAdmin, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;

    if (!isValidPlatform(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }

    const { socialMediaService } = await import("../services/socialMediaService");
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const url = await socialMediaService.getAuthUrl(platform, baseUrl);
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
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await socialMediaService.handleCallback(platform, code, state, baseUrl);

    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

    res.send(`<html><body><p>\u2713 ${platformName} Connected!</p><script>
if(window.opener){window.opener.postMessage({type:'social-connected',platform:'${platform}'},'*');}
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

export default router;
