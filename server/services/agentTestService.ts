/**
 * Agent Test Service
 *
 * Allows business owners to send a test SMS for any agent type to their own phone.
 * Test conversations are flagged with context.isTest = true so they:
 *   - Don't create real appointments (booking creation is intercepted)
 *   - Don't appear in analytics/dashboard counts
 *   - Expire after 1 hour
 */

import { storage } from '../storage';
import { sendSms } from './twilioService';
import { getAgentConfig, fillTemplate } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';

interface TestResult {
  message: string;
  conversationId?: number;
  aiDraft?: string;
}

export async function sendAgentTest(
  businessId: number,
  agentType: string,
  phone: string,
): Promise<TestResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) throw new Error('Business not found');

  const config = await getAgentConfig(businessId, agentType);

  const mockVars: Record<string, string> = {
    customerName: 'Test Customer',
    businessName: business.name,
    businessPhone: business.phone || '',
    bookingLink: business.bookingSlug
      ? `https://smallbizagent.ai/book/${business.bookingSlug}`
      : '',
  };

  switch (agentType) {
    case 'follow_up':
      return sendFollowUpTest(businessId, config, mockVars, phone);
    case 'no_show':
      return sendNoShowTest(businessId, config, mockVars, phone);
    case 'estimate_follow_up':
      return sendEstimateTest(businessId, config, mockVars, phone);
    case 'rebooking':
      return sendRebookingTest(businessId, config, mockVars, phone);
    case 'review_response':
      return sendReviewResponseTest(businessId, business, config);
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}

// ── Follow-Up (one-way, no conversation) ──

async function sendFollowUpTest(
  businessId: number,
  config: any,
  vars: Record<string, string>,
  phone: string,
): Promise<TestResult> {
  const template = config.thankYouTemplate || config.upsellTemplate;
  const message = fillTemplate(template, vars);

  await sendSms(phone, message);
  await logAgentAction({
    businessId,
    agentType: 'follow_up',
    action: 'sms_sent',
    details: { isTest: true, message, phone },
  });

  return { message };
}

// ── No-Show (creates test conversation for reply testing) ──

async function sendNoShowTest(
  businessId: number,
  config: any,
  vars: Record<string, string>,
  phone: string,
): Promise<TestResult> {
  vars.appointmentTime = '2:00 PM';
  const message = fillTemplate(config.messageTemplate, vars);

  await sendSms(phone, message);

  const conversation = await storage.createSmsConversation({
    businessId,
    customerPhone: phone,
    agentType: 'no_show',
    referenceType: 'test',
    state: 'awaiting_reply',
    context: { isTest: true, expectedReplies: ['YES', 'NO'] },
    lastMessageSentAt: new Date(),
    expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
  });

  await logAgentAction({
    businessId,
    agentType: 'no_show',
    action: 'sms_sent',
    details: { isTest: true, message, phone },
  });

  return { message, conversationId: conversation.id };
}

// ── Estimate Follow-Up (one-way, no conversation) ──

async function sendEstimateTest(
  businessId: number,
  config: any,
  vars: Record<string, string>,
  phone: string,
): Promise<TestResult> {
  vars.quoteTotal = '$150.00';
  vars.validUntil = 'next week';
  const templates = config.messageTemplates || [];
  const template = templates[0] || 'Hi {customerName}, checking in on your estimate from {businessName}.';
  const message = fillTemplate(template, vars);

  await sendSms(phone, message);
  await logAgentAction({
    businessId,
    agentType: 'estimate_follow_up',
    action: 'sms_sent',
    details: { isTest: true, message, phone },
  });

  return { message };
}

// ── Rebooking (creates test conversation for reply testing) ──

async function sendRebookingTest(
  businessId: number,
  config: any,
  vars: Record<string, string>,
  phone: string,
): Promise<TestResult> {
  vars.daysSinceVisit = '30';
  vars.serviceName = 'General Service';
  const message = fillTemplate(config.messageTemplate, vars);

  await sendSms(phone, message);

  const conversation = await storage.createSmsConversation({
    businessId,
    customerPhone: phone,
    agentType: 'rebooking',
    referenceType: 'test',
    state: 'awaiting_reply',
    context: { isTest: true, expectedReplies: ['YES', 'NO'] },
    lastMessageSentAt: new Date(),
    expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
  });

  await logAgentAction({
    businessId,
    agentType: 'rebooking',
    action: 'sms_sent',
    details: { isTest: true, message, phone },
  });

  return { message, conversationId: conversation.id };
}

// ── Review Response (AI draft only, no SMS) ──

async function sendReviewResponseTest(
  businessId: number,
  business: any,
  config: any,
): Promise<TestResult> {
  const mockReview = {
    reviewerName: 'Alex Johnson',
    rating: 4,
    comment: 'Great service overall! The team was friendly and professional. Only minor issue was the wait time, but otherwise a solid experience.',
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      message: 'Review response test requires OPENAI_API_KEY to be configured.',
      aiDraft: 'Unable to generate — no OpenAI API key configured.',
    };
  }

  const toneGuide: Record<string, string> = {
    professional: 'Respond in a professional, courteous tone.',
    friendly: 'Respond in a warm, friendly, and approachable tone.',
    casual: 'Respond in a relaxed, casual tone while remaining respectful.',
  };

  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey });

  const systemPrompt = `You are a business owner responding to a customer review on Google.
Business name: ${business.name}
Industry: ${business.industry || 'general services'}

Guidelines:
- ${toneGuide[config.tone] || toneGuide.professional}
- Maximum ${config.maxResponseLength || 200} words.
${config.includeBusinessName ? '- Mention the business name naturally.' : ''}
${config.thankForPositive && mockReview.rating >= 4 ? '- Thank the reviewer for their positive feedback.' : ''}
- Be specific to their review — do NOT be generic.
- Do NOT use emojis unless the review itself is very casual.
- Return ONLY the response text, no quotes, no preamble.`;

  const userPrompt = `Review from ${mockReview.reviewerName} (${mockReview.rating} stars):
"${mockReview.comment}"

Write a response:`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const aiDraft = response.choices[0]?.message?.content?.trim() || 'Unable to generate response.';

    await logAgentAction({
      businessId,
      agentType: 'review_response',
      action: 'review_drafted',
      details: { isTest: true, mockReview, aiDraft },
    });

    return {
      message: `Test review: "${mockReview.comment}" (${mockReview.rating} stars by ${mockReview.reviewerName})`,
      aiDraft,
    };
  } catch (err) {
    console.error('[AgentTest] Review response OpenAI error:', err);
    return {
      message: 'Failed to generate AI review response.',
      aiDraft: 'Error generating response. Check OpenAI API key and try again.',
    };
  }
}
