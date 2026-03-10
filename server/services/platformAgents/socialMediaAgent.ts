/**
 * Social Media Agent (v2)
 *
 * Runs daily. Generates platform-tailored social media posts using OpenAI.
 * Posts saved as drafts for admin review before publishing.
 *
 * v2 improvements:
 * - Content calendar awareness: skips generation if enough pending drafts exist
 * - Deduplication: checks recent posts to avoid generating similar content
 * - Varied content types: tips, stats, questions, testimonials, industry news
 * - Better prompts with content type variation
 * - Instagram and Facebook posts now included alongside Twitter and LinkedIn
 *
 * agentType: 'platform:social_media'
 * actions: 'draft_generated', 'generation_complete', 'generation_skipped',
 *          'post_published', 'publish_failed'
 */

import { db } from "../../db";
import { businesses, socialMediaPosts } from "../../../shared/schema";
import { eq, sql, and, isNotNull, lte, or, isNull, gte, desc } from "drizzle-orm";
import { logAgentAction } from "../agentActivityService";

const AGENT_TYPE = 'platform:social_media';

type SocialPlatform = 'twitter' | 'facebook' | 'instagram' | 'linkedin';

const PLATFORM_CONSTRAINTS: Record<SocialPlatform, { maxLength: number; style: string }> = {
  twitter: { maxLength: 280, style: 'Concise, punchy. Use 1-2 hashtags. Include a hook.' },
  facebook: { maxLength: 1500, style: 'Conversational and engaging. Can be 2-3 paragraphs. Use emoji sparingly.' },
  instagram: { maxLength: 2200, style: 'Visual storytelling tone. Use 5-10 relevant hashtags at the end. Emoji encouraged.' },
  linkedin: { maxLength: 2000, style: 'Professional thought leadership. Value-driven. End with a question to encourage engagement.' },
};

// Content type rotation for variety
const CONTENT_TYPES = [
  { type: 'tip', instruction: 'Share a practical, actionable tip that a business owner can implement today.' },
  { type: 'stat', instruction: 'Lead with a compelling statistic about missed calls, no-shows, or business phone management.' },
  { type: 'question', instruction: 'Start with an engaging question that resonates with business owners, then provide the answer.' },
  { type: 'story', instruction: 'Tell a brief, relatable story about a common business owner frustration and how AI solves it.' },
  { type: 'myth_buster', instruction: 'Bust a common myth about AI receptionists or business automation. Start with "Myth:" then explain the truth.' },
];

// Maximum pending drafts before we stop generating new ones
const MAX_PENDING_DRAFTS = 20;

interface SocialMediaResult {
  draftsGenerated: number;
  platforms: string[];
  skipped: boolean;
  reason?: string;
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

  return results.filter(r => r.industry && r.industry.trim().length > 0) as { industry: string; count: number }[];
}

/**
 * Count pending drafts (not yet approved or published).
 */
async function getPendingDraftCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialMediaPosts)
    .where(eq(socialMediaPosts.status, 'draft'));
  return result?.count || 0;
}

/**
 * Get recent post industries to avoid generating duplicate content.
 */
async function getRecentIndustriesByPlatform(platform: SocialPlatform, days: number = 7): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const results = await db
    .select({ industry: socialMediaPosts.industry })
    .from(socialMediaPosts)
    .where(
      and(
        eq(socialMediaPosts.platform, platform),
        gte(socialMediaPosts.createdAt, cutoff),
        isNotNull(socialMediaPosts.industry),
      )
    );
  return new Set(results.map(r => r.industry).filter(Boolean) as string[]);
}

/**
 * Pick a content type based on current day to ensure variety.
 */
function pickContentType(): typeof CONTENT_TYPES[number] {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return CONTENT_TYPES[dayOfYear % CONTENT_TYPES.length];
}

/**
 * Generate a social media post using OpenAI.
 */
async function generateWithOpenAI(
  platform: SocialPlatform,
  industry: string,
  contentType: typeof CONTENT_TYPES[number]
): Promise<string> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const constraints = PLATFORM_CONSTRAINTS[platform];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a social media marketer for SmallBizAgent — an AI-powered receptionist and business management platform for small businesses. Write a ${platform} post.

Content approach: ${contentType.instruction}

Constraints:
- Max ${constraints.maxLength} characters
- Style: ${constraints.style}
- Target audience: small business owners in the ${industry} industry
- Highlight how AI receptionists, automated booking, and smart follow-ups help ${industry} businesses
- Be genuine and helpful, not salesy

Respond with ONLY the post text. No quotes, no labels, no explanation.`,
      },
      {
        role: 'user',
        content: `Write a ${platform} post for ${industry} business owners about SmallBizAgent. Content type: ${contentType.type}.`,
      },
    ],
    temperature: 0.85,
  });

  const content = response.choices[0]?.message?.content?.trim() || '';
  return content.substring(0, constraints.maxLength);
}

/**
 * Generate a template-based post when no OpenAI key is available.
 */
function generateTemplatePost(platform: SocialPlatform, industry: string, contentType: typeof CONTENT_TYPES[number]): string {
  const templates: Record<string, Record<string, string[]>> = {
    tip: {
      twitter: [
        `💡 ${industry} tip: Set up auto-reminders for appointments. SmallBizAgent sends them automatically — no-shows drop by 40%. #SmallBiz #${industry.replace(/\s/g, '')}`,
      ],
      facebook: [
        `Quick tip for ${industry} business owners 💡\n\nDid you know that 62% of calls to small businesses go unanswered? That's potential revenue walking away.\n\nOne simple fix: an AI receptionist that answers every call, 24/7. SmallBizAgent handles calls, books appointments, and follows up — while you focus on your craft.\n\nTry it free and see the difference this week!`,
      ],
      instagram: [
        `💡 Pro tip for ${industry} business owners:\n\nStop losing customers to voicemail.\n\n✅ AI answers every call\n✅ Books appointments automatically\n✅ Sends reminders that cut no-shows by 40%\n✅ Works 24/7 (even when you're sleeping)\n\nLink in bio to try free 👆\n\n#SmallBusiness #${industry.replace(/\s/g, '')} #AIReceptionist #BusinessTips #SmallBizAgent`,
      ],
      linkedin: [
        `Here's a tip every ${industry} business owner needs to hear:\n\nYou're losing customers every time you can't answer the phone. Not tomorrow — right now.\n\n85% of callers who can't reach you won't call back. An AI receptionist changes that equation entirely.\n\nSmallBizAgent answers every call, books appointments, and follows up automatically. No contracts, no per-minute fees.\n\nWhat's your biggest challenge with managing incoming calls?`,
      ],
    },
    stat: {
      twitter: [
        `📊 62% of calls to small businesses go unanswered. 85% of those callers never call back. That's money leaving your ${industry} business. SmallBizAgent fixes that. #SmallBiz`,
      ],
      facebook: [
        `📊 The numbers don't lie:\n\n• 62% of calls to small businesses go unanswered\n• 85% of callers who can't reach you never call back\n• The average missed call costs a ${industry} business $100-500\n\nSmallBizAgent's AI receptionist answers every call, 24/7. Your customers get answered. You get more bookings.\n\nThe math is simple.`,
      ],
      instagram: [
        `📊 The real cost of missed calls:\n\n❌ 62% of calls go unanswered\n❌ 85% of callers never call back\n❌ Each missed call = $100-500 lost\n\n✅ AI receptionist answers 24/7\n✅ 40% fewer no-shows\n✅ 3x more after-hours bookings\n\nDon't let your ${industry} business leave money on the table 💰\n\n#SmallBusiness #${industry.replace(/\s/g, '')} #BusinessStats #AIReceptionist #SmallBizAgent`,
      ],
      linkedin: [
        `A sobering stat for ${industry} business owners:\n\n62% of calls to small businesses go unanswered.\n\nOf those callers, 85% never call back.\n\nThat's not just missed calls — it's missed revenue, missed relationships, and missed growth.\n\nThe solution isn't hiring more staff (expensive) or checking voicemail more often (ineffective). It's answering every call, instantly, 24/7.\n\nThat's exactly what SmallBizAgent does.\n\nHow many calls did your business miss this week?`,
      ],
    },
    question: {
      twitter: [
        `How many calls does your ${industry} business miss per week? 🤔 Most small businesses miss 60%+. SmallBizAgent's AI receptionist answers them all. #SmallBiz`,
      ],
      facebook: [
        `Quick question for ${industry} business owners:\n\nWhen you're with a customer, who's answering your phone? 🤔\n\nIf the answer is "nobody" or "voicemail," you might be losing more customers than you realize.\n\nSmallBizAgent's AI receptionist answers every call instantly, books appointments, and texts customers — all automatically.\n\nWhat's the call you regret missing the most? Drop it below 👇`,
      ],
      instagram: [
        `🤔 Quick question:\n\nWho answers your phone when you're busy?\n\nIf it's voicemail... your competitors are getting your customers.\n\nAI receptionist answers 24/7:\n📞 Every call answered instantly\n📅 Appointments booked automatically\n💬 Follow-ups sent on autopilot\n\nYour ${industry} business deserves better.\n\n#SmallBusiness #${industry.replace(/\s/g, '')} #AIReceptionist #NeverMissACall #SmallBizAgent`,
      ],
      linkedin: [
        `I have a question for ${industry} business owners:\n\nIf 10 potential customers called your business today, how many would actually reach a human?\n\nFor most small businesses, the answer is fewer than 4.\n\nThat means 6 out of 10 potential customers are going elsewhere. Not because your service isn't great — but because nobody answered.\n\nAI receptionists like SmallBizAgent solve this by answering every call, booking appointments, and following up automatically.\n\nWhat percentage of your calls do you think go unanswered?`,
      ],
    },
    story: {
      twitter: [
        `A ${industry} owner told us: "I was losing 3-4 customers a week to missed calls. Now AI answers every one." That's the SmallBizAgent difference. 📞✨ #SmallBiz`,
      ],
      facebook: [
        `Every ${industry} business owner has been here:\n\nYou're with a customer. Phone rings. You can't answer. Caller hangs up. You check later — they called a competitor instead.\n\nThat used to happen 3-4 times a week for businesses like yours.\n\nSmallBizAgent's AI receptionist changed the game. Every call answered. Appointments booked automatically. No more "what if" about the ones that got away.\n\nYour next customer could be calling right now. 📞`,
      ],
      instagram: [
        `📞 The story of every ${industry} business owner:\n\n"Phone's ringing... but I'm with a customer"\n"They'll leave a voicemail"\n"...they didn't leave a voicemail"\n"...they called my competitor" 😩\n\nThe fix? AI receptionist answers every call.\n24/7. Instantly. No hold music.\n\nBooks appointments ✅\nSends confirmations ✅\nFollows up ✅\n\n#SmallBusiness #${industry.replace(/\s/g, '')} #AIReceptionist #SmallBizAgent #BusinessGrowth`,
      ],
      linkedin: [
        `A ${industry} business owner recently shared something that resonated:\n\n"I realized I was losing 3-4 potential customers every week — not because my work was bad, but because I couldn't answer the phone while I was working."\n\nThis is incredibly common in ${industry.toLowerCase()} and other service businesses. You're literally too busy delivering great service to capture new business.\n\nThe solution isn't working harder. It's working smarter with an AI receptionist that handles calls while you handle customers.\n\nSmallBizAgent answers every call, books appointments, and follows up — automatically.\n\nHas this ever happened at your business?`,
      ],
    },
    myth_buster: {
      twitter: [
        `Myth: "AI receptionists sound robotic." Reality: Modern AI has natural conversations. Most callers don't even notice. Try SmallBizAgent free 🤖 #SmallBiz`,
      ],
      facebook: [
        `Myth: "AI receptionists sound robotic and turn customers off." 🤖\n\nReality: Modern AI voice technology is incredibly natural. Most callers don't even realize they're talking to AI.\n\nSmallBizAgent's receptionist:\n✅ Has natural conversations (not scripts)\n✅ Answers specific questions about your ${industry} business\n✅ Books appointments in real-time\n✅ Sends follow-up texts automatically\n\nStill skeptical? Try it free and hear for yourself.`,
      ],
      instagram: [
        `🤖 MYTH BUSTED:\n\n"AI receptionists sound robotic"\n\n❌ WRONG.\n\nModern AI has natural conversations.\nMost callers don't even notice.\n\nWhat AI CAN do for your ${industry} business:\n✅ Answer every call 24/7\n✅ Book appointments automatically\n✅ Answer questions about your services\n✅ Send follow-up messages\n\nTry it free and hear for yourself 🎧\n\n#SmallBusiness #${industry.replace(/\s/g, '')} #AI #MythBusted #SmallBizAgent`,
      ],
      linkedin: [
        `Let's bust a myth about AI receptionists:\n\n"They sound robotic and will turn my customers off."\n\nI hear this a lot from ${industry} business owners. And I get it — the stakes are high. A bad phone experience can lose a customer forever.\n\nBut here's the reality: modern AI voice technology is remarkably natural. SmallBizAgent's receptionist has real conversations, answers specific questions about your business, and books appointments in real-time.\n\nMost callers don't even realize they're talking to AI.\n\nThe bigger risk? Not answering at all. 85% of callers who reach voicemail never call back.\n\nWould you rather have a natural-sounding AI answer, or no one answer at all?`,
      ],
    },
  };

  const contentTemplates = templates[contentType.type] || templates.tip;
  const platformTemplates = contentTemplates[platform] || contentTemplates.twitter;
  return platformTemplates[Math.floor(Math.random() * platformTemplates.length)];
}

/**
 * Main entry point: run the Social Media Agent.
 */
export async function runSocialMediaAgent(): Promise<SocialMediaResult> {
  console.log(`[${AGENT_TYPE}] Starting social media agent v2...`);

  // ── Content Calendar Check: don't flood the queue ──
  const pendingDrafts = await getPendingDraftCount();
  if (pendingDrafts >= MAX_PENDING_DRAFTS) {
    console.log(`[${AGENT_TYPE}] ${pendingDrafts} pending drafts already exist (max ${MAX_PENDING_DRAFTS}). Skipping generation.`);
    await logAgentAction({
      businessId: 0,
      agentType: AGENT_TYPE,
      action: 'generation_skipped',
      details: { reason: 'too_many_pending_drafts', pendingDrafts, maxPending: MAX_PENDING_DRAFTS },
    });
    return { draftsGenerated: 0, platforms: [], skipped: true, reason: `${pendingDrafts} pending drafts (max ${MAX_PENDING_DRAFTS})` };
  }

  // Check which platforms are connected
  let connectedPlatforms: SocialPlatform[] = [];
  try {
    const { socialMediaService } = await import('../socialMediaService');
    const connectionStatuses = await socialMediaService.getAllConnectionStatuses();
    connectedPlatforms = Object.entries(connectionStatuses)
      .filter(([_, status]) => (status as any).connected)
      .map(([platform]) => platform as SocialPlatform);
  } catch (err) {
    console.warn(`[${AGENT_TYPE}] Could not check platform connections:`, err);
  }

  // Generate for all platforms, but prioritize connected ones
  const targetPlatforms: SocialPlatform[] = connectedPlatforms.length > 0
    ? connectedPlatforms
    : ['twitter', 'facebook', 'instagram', 'linkedin'];

  console.log(`[${AGENT_TYPE}] Connected: ${connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'none (generating for all)'}`);

  // Get top 3 industries
  const topIndustries = await getTopIndustries(3);

  if (topIndustries.length === 0) {
    console.log(`[${AGENT_TYPE}] No industries found. Skipping.`);
    return { draftsGenerated: 0, platforms: connectedPlatforms, skipped: false };
  }

  const useOpenAI = !!process.env.OPENAI_API_KEY;
  const contentType = pickContentType();
  let draftsGenerated = 0;

  console.log(`[${AGENT_TYPE}] Content type for today: ${contentType.type}`);

  for (const platform of targetPlatforms) {
    // Get recent industries for this platform to avoid duplication
    const recentIndustries = await getRecentIndustriesByPlatform(platform, 3);

    for (const { industry } of topIndustries) {
      // Skip if we already generated for this industry+platform in the last 3 days
      if (recentIndustries.has(industry)) {
        console.log(`[${AGENT_TYPE}] Skipping ${platform}/${industry} — already generated recently.`);
        continue;
      }

      try {
        console.log(`[${AGENT_TYPE}] Generating ${platform} post for ${industry} (type: ${contentType.type})...`);

        let content: string;
        if (useOpenAI) {
          content = await generateWithOpenAI(platform, industry, contentType);
        } else {
          content = generateTemplatePost(platform, industry, contentType);
        }

        // Optionally generate a video for this post
        let mediaUrl: string | null = null;
        let mediaType: string = 'text';
        let thumbnailUrl: string | null = null;
        let videoMeta: Record<string, any> | null = null;

        try {
          const { isVideoGenerationAvailable, generateMarketingVideo } = await import('../videoGenerationService');

          if (isVideoGenerationAvailable()) {
            console.log(`[${AGENT_TYPE}] Generating video for ${platform}/${industry}...`);
            const videoResult = await generateMarketingVideo(platform as any, industry, content);

            if (videoResult.success && videoResult.videoUrl) {
              mediaUrl = videoResult.videoUrl;
              mediaType = 'video';
              thumbnailUrl = videoResult.thumbnailUrl || null;
              videoMeta = {
                renderId: videoResult.renderId,
                duration: videoResult.duration,
                template: videoResult.template,
              };
              console.log(`[${AGENT_TYPE}] Video generated: ${mediaUrl}`);
            } else if (videoResult.error) {
              console.warn(`[${AGENT_TYPE}] Video generation failed (text-only): ${videoResult.error}`);
            }
          }
        } catch (videoErr) {
          console.warn(`[${AGENT_TYPE}] Video generation error (text-only):`, videoErr);
        }

        // Insert draft
        const [inserted] = await db
          .insert(socialMediaPosts)
          .values({
            platform,
            content,
            mediaUrl,
            mediaType,
            thumbnailUrl,
            status: 'draft',
            agentType: AGENT_TYPE,
            industry,
            details: {
              generatedVia: useOpenAI ? 'openai' : 'template',
              model: useOpenAI ? 'gpt-4o-mini' : null,
              contentType: contentType.type,
              ...(videoMeta ? { video: videoMeta } : {}),
            },
          })
          .returning();

        await logAgentAction({
          businessId: 0,
          agentType: AGENT_TYPE,
          action: 'draft_generated',
          details: {
            postId: inserted.id,
            platform,
            industry,
            mediaType,
            contentType: contentType.type,
            contentPreview: content.substring(0, 100),
            generatedVia: useOpenAI ? 'openai' : 'template',
            hasVideo: mediaType === 'video',
          },
        });

        draftsGenerated++;

        // Rate limit
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`[${AGENT_TYPE}] Error generating ${platform} post for "${industry}":`, err);
      }
    }
  }

  // Log completion
  await logAgentAction({
    businessId: 0,
    agentType: AGENT_TYPE,
    action: 'generation_complete',
    details: {
      draftsGenerated,
      platforms: targetPlatforms,
      connectedPlatforms,
      industries: topIndustries.map(i => i.industry),
      usedOpenAI: useOpenAI,
      contentType: contentType.type,
    },
  });

  console.log(`[${AGENT_TYPE}] Complete. Generated ${draftsGenerated} drafts.`);
  return { draftsGenerated, platforms: targetPlatforms, skipped: false };
}

/**
 * Publish all approved posts that are due (scheduledFor <= now or no schedule).
 */
export async function publishApprovedPosts(): Promise<{ published: number; failed: number }> {
  console.log(`[${AGENT_TYPE}] Checking for approved posts to publish...`);

  const { socialMediaService } = await import('../socialMediaService');

  const now = new Date();

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
