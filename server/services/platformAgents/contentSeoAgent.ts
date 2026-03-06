/**
 * Content & SEO Agent
 *
 * Runs every 7 days. Uses OpenAI to generate blog post ideas and social media content
 * targeted at specific industries using SmallBizAgent.
 *
 * Logic:
 * 1. Query all businesses to find the most common industries/types
 * 2. For each top industry (top 5), generate:
 *    - A blog post title + outline targeting "[industry] + AI receptionist"
 *    - A social media post draft
 * 3. Store drafts in agent_activity_log for admin review
 *
 * agentType: 'platform:content_seo'
 * action: 'content_drafted'
 * details: { industry, contentType: 'blog'|'social', title, outline/body, targetKeywords }
 */

import { db } from "../../db";
import { eq, sql, gte, and, desc, isNotNull } from "drizzle-orm";
import { businesses, users, callLogs, appointments, customers, subscriptionPlans } from "../../../shared/schema";
import { logAgentAction } from "../agentActivityService";

const AGENT_TYPE = 'platform:content_seo';

interface ContentDraft {
  industry: string;
  contentType: 'blog' | 'social';
  title: string;
  outline?: string[];
  body?: string;
  targetKeywords: string[];
}

interface ContentSeoResult {
  draftsGenerated: number;
  industries: string[];
}

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

  // Filter out null/empty industries that might slip through
  return results.filter(r => r.industry && r.industry.trim().length > 0) as { industry: string; count: number }[];
}

/**
 * Generate content using OpenAI when the API key is available.
 */
async function generateWithOpenAI(industry: string): Promise<{ blog: ContentDraft; social: ContentDraft }> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Generate blog post idea
  const blogResponse = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a content strategist for SmallBizAgent, an AI receptionist platform for small businesses. Generate SEO-optimized blog content ideas. Respond in JSON format with fields: title (string), outline (array of 5 strings), targetKeywords (array of 3 strings).',
      },
      {
        role: 'user',
        content: `Generate a blog post idea targeting the ${industry} industry. The blog should highlight how an AI receptionist helps ${industry} businesses handle calls, book appointments, and never miss a customer. Focus on SEO keywords combining "${industry}" with "AI receptionist", "virtual receptionist", and "automated phone answering".`,
      },
    ],
    temperature: 0.8,
  });

  let blogData: { title: string; outline: string[]; targetKeywords: string[] };
  try {
    const blogContent = blogResponse.choices[0]?.message?.content || '';
    // Strip markdown code fences if present
    const cleanedBlog = blogContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    blogData = JSON.parse(cleanedBlog);
  } catch {
    blogData = {
      title: `How AI Receptionists Are Transforming the ${industry} Industry`,
      outline: [
        `The current challenges ${industry} businesses face with phone management`,
        'What an AI receptionist does and how it works',
        `Specific use cases for ${industry} businesses`,
        'ROI and time savings from automated call handling',
        'How to get started with SmallBizAgent for your business',
      ],
      targetKeywords: [`${industry} AI receptionist`, `${industry} virtual receptionist`, `${industry} phone automation`],
    };
  }

  // Generate social media post
  const socialResponse = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a social media marketer for SmallBizAgent, an AI receptionist platform. Write a short, engaging social media post under 280 characters. Respond with just the post text, no JSON.',
      },
      {
        role: 'user',
        content: `Write a social media post highlighting how SmallBizAgent helps ${industry} businesses never miss a call. Include a call to action. Keep it under 280 characters.`,
      },
    ],
    temperature: 0.8,
  });

  const socialBody = socialResponse.choices[0]?.message?.content?.trim() ||
    `Running a ${industry} business? Stop missing calls. SmallBizAgent's AI receptionist answers 24/7, books appointments, and keeps your customers happy. Try it free!`;

  const blog: ContentDraft = {
    industry,
    contentType: 'blog',
    title: blogData.title,
    outline: blogData.outline,
    targetKeywords: blogData.targetKeywords,
  };

  const social: ContentDraft = {
    industry,
    contentType: 'social',
    title: `Social Post: ${industry} AI Receptionist`,
    body: socialBody.substring(0, 280),
    targetKeywords: [`${industry} AI receptionist`],
  };

  return { blog, social };
}

/**
 * Generate template-based content when no OpenAI key is available.
 */
function generateTemplateContent(industry: string): { blog: ContentDraft; social: ContentDraft } {
  const formattedIndustry = industry.charAt(0).toUpperCase() + industry.slice(1).toLowerCase();

  const blog: ContentDraft = {
    industry,
    contentType: 'blog',
    title: `How ${formattedIndustry} Businesses Are Saving Hours Every Week with AI Receptionists`,
    outline: [
      `Why ${formattedIndustry.toLowerCase()} businesses lose revenue from missed calls and slow response times`,
      `How an AI receptionist works: 24/7 call answering, appointment booking, and customer intake`,
      `Real-world scenarios: a day in the life of a ${formattedIndustry.toLowerCase()} business using SmallBizAgent`,
      `The ROI of automated phone handling: reducing no-shows, capturing more leads, and freeing up staff`,
      `Getting started: setting up SmallBizAgent for your ${formattedIndustry.toLowerCase()} business in under 10 minutes`,
    ],
    targetKeywords: [
      `${formattedIndustry.toLowerCase()} AI receptionist`,
      `${formattedIndustry.toLowerCase()} virtual receptionist`,
      `automated phone answering ${formattedIndustry.toLowerCase()}`,
    ],
  };

  const social: ContentDraft = {
    industry,
    contentType: 'social',
    title: `Social Post: ${formattedIndustry} AI Receptionist`,
    body: `${formattedIndustry} pros: still answering every call yourself? SmallBizAgent's AI receptionist handles calls 24/7, books appointments & never puts a customer on hold. Try it free!`,
    targetKeywords: [`${formattedIndustry.toLowerCase()} AI receptionist`],
  };

  return { blog, social };
}

/**
 * Main entry point: run the Content & SEO Agent.
 */
export async function runContentSeoAgent(): Promise<ContentSeoResult> {
  console.log(`[${AGENT_TYPE}] Starting content & SEO agent...`);

  const topIndustries = await getTopIndustries(5);

  if (topIndustries.length === 0) {
    console.log(`[${AGENT_TYPE}] No industries found. Skipping content generation.`);
    return { draftsGenerated: 0, industries: [] };
  }

  const useOpenAI = !!process.env.OPENAI_API_KEY;
  let draftsGenerated = 0;
  const industriesProcessed: string[] = [];

  for (const { industry, count } of topIndustries) {
    try {
      console.log(`[${AGENT_TYPE}] Generating content for industry: ${industry} (${count} businesses)`);

      let blog: ContentDraft;
      let social: ContentDraft;

      if (useOpenAI) {
        const content = await generateWithOpenAI(industry);
        blog = content.blog;
        social = content.social;
      } else {
        const content = generateTemplateContent(industry);
        blog = content.blog;
        social = content.social;
      }

      // Log the blog draft
      await logAgentAction({
        businessId: 0,
        agentType: AGENT_TYPE,
        action: 'content_drafted',
        details: {
          industry: blog.industry,
          contentType: blog.contentType,
          title: blog.title,
          outline: blog.outline,
          targetKeywords: blog.targetKeywords,
          businessCount: count,
          generatedVia: useOpenAI ? 'openai' : 'template',
        },
      });
      draftsGenerated++;

      // Log the social media draft
      await logAgentAction({
        businessId: 0,
        agentType: AGENT_TYPE,
        action: 'content_drafted',
        details: {
          industry: social.industry,
          contentType: social.contentType,
          title: social.title,
          body: social.body,
          targetKeywords: social.targetKeywords,
          businessCount: count,
          generatedVia: useOpenAI ? 'openai' : 'template',
        },
      });
      draftsGenerated++;

      industriesProcessed.push(industry);

      // Small delay between industries to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[${AGENT_TYPE}] Error generating content for industry "${industry}":`, err);
    }
  }

  console.log(`[${AGENT_TYPE}] Complete. Generated ${draftsGenerated} drafts for ${industriesProcessed.length} industries.`);
  return { draftsGenerated, industries: industriesProcessed };
}

export default { runContentSeoAgent };
