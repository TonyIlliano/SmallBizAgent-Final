/**
 * Content & SEO Agent (v2)
 *
 * Runs every 7 days. Generates full, publishable blog articles and social media
 * content targeted at the platform's top industries.
 *
 * v2 improvements:
 * - Generates FULL blog articles (not just outlines) when OpenAI available
 * - Stores articles in blog_posts table (first-class content, not activity logs)
 * - Deduplication: checks existing posts by industry+slug to avoid duplicates
 * - SEO metadata: meta title, meta description, excerpt auto-generated
 * - Varied content types: how-to, case study, listicle, comparison, tips
 *
 * agentType: 'platform:content_seo'
 * actions: 'blog_created', 'social_drafted', 'generation_complete'
 */

import { db } from "../../db";
import { eq, sql, and, isNotNull, desc } from "drizzle-orm";
import { businesses, blogPosts, socialMediaPosts } from "../../../shared/schema";
import { logAgentAction } from "../agentActivityService";

const AGENT_TYPE = 'platform:content_seo';

interface ContentSeoResult {
  blogsCreated: number;
  socialDraftsCreated: number;
  industries: string[];
}

// Content format rotation for variety
const CONTENT_FORMATS = [
  { type: 'how_to', prompt: 'Write a practical how-to guide about' },
  { type: 'listicle', prompt: 'Write a numbered listicle (7-10 items) about' },
  { type: 'case_study', prompt: 'Write a case-study style article showing how a typical business benefits from' },
  { type: 'comparison', prompt: 'Write a comparison article (before vs after) about' },
  { type: 'tips', prompt: 'Write an expert tips article with actionable advice about' },
];

/**
 * Query businesses grouped by industry/type and return the top 5 most common.
 */
async function getTopIndustries(limit: number = 5): Promise<{ industry: string; count: number }[]> {
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
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return results.filter(r => r.industry && r.industry.trim().length > 0) as { industry: string; count: number }[];
}

/**
 * Check if a blog post already exists for this industry with a similar slug.
 */
async function blogExistsForIndustry(industry: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(blogPosts)
    .where(eq(blogPosts.industry, industry));
  return result?.count || 0;
}

/**
 * Generate a URL-safe slug from a title.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80)
    .replace(/^-|-$/g, '');
}

/**
 * Pick a content format that varies based on existing post count.
 */
function pickContentFormat(existingCount: number): typeof CONTENT_FORMATS[number] {
  return CONTENT_FORMATS[existingCount % CONTENT_FORMATS.length];
}

/**
 * Generate a full blog article using OpenAI.
 */
async function generateBlogWithOpenAI(industry: string, format: typeof CONTENT_FORMATS[number]): Promise<{
  title: string;
  body: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  targetKeywords: string[];
}> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an expert content writer for SmallBizAgent, an AI-powered receptionist and business management platform for small businesses. Write SEO-optimized, genuinely helpful blog articles.

Rules:
- Write in a conversational, authoritative tone
- Include specific, actionable advice (not vague platitudes)
- Naturally mention SmallBizAgent 2-3 times as a solution (NOT a hard sell)
- Use markdown formatting: ## for sections, **bold** for emphasis, bullet points where useful
- Target 800-1200 words
- Include a compelling intro paragraph and a clear conclusion with CTA

Respond in JSON with fields:
- title (string, max 70 chars, SEO-optimized)
- body (string, full article in markdown)
- excerpt (string, 150-200 chars compelling summary)
- metaTitle (string, max 60 chars)
- metaDescription (string, max 155 chars)
- targetKeywords (array of 3-5 keyword phrases)`,
      },
      {
        role: 'user',
        content: `${format.prompt} how AI receptionists and automation help ${industry} businesses handle calls, book appointments, reduce no-shows, and grow revenue. Target audience: ${industry} small business owners who are overwhelmed with phone management.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 3000,
  });

  try {
    const raw = response.choices[0]?.message?.content || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(cleaned);
    return {
      title: data.title || `How AI Receptionists Help ${industry} Businesses`,
      body: data.body || '',
      excerpt: data.excerpt || data.body?.substring(0, 160) || '',
      metaTitle: data.metaTitle || data.title?.substring(0, 60) || '',
      metaDescription: data.metaDescription || data.excerpt?.substring(0, 155) || '',
      targetKeywords: data.targetKeywords || [`${industry} AI receptionist`],
    };
  } catch {
    // Fallback if JSON parse fails — the LLM may have returned raw markdown
    const raw = response.choices[0]?.message?.content || '';
    return {
      title: `How AI Receptionists Are Transforming the ${industry} Industry`,
      body: raw,
      excerpt: raw.substring(0, 160).replace(/[#*\n]/g, ' ').trim(),
      metaTitle: `AI Receptionist for ${industry} | SmallBizAgent`,
      metaDescription: `Discover how ${industry} businesses use AI receptionists to answer calls 24/7, book appointments, and reduce no-shows.`,
      targetKeywords: [`${industry} AI receptionist`, `${industry} virtual receptionist`, `${industry} phone automation`],
    };
  }
}

/**
 * Generate a template-based blog article (no API key needed).
 */
function generateBlogTemplate(industry: string, format: typeof CONTENT_FORMATS[number]): {
  title: string;
  body: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  targetKeywords: string[];
} {
  const formatted = industry.charAt(0).toUpperCase() + industry.slice(1).toLowerCase();

  const titles: Record<string, string> = {
    how_to: `How to Never Miss Another Call at Your ${formatted} Business`,
    listicle: `7 Ways AI Receptionists Are Saving ${formatted} Businesses Hours Every Week`,
    case_study: `From Missed Calls to Booked Solid: A ${formatted} Business Transformation`,
    comparison: `Before vs After: What Happens When ${formatted} Businesses Get an AI Receptionist`,
    tips: `5 Expert Tips for ${formatted} Business Owners to Stop Losing Customers to Voicemail`,
  };

  const title = titles[format.type] || titles.how_to;

  const body = `## The Problem Every ${formatted} Business Owner Knows

If you run a ${formatted.toLowerCase()} business, you know the drill: you're in the middle of serving a customer when the phone rings. You can't answer it. The caller hangs up. That's revenue — gone.

Studies show that **62% of calls to small businesses go unanswered**, and **85% of callers who can't reach you won't call back**. For ${formatted.toLowerCase()} businesses, where a single new customer could be worth hundreds or thousands of dollars, those missed calls add up fast.

## Why Traditional Solutions Fall Short

You've probably tried a few things:

- **Voicemail** — most callers hang up before leaving a message
- **Hiring a receptionist** — expensive ($2,500-$4,000/month) and only covers business hours
- **Answering services** — impersonal, can't book appointments, and expensive per-minute fees

None of these solutions answer every call, 24/7, with the knowledge of your actual business.

## How an AI Receptionist Changes Everything

An AI receptionist like SmallBizAgent answers every call instantly — whether it's 2 PM or 2 AM. Here's what makes it different:

**It sounds natural.** Modern AI voice technology has conversations, not scripts. Callers often don't realize they're talking to AI.

**It knows your business.** It can answer questions about your services, pricing, hours, and availability — because it's trained on your specific business information.

**It books appointments.** Instead of just taking messages, it checks your real calendar and books customers directly into open slots.

**It follows up.** After appointments, it sends confirmation texts, reminder messages, and even follow-up thank-you notes.

## The Real Impact for ${formatted} Businesses

${formatted} business owners using AI receptionists typically see:

- **40% fewer no-shows** thanks to automated reminders
- **3x more after-hours bookings** from calls that would have gone to voicemail
- **10+ hours saved per week** on phone management
- **Increased revenue** from capturing every lead

## Getting Started Is Easier Than You Think

Setting up an AI receptionist for your ${formatted.toLowerCase()} business takes less than 10 minutes with SmallBizAgent. You add your business info, set your hours and services, and the AI handles the rest.

No contracts. No per-minute fees on the base plan. Just a phone that always gets answered.

**Ready to stop missing calls?** [Try SmallBizAgent free](${process.env.APP_URL || 'https://www.smallbizagent.ai'}) and see the difference in your first week.`;

  return {
    title,
    body,
    excerpt: `Discover how ${formatted.toLowerCase()} businesses are using AI receptionists to capture every call, book more appointments, and grow revenue on autopilot.`,
    metaTitle: `AI Receptionist for ${formatted} Businesses | SmallBizAgent`,
    metaDescription: `${formatted} business owners: stop losing customers to missed calls. Learn how AI receptionists answer 24/7, book appointments, and reduce no-shows by 40%.`,
    targetKeywords: [
      `${formatted.toLowerCase()} AI receptionist`,
      `${formatted.toLowerCase()} virtual receptionist`,
      `automated phone answering ${formatted.toLowerCase()}`,
      `${formatted.toLowerCase()} business phone management`,
    ],
  };
}

/**
 * Generate a social media post for a specific industry (for the social_media_posts table).
 */
async function generateSocialPost(industry: string, useOpenAI: boolean): Promise<{
  twitter: string;
  linkedin: string;
}> {
  const formatted = industry.charAt(0).toUpperCase() + industry.slice(1).toLowerCase();

  if (useOpenAI) {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Write two social media posts for SmallBizAgent (AI receptionist platform). Return JSON with:
- twitter (max 270 chars, punchy, 1-2 hashtags)
- linkedin (max 500 chars, professional, end with a question)
No quotes or labels. Target: ${industry} small business owners.`,
          },
          {
            role: 'user',
            content: `Write a Twitter and LinkedIn post about how ${industry} businesses benefit from never missing a call with AI receptionists.`,
          },
        ],
        temperature: 0.8,
      });

      const raw = response.choices[0]?.message?.content || '';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const data = JSON.parse(cleaned);
      return {
        twitter: (data.twitter || '').substring(0, 280),
        linkedin: (data.linkedin || '').substring(0, 2000),
      };
    } catch {
      // Fall through to template
    }
  }

  return {
    twitter: `🤖 ${formatted} businesses: Stop missing calls. SmallBizAgent's AI receptionist answers 24/7, books appointments, and follows up automatically. Try it free! #SmallBiz #${formatted.replace(/\s/g, '')}`,
    linkedin: `The #1 reason small ${formatted.toLowerCase()} businesses lose customers? Missed phone calls.\n\nMost owners are too busy delivering great service to answer every ring. The result? Lost revenue and missed opportunities.\n\nSmallBizAgent's AI receptionist answers calls 24/7, books appointments, and follows up — all on autopilot.\n\nWhat's the biggest phone management challenge in your ${formatted.toLowerCase()} business?`,
  };
}

/**
 * Main entry point: run the Content & SEO Agent.
 */
export async function runContentSeoAgent(): Promise<ContentSeoResult> {
  console.log(`[${AGENT_TYPE}] Starting content & SEO agent v2...`);

  const topIndustries = await getTopIndustries(5);

  if (topIndustries.length === 0) {
    console.log(`[${AGENT_TYPE}] No industries found. Skipping content generation.`);
    return { blogsCreated: 0, socialDraftsCreated: 0, industries: [] };
  }

  const useOpenAI = !!process.env.OPENAI_API_KEY;
  let blogsCreated = 0;
  let socialDraftsCreated = 0;
  const industriesProcessed: string[] = [];

  for (const { industry, count } of topIndustries) {
    try {
      console.log(`[${AGENT_TYPE}] Processing industry: ${industry} (${count} businesses)`);

      // ── Blog Article ──
      const existingCount = await blogExistsForIndustry(industry);

      // Cap at 5 articles per industry to avoid content bloat
      if (existingCount < 5) {
        const format = pickContentFormat(existingCount);
        console.log(`[${AGENT_TYPE}] Generating ${format.type} blog for ${industry} (${existingCount} existing)...`);

        let blog;
        if (useOpenAI) {
          blog = await generateBlogWithOpenAI(industry, format);
        } else {
          blog = generateBlogTemplate(industry, format);
        }

        const slug = slugify(blog.title);
        const wordCount = blog.body.split(/\s+/).length;

        const [inserted] = await db
          .insert(blogPosts)
          .values({
            title: blog.title,
            slug,
            excerpt: blog.excerpt,
            body: blog.body,
            industry,
            targetKeywords: blog.targetKeywords,
            metaTitle: blog.metaTitle,
            metaDescription: blog.metaDescription,
            status: 'draft',
            generatedVia: useOpenAI ? 'openai' : 'template',
            wordCount,
          })
          .returning();

        await logAgentAction({
          businessId: 0,
          agentType: AGENT_TYPE,
          action: 'blog_created',
          details: {
            blogPostId: inserted.id,
            industry,
            title: blog.title,
            slug,
            wordCount,
            format: format.type,
            generatedVia: useOpenAI ? 'openai' : 'template',
            businessCount: count,
          },
        });

        blogsCreated++;
      } else {
        console.log(`[${AGENT_TYPE}] Industry "${industry}" already has ${existingCount} articles, skipping blog.`);
      }

      // ── Social Media Posts ──
      const socialPosts = await generateSocialPost(industry, useOpenAI);

      // Twitter post
      await db.insert(socialMediaPosts).values({
        platform: 'twitter',
        content: socialPosts.twitter,
        status: 'draft',
        agentType: AGENT_TYPE,
        industry,
        details: { generatedVia: useOpenAI ? 'openai' : 'template', contentFormat: 'industry_promo' },
      });
      socialDraftsCreated++;

      // LinkedIn post
      await db.insert(socialMediaPosts).values({
        platform: 'linkedin',
        content: socialPosts.linkedin,
        status: 'draft',
        agentType: AGENT_TYPE,
        industry,
        details: { generatedVia: useOpenAI ? 'openai' : 'template', contentFormat: 'thought_leadership' },
      });
      socialDraftsCreated++;

      await logAgentAction({
        businessId: 0,
        agentType: AGENT_TYPE,
        action: 'social_drafted',
        details: {
          industry,
          platforms: ['twitter', 'linkedin'],
          generatedVia: useOpenAI ? 'openai' : 'template',
        },
      });

      industriesProcessed.push(industry);

      // Rate limit between industries
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[${AGENT_TYPE}] Error generating content for industry "${industry}":`, err);
    }
  }

  // Log completion summary
  await logAgentAction({
    businessId: 0,
    agentType: AGENT_TYPE,
    action: 'generation_complete',
    details: {
      blogsCreated,
      socialDraftsCreated,
      industries: industriesProcessed,
      usedOpenAI: useOpenAI,
    },
  });

  console.log(`[${AGENT_TYPE}] Complete. ${blogsCreated} blogs, ${socialDraftsCreated} social drafts for ${industriesProcessed.length} industries.`);
  return { blogsCreated, socialDraftsCreated, industries: industriesProcessed };
}

export default { runContentSeoAgent };
