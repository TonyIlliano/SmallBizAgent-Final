/**
 * Social Media Agent
 *
 * Runs daily. Generates platform-tailored social media posts using OpenAI.
 * Posts saved as drafts for admin review before publishing.
 *
 * agentType: 'platform:social_media'
 * actions: 'draft_generated', 'generation_complete', 'post_published', 'publish_failed'
 */

import { db } from "../../db";
import { businesses, socialMediaPosts } from "../../../shared/schema";
import { eq, sql, and, isNotNull, lte, or, isNull } from "drizzle-orm";
import { logAgentAction } from "../agentActivityService";

const AGENT_TYPE = 'platform:social_media';

type SocialPlatform = 'twitter' | 'facebook' | 'instagram' | 'linkedin';

const PLATFORM_CONSTRAINTS: Record<SocialPlatform, { maxLength: number; style: string }> = {
  twitter: { maxLength: 280, style: 'Concise, punchy. Use 1-2 hashtags. Include a hook.' },
  facebook: { maxLength: 1500, style: 'Conversational and engaging. Can be 2-3 paragraphs. Use emoji sparingly.' },
  instagram: { maxLength: 2200, style: 'Visual storytelling tone. Use 5-10 relevant hashtags at the end. Emoji encouraged.' },
  linkedin: { maxLength: 2000, style: 'Professional thought leadership. Value-driven. End with a question to encourage engagement.' },
};

interface SocialMediaResult {
  draftsGenerated: number;
  platforms: string[];
}

/**
 * Query businesses grouped by industry and return the top 3 most common.
 */
async function getTopIndustries(limit: number = 3): Promise<{ industry: string; count: number }[]> {
  const results = await db
    .select({
      industry: businesses.industry,
      count: sql<number>`count(*)::int`,
    })
    .from(businesses)
    .where(
      and(
        isNotNull(businesses.industry),
        eq(businesses.isActive, true),
      )
    )
    .groupBy(businesses.industry)
    .orderBy(sql`count(*) DESC`)
    .limit(limit);

  // Filter out null/empty industries that might slip through
  return results.filter(r => r.industry && r.industry.trim().length > 0) as { industry: string; count: number }[];
}

/**
 * Generate a social media post using OpenAI.
 */
async function generateWithOpenAI(platform: SocialPlatform, industry: string): Promise<string> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const constraints = PLATFORM_CONSTRAINTS[platform];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a social media marketer for SmallBizAgent — an AI-powered receptionist and business management platform for small businesses. Write a ${platform} post.\n\nConstraints:\n- Max ${constraints.maxLength} characters\n- Style: ${constraints.style}\n- Target audience: small business owners in the ${industry} industry\n- Highlight how AI receptionists, automated booking, and smart follow-ups help ${industry} businesses\n\nRespond with ONLY the post text. No quotes, no labels, no explanation.`,
      },
      {
        role: 'user',
        content: `Write a ${platform} post for ${industry} business owners about SmallBizAgent.`,
      },
    ],
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content?.trim() || '';
  // Enforce character limit
  return content.substring(0, constraints.maxLength);
}

/**
 * Generate a template-based post when no OpenAI key is available.
 */
function generateTemplatePost(platform: SocialPlatform, industry: string): string {
  const templates: Record<string, string[]> = {
    twitter: [
      `\u{1F916} ${industry} businesses: Stop missing calls. SmallBizAgent's AI receptionist answers 24/7, books appointments, and follows up automatically. #SmallBiz #AI`,
      `Every missed call is missed revenue. ${industry} owners \u2014 let AI handle your phones while you focus on what you do best. #SmallBizAgent`,
    ],
    facebook: [
      `Running a ${industry} business means you can't always answer the phone. But what if you never had to?\n\nSmallBizAgent's AI receptionist handles calls, books appointments, and sends follow-ups \u2014 all on autopilot.\n\nJoin hundreds of small businesses already saving 10+ hours a week. Try it free!`,
    ],
    instagram: [
      `Your ${industry} business deserves an AI assistant that never sleeps \u{1F4AA}\n\n\u2705 AI receptionist answers every call\n\u2705 Automatic appointment booking\n\u2705 Smart follow-up messages\n\u2705 No-show prevention\n\nStop losing customers to missed calls. Link in bio \u{1F446}\n\n#SmallBusiness #${industry.replace(/\s/g, '')} #AIReceptionist #SmallBizAgent #BusinessAutomation`,
    ],
    linkedin: [
      `The #1 reason small ${industry} businesses lose customers? Missed phone calls.\n\nMost small business owners are too busy delivering great service to answer every call. The result? Lost revenue, frustrated customers, and missed opportunities.\n\nThat's why we built SmallBizAgent \u2014 an AI-powered receptionist that answers calls, books appointments, and follows up with customers automatically.\n\nFor ${industry} businesses, this means:\n\u2022 Never missing another potential customer\n\u2022 Automated appointment scheduling\n\u2022 Smart follow-ups that reduce no-shows by 40%\n\nWhat's the biggest operational challenge in your ${industry} business?`,
    ],
  };
  const platformTemplates = templates[platform] || templates.twitter;
  return platformTemplates[Math.floor(Math.random() * platformTemplates.length)];
}

/**
 * Main entry point: run the Social Media Agent.
 */
export async function runSocialMediaAgent(): Promise<SocialMediaResult> {
  console.log(`[${AGENT_TYPE}] Starting social media agent...`);

  // Dynamically import the social media service
  const { socialMediaService } = await import('../socialMediaService');

  // Find which platforms are connected
  const connectionStatuses = await socialMediaService.getAllConnectionStatuses();
  const connectedPlatforms = Object.entries(connectionStatuses)
    .filter(([_, status]) => (status as any).connected)
    .map(([platform]) => platform as SocialPlatform);

  if (connectedPlatforms.length === 0) {
    console.log(`[${AGENT_TYPE}] No social media platforms connected. Skipping.`);
    return { draftsGenerated: 0, platforms: [] };
  }

  console.log(`[${AGENT_TYPE}] Connected platforms: ${connectedPlatforms.join(', ')}`);

  // Get top 3 industries from active businesses
  const topIndustries = await getTopIndustries(3);

  if (topIndustries.length === 0) {
    console.log(`[${AGENT_TYPE}] No industries found. Skipping content generation.`);
    return { draftsGenerated: 0, platforms: connectedPlatforms };
  }

  const useOpenAI = !!process.env.OPENAI_API_KEY;
  let draftsGenerated = 0;

  for (const platform of connectedPlatforms) {
    for (const { industry } of topIndustries) {
      try {
        console.log(`[${AGENT_TYPE}] Generating ${platform} post for ${industry}...`);

        let content: string;

        if (useOpenAI) {
          content = await generateWithOpenAI(platform, industry);
        } else {
          content = generateTemplatePost(platform, industry);
        }

        // Insert the draft into the socialMediaPosts table
        const [inserted] = await db
          .insert(socialMediaPosts)
          .values({
            platform,
            content,
            status: 'draft',
            agentType: AGENT_TYPE,
            industry,
            details: {
              generatedVia: useOpenAI ? 'openai' : 'template',
              model: useOpenAI ? 'gpt-4o-mini' : null,
            },
          })
          .returning();

        // Log the draft generation
        await logAgentAction({
          businessId: 0,
          agentType: AGENT_TYPE,
          action: 'draft_generated',
          details: {
            postId: inserted.id,
            platform,
            industry,
            contentPreview: content.substring(0, 100),
            generatedVia: useOpenAI ? 'openai' : 'template',
          },
        });

        draftsGenerated++;

        // Small delay between generations to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`[${AGENT_TYPE}] Error generating ${platform} post for "${industry}":`, err);
      }
    }
  }

  // Log completion summary
  await logAgentAction({
    businessId: 0,
    agentType: AGENT_TYPE,
    action: 'generation_complete',
    details: {
      draftsGenerated,
      platforms: connectedPlatforms,
      industries: topIndustries.map(i => i.industry),
      usedOpenAI: useOpenAI,
    },
  });

  console.log(`[${AGENT_TYPE}] Complete. Generated ${draftsGenerated} drafts across ${connectedPlatforms.length} platforms.`);
  return { draftsGenerated, platforms: connectedPlatforms };
}

/**
 * Publish all approved posts that are due (scheduledFor <= now or no schedule).
 * Called by the publisher scheduler.
 */
export async function publishApprovedPosts(): Promise<{ published: number; failed: number }> {
  console.log(`[${AGENT_TYPE}] Checking for approved posts to publish...`);

  const { socialMediaService } = await import('../socialMediaService');

  const now = new Date();

  // Find posts where status='approved' and (scheduledFor <= now or scheduledFor is null)
  const approvedPosts = await db
    .select()
    .from(socialMediaPosts)
    .where(
      and(
        eq(socialMediaPosts.status, 'approved'),
        or(
          lte(socialMediaPosts.scheduledFor, now),
          isNull(socialMediaPosts.scheduledFor),
        ),
      )
    );

  let published = 0;
  let failed = 0;

  for (const post of approvedPosts) {
    try {
      await socialMediaService.publishPost(post.id);

      await logAgentAction({
        businessId: 0,
        agentType: AGENT_TYPE,
        action: 'post_published',
        details: {
          postId: post.id,
          platform: post.platform,
          industry: post.industry,
        },
      });

      published++;
      console.log(`[${AGENT_TYPE}] Published post ${post.id} to ${post.platform}`);
    } catch (err) {
      failed++;
      console.error(`[${AGENT_TYPE}] Failed to publish post ${post.id}:`, err);

      await logAgentAction({
        businessId: 0,
        agentType: AGENT_TYPE,
        action: 'publish_failed',
        details: {
          postId: post.id,
          platform: post.platform,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  console.log(`[${AGENT_TYPE}] Publishing complete. Published: ${published}, Failed: ${failed}`);
  return { published, failed };
}

export default { runSocialMediaAgent, publishApprovedPosts };
