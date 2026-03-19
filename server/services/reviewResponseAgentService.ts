/**
 * Review Response Agent Service
 *
 * Periodically fetches Google Business Profile reviews, generates AI-drafted
 * responses using OpenAI, and stores them for owner approval before posting.
 *
 * All responses require manual owner approval — nothing is auto-posted.
 */

import OpenAI from 'openai';
import { storage } from '../storage';
import { isAgentEnabled, getAgentConfig } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';
import { GoogleBusinessProfileService } from './googleBusinessProfileService';
import type { GBPReview } from './googleBusinessProfileService';

const gbpService = new GoogleBusinessProfileService();

// ── Main scheduler entry ────────────────────────────────────

export async function runReviewResponseCheck(): Promise<void> {
  console.log('[ReviewResponseAgent] Running review response check...');

  try {
    const businesses = await storage.getAllBusinesses();

    for (const business of businesses) {
      try {
        const enabled = await isAgentEnabled(business.id, 'review_response');
        if (!enabled) continue;

        const connected = await gbpService.isConnected(business.id);
        if (!connected) {
          console.log(`[ReviewResponseAgent] Business ${business.id}: GBP not connected, skipping`);
          continue;
        }

        await processBusinessReviews(business.id);
        await new Promise(r => setTimeout(r, 2000)); // Rate limiting between businesses
      } catch (err) {
        console.error(`[ReviewResponseAgent] Error processing business ${business.id}:`, err);
      }
    }

    console.log('[ReviewResponseAgent] Review response check complete.');
  } catch (err) {
    console.error('[ReviewResponseAgent] Error in main loop:', err);
  }
}

// ── Per-business processing (also called by manual fetch route) ──

export async function processBusinessReviews(businessId: number): Promise<number> {
  const config = await getAgentConfig(businessId, 'review_response');
  const business = await storage.getBusiness(businessId);
  if (!business) return 0;

  // Fetch reviews from Google
  let reviews: GBPReview[];
  try {
    reviews = await gbpService.listReviews(businessId);
  } catch (err) {
    console.error(`[ReviewResponseAgent] Failed to fetch reviews for business ${businessId}:`, err);
    return 0;
  }

  if (!reviews.length) return 0;

  // Get existing review_responses to find which reviews are already processed
  const existingResponses = await storage.getReviewResponses(businessId);
  const processedReviewIds = new Set(existingResponses.map(r => r.reviewId));

  // Filter to new, unreplied reviews
  const newReviews = reviews.filter(r => !r.hasReply && !processedReviewIds.has(r.reviewId));

  if (!newReviews.length) {
    console.log(`[ReviewResponseAgent] Business ${businessId}: no new reviews to process`);
    return 0;
  }

  console.log(`[ReviewResponseAgent] Business ${businessId}: ${newReviews.length} new reviews found`);
  let processed = 0;

  for (const review of newReviews) {
    try {
      // Generate AI draft
      const draftResponse = await generateReviewResponse(business, review, config);
      if (!draftResponse) continue;

      // All reviews go to "pending" — owner must approve before posting
      await storage.createReviewResponse({
        businessId,
        reviewSource: 'google',
        reviewId: review.reviewId,
        reviewerName: review.reviewerName,
        reviewRating: review.rating,
        reviewText: review.comment,
        aiDraftResponse: draftResponse,
        finalResponse: null,
        status: 'pending',
        postedAt: null,
      });

      await logAgentAction({
        businessId,
        agentType: 'review_response',
        action: 'draft_generated',
        details: {
          reviewId: review.reviewId,
          reviewerName: review.reviewerName,
          rating: review.rating,
        },
      });

      processed++;
      // Rate limit between OpenAI calls
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[ReviewResponseAgent] Error processing review ${review.reviewId}:`, err);
    }
  }

  return processed;
}

// ── AI Response Generation ──────────────────────────────────

async function generateReviewResponse(
  business: any,
  review: { reviewerName: string; rating: number | null; comment: string },
  config: any,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('[ReviewResponseAgent] No OPENAI_API_KEY set — skipping AI draft');
    return null;
  }

  const toneGuide: Record<string, string> = {
    professional: 'Respond in a professional, courteous tone.',
    friendly: 'Respond in a warm, friendly, and approachable tone.',
    casual: 'Respond in a relaxed, casual tone while remaining respectful.',
  };

  const rating = review.rating ?? 0;

  const systemPrompt = `You are a business owner responding to a customer review on Google.
Business name: ${business.name}
Industry: ${business.industry || 'general services'}

Guidelines:
- ${toneGuide[config.tone] || toneGuide.professional}
- Maximum ${config.maxResponseLength || 200} words.
${config.includeBusinessName ? '- Mention the business name naturally.' : ''}
${config.thankForPositive && rating >= 4 ? '- Thank the reviewer for their positive feedback.' : ''}
${config.apologizeForNegative && rating <= 2 ? '- Acknowledge the issue and apologize sincerely. Offer to make it right.' : ''}
- Be specific to their review — do NOT be generic.
- Do NOT use emojis unless the review itself is very casual.
- Return ONLY the response text, no quotes, no preamble.`;

  const userPrompt = `Review from ${review.reviewerName} (${review.rating ?? '?'} stars):
"${review.comment}"

Write a response:`;

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      temperature: 0.7,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[ReviewResponseAgent] OpenAI error:', err);
    return null;
  }
}

// ── Post a response to Google (called after owner approval) ──

export async function postReviewResponse(reviewResponseId: number): Promise<void> {
  const reviewResp = await storage.getReviewResponseById(reviewResponseId);
  if (!reviewResp) throw new Error('Review response not found');

  const responseText = reviewResp.finalResponse || reviewResp.aiDraftResponse;
  if (!responseText) throw new Error('No response text to post');

  // The reviewId stores the full GBP resource name (accounts/X/locations/Y/reviews/Z)
  await gbpService.replyToReview(reviewResp.businessId, reviewResp.reviewId, responseText);

  await storage.updateReviewResponse(reviewResponseId, {
    status: 'posted',
    finalResponse: responseText,
    postedAt: new Date(),
  });

  await logAgentAction({
    businessId: reviewResp.businessId,
    agentType: 'review_response',
    action: 'review_posted',
    details: {
      reviewId: reviewResp.reviewId,
      reviewerName: reviewResp.reviewerName,
    },
  });

  console.log(`[ReviewResponseAgent] Posted response for review ${reviewResp.reviewId}`);
}
