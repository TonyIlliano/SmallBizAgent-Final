/**
 * Managed Agents — Social Media Brain Tool Handlers
 *
 * All tool handlers for the Social Media & Marketing agent.
 * Uses the existing storage layer and drizzle ORM — never raw SQL.
 */
import { db } from '../../db';
import { socialMediaPosts, blogPosts, videoBriefs } from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

// ─── Tool Handlers ───────────────────────────────────────────────────────────

async function getPlatformStats(_input: any): Promise<any> {
  // Dynamic import to avoid circular dependencies
  const { getPlatformStats: getStats } = await import('../adminService');
  const stats = await getStats();
  return {
    totalBusinesses: stats.totalBusinesses || 0,
    totalUsers: stats.totalUsers || 0,
    totalCalls: stats.totalCalls || 0,
    callsThisMonth: stats.callsThisMonth || 0,
    activeSubscriptions: stats.activeSubscriptions || 0,
    activePhoneNumbers: stats.activePhoneNumbers || 0,
  };
}

async function getWinnerPosts(input: any): Promise<any> {
  const { platform, limit: maxResults } = input;
  const conditions: any[] = [eq(socialMediaPosts.isWinner, true)];
  if (platform) {
    conditions.push(eq(socialMediaPosts.platform, platform));
  }

  const winners = await db.select()
    .from(socialMediaPosts)
    .where(and(...conditions))
    .orderBy(desc(socialMediaPosts.engagementScore))
    .limit(maxResults || 10);

  return winners.map(p => ({
    id: p.id,
    platform: p.platform,
    content: p.content,
    industry: p.industry,
    engagementScore: p.engagementScore,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    saves: p.saves,
    reach: p.reach,
  }));
}

async function getEngagementMetrics(input: any): Promise<any> {
  const { platform, days } = input;
  const lookbackDays = days || 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const conditions: any[] = [
    eq(socialMediaPosts.status, 'published'),
    gte(socialMediaPosts.createdAt, cutoff),
  ];
  if (platform) {
    conditions.push(eq(socialMediaPosts.platform, platform));
  }

  const posts = await db.select()
    .from(socialMediaPosts)
    .where(and(...conditions))
    .orderBy(desc(socialMediaPosts.engagementScore))
    .limit(50);

  return {
    postCount: posts.length,
    posts: posts.map(p => ({
      id: p.id,
      platform: p.platform,
      content: p.content?.substring(0, 100) + (p.content && p.content.length > 100 ? '...' : ''),
      industry: p.industry,
      engagementScore: p.engagementScore,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      reach: p.reach,
      isWinner: p.isWinner,
    })),
  };
}

async function createSocialPost(input: any): Promise<any> {
  const { platform, content, industry, contentType } = input;
  const [post] = await db.insert(socialMediaPosts).values({
    platform,
    content,
    industry: industry || null,
    status: 'draft',
    mediaType: 'text',
    details: contentType ? { contentType, generatedVia: 'managed_agent' } : { generatedVia: 'managed_agent' },
  }).returning();

  return {
    success: true,
    postId: post.id,
    message: `Draft ${platform} post created (ID: ${post.id}). Awaiting admin approval.`,
  };
}

async function createBlogPost(input: any): Promise<any> {
  const { title, body, industry, targetKeywords } = input;
  // Generate slug from title
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const [post] = await db.insert(blogPosts).values({
    title,
    slug,
    body,
    industry: industry || null,
    targetKeywords: targetKeywords || null,
    status: 'draft',
    generatedVia: 'managed_agent',
  }).returning();

  return {
    success: true,
    postId: post.id,
    message: `Blog post "${title}" created as draft (ID: ${post.id}).`,
  };
}

async function createVideoBrief(input: any): Promise<any> {
  const { vertical, platform, pillar, briefData } = input;

  const [brief] = await db.insert(videoBriefs).values({
    vertical,
    platform,
    pillar: pillar || null,
    briefData: briefData || {},
  }).returning();

  return {
    success: true,
    briefId: brief.id,
    message: `Video brief created for ${vertical}/${platform} (ID: ${brief.id}).`,
  };
}

async function getIndustryList(_input: any): Promise<any> {
  return {
    industries: [
      'barbershop', 'salon', 'spa', 'hvac', 'plumbing', 'electrical',
      'landscaping', 'cleaning', 'construction', 'painting', 'pest_control',
      'roofing', 'automotive', 'dental', 'medical', 'veterinary',
      'fitness', 'restaurant', 'retail', 'professional_services',
    ],
  };
}

async function getRecentContent(input: any): Promise<any> {
  const { platform, days } = input;
  const lookbackDays = days || 7;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const conditions: any[] = [gte(socialMediaPosts.createdAt, cutoff)];
  if (platform) {
    conditions.push(eq(socialMediaPosts.platform, platform));
  }

  const posts = await db.select()
    .from(socialMediaPosts)
    .where(and(...conditions))
    .orderBy(desc(socialMediaPosts.createdAt))
    .limit(30);

  return {
    count: posts.length,
    posts: posts.map(p => ({
      id: p.id,
      platform: p.platform,
      content: p.content?.substring(0, 150),
      industry: p.industry,
      status: p.status,
      createdAt: p.createdAt,
    })),
  };
}

// ─── Exported Handler Map ─────────────────────────────────────────────────────

export const socialMediaToolHandlers: Record<string, (input: any) => Promise<any>> = {
  getPlatformStats,
  getWinnerPosts,
  getEngagementMetrics,
  createSocialPost,
  createBlogPost,
  createVideoBrief,
  getIndustryList,
  getRecentContent,
};
