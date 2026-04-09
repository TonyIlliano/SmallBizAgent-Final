/**
 * Managed Agents — One-Time Setup Script
 *
 * Creates 1 environment + 3 agents on Anthropic's Managed Agents API.
 * Run with: npx tsx server/services/managedAgents/setupAgents.ts
 *
 * After running, save the printed IDs as environment variables:
 *   MANAGED_AGENT_ENV_ID, SOCIAL_MEDIA_AGENT_ID, SUPPORT_AGENT_ID, SMS_INTELLIGENCE_AGENT_ID
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaManagedAgentsCustomToolParams } from '@anthropic-ai/sdk/resources/beta/agents/agents';

const client = new Anthropic();

// ─── System Prompts ──────────────────────────────────────────────────────────

const SOCIAL_MEDIA_SYSTEM = `You are the Social Media & Marketing AI for SmallBizAgent, a SaaS platform for small service businesses. Your job is to autonomously manage the content pipeline.

When given a task, use the provided tools to:
1. Analyze what content has performed well (winner posts, engagement scores)
2. Check current platform stats for authentic data points
3. Generate content for the specified platforms
4. Create video ad briefs when requested
5. Queue blog posts with SEO optimization

Rules:
- Always use real platform stats, never make up numbers
- Match the tone/style of winner posts when available
- Respect platform character limits (Twitter 280, Instagram 2200, LinkedIn 2000, Facebook 1500)
- Rotate content types: tip, stat, question, story, myth_buster
- Include hashtags for Instagram, skip for LinkedIn
- Generate 5 posts per platform per batch unless specified otherwise
- For video briefs: include hook, voiceover script, screen sequence, CTA, boost targeting`;

const SUPPORT_SYSTEM = `You are the in-app support assistant for SmallBizAgent. You help small business owners set up and use the platform.

You have access to tools that let you look up account details, check setup status, make configuration changes, and search the knowledge base.

Rules:
- Be concise and helpful. Business owners are busy.
- If you can fix something directly (set hours, add service), do it.
- If you can't fix it, explain clearly what the user needs to do.
- Never expose internal system details, API keys, or other users' data.
- For billing issues, direct to Settings > Subscription.
- For phone/voice issues, check provisioning status first.
- Always confirm before making changes to their business settings.
- Pricing: Starter $149/mo, Growth $299/mo, Pro $449/mo. 14-day free trial.`;

const SMS_INTELLIGENCE_SYSTEM = `You are the SMS Intelligence agent for SmallBizAgent. You handle inbound customer SMS replies that require AI reasoning.

When a customer texts a reply, you:
1. Load their context (who they are, what appointments they have, conversation history)
2. Classify the intent (confirm, cancel, reschedule, question, complaint, campaign reply)
3. Take the appropriate action using available tools
4. Compose and send a response SMS

CRITICAL SMS COMPLIANCE RULES:
- NEVER send SMS to customers without smsOptIn = true
- ALWAYS check suppression list before sending
- ALWAYS check engagement lock before sending
- Marketing SMS MUST check marketingOptIn (not just smsOptIn)
- All marketing SMS MUST include "Reply STOP to unsubscribe"
- STOP keyword = opt out of marketing only, NOT transactional
- All SMS goes through sendSms tool (handles suppression/sanitization)

For RESCHEDULE:
- Parse natural date/time ("Thursday at 3pm")
- Check slot availability before confirming
- If requested slot is taken, offer 2-3 alternatives
- Update the appointment record directly

For multi-appointment disambiguation:
- If customer has 2+ upcoming appointments, list them numbered
- Ask which one they mean before taking action`;

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const socialMediaTools: BetaManagedAgentsCustomToolParams[] = [
  {
    type: 'custom',
    name: 'getPlatformStats',
    description: 'Get live platform metrics (total businesses, calls, bookings, revenue). Use for authentic data in content.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'custom',
    name: 'getWinnerPosts',
    description: 'Get top-performing social posts by engagement score. Use as style/tone reference for new content.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Optional: filter by platform (twitter, facebook, instagram, linkedin)' },
        limit: { type: 'number', description: 'Max number of winners to return. Default 10.' },
      },
    },
  },
  {
    type: 'custom',
    name: 'getEngagementMetrics',
    description: 'Get engagement data for recent published posts with metrics (likes, comments, shares, reach, score).',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Optional: filter by platform' },
        days: { type: 'number', description: 'Look back N days. Default 30.' },
      },
    },
  },
  {
    type: 'custom',
    name: 'createSocialPost',
    description: 'Create a draft social media post for a platform. Posts are saved as drafts for admin approval.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Platform: twitter, facebook, instagram, or linkedin' },
        content: { type: 'string', description: 'The post content text' },
        industry: { type: 'string', description: 'Target industry (e.g., barbershop, hvac, dental)' },
        contentType: { type: 'string', description: 'Content type: tip, stat, question, story, myth_buster' },
      },
      required: ['platform', 'content'],
    },
  },
  {
    type: 'custom',
    name: 'createBlogPost',
    description: 'Create a blog article. Saved as draft for review.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Blog post title' },
        body: { type: 'string', description: 'Full blog post body in markdown' },
        industry: { type: 'string', description: 'Target industry' },
        targetKeywords: { type: 'string', description: 'Comma-separated SEO keywords' },
      },
      required: ['title', 'body'],
    },
  },
  {
    type: 'custom',
    name: 'createVideoBrief',
    description: 'Create a structured video ad brief with hook, voiceover script, screen sequence, CTA, and targeting.',
    input_schema: {
      type: 'object',
      properties: {
        vertical: { type: 'string', description: 'Target vertical/industry' },
        platform: { type: 'string', description: 'Target platform (instagram, tiktok, youtube, facebook)' },
        pillar: { type: 'string', description: 'Content pillar: pain_amplification, feature_in_context, social_proof, education, behind_the_build' },
        briefData: {
          type: 'object',
          description: 'Structured brief with: hook, voiceover, screenSequence, bRoll, cta, caption, hashtags, boostTargeting, stockSearchTerms',
        },
      },
      required: ['vertical', 'platform', 'briefData'],
    },
  },
  {
    type: 'custom',
    name: 'getIndustryList',
    description: 'Get the list of supported industries/verticals for content targeting.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'custom',
    name: 'getRecentContent',
    description: 'Get recent posts from the last 7 days to avoid content duplication.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Filter by platform' },
        days: { type: 'number', description: 'Look back N days. Default 7.' },
      },
    },
  },
];

const supportTools: BetaManagedAgentsCustomToolParams[] = [
  {
    type: 'custom',
    name: 'lookupBusiness',
    description: 'Get business profile, plan, subscription status, and key settings.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
      },
      required: ['businessId'],
    },
  },
  {
    type: 'custom',
    name: 'checkSetupStatus',
    description: 'Check what is configured vs missing. Shows completion percentage, services count, staff count, phone status.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
      },
      required: ['businessId'],
    },
  },
  {
    type: 'custom',
    name: 'checkProvisioningStatus',
    description: 'Check if the phone number and AI receptionist are provisioned and active.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
      },
      required: ['businessId'],
    },
  },
  {
    type: 'custom',
    name: 'getSubscriptionInfo',
    description: 'Get subscription plan details, trial dates, and usage info.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
      },
      required: ['businessId'],
    },
  },
  {
    type: 'custom',
    name: 'setBusinessHours',
    description: 'Set business open/close hours for one or more days of the week.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              day: { type: 'string', description: 'Day of week (monday, tuesday, etc.)' },
              open: { type: 'string', description: 'Opening time in HH:MM 24h format' },
              close: { type: 'string', description: 'Closing time in HH:MM 24h format' },
              isClosed: { type: 'boolean', description: 'True if closed this day' },
            },
            required: ['day'],
          },
        },
      },
      required: ['businessId', 'days'],
    },
  },
  {
    type: 'custom',
    name: 'addService',
    description: 'Add a new service to the business with name, price, and duration.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        name: { type: 'string', description: 'Service name' },
        price: { type: 'number', description: 'Price in dollars' },
        duration: { type: 'number', description: 'Duration in minutes. Default 60.' },
        description: { type: 'string', description: 'Optional service description' },
      },
      required: ['businessId', 'name', 'price'],
    },
  },
  {
    type: 'custom',
    name: 'addStaffMember',
    description: 'Add a new staff member/team member to the business.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email (optional)' },
        phone: { type: 'string', description: 'Phone (optional)' },
        specialty: { type: 'string', description: 'Role/specialty' },
      },
      required: ['businessId', 'firstName'],
    },
  },
  {
    type: 'custom',
    name: 'addKnowledgeEntry',
    description: 'Add a Q&A entry to the AI receptionist knowledge base.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        question: { type: 'string', description: 'The question a caller might ask' },
        answer: { type: 'string', description: 'The answer the AI should give' },
        category: { type: 'string', description: 'Category: faq, pricing, services, policies, hours' },
      },
      required: ['businessId', 'question', 'answer'],
    },
  },
  {
    type: 'custom',
    name: 'toggleSetting',
    description: 'Enable or disable a business setting like call recording, SMS reminders, or AI receptionist.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        setting: {
          type: 'string',
          description: 'Setting name: receptionistEnabled, callRecordingEnabled, appointmentConfirmationSms, appointmentReminderSms, jobCompletedSms, autoInvoiceOnJobCompletion',
        },
        enabled: { type: 'boolean', description: 'True to enable, false to disable' },
      },
      required: ['businessId', 'setting', 'enabled'],
    },
  },
  {
    type: 'custom',
    name: 'getBookingLink',
    description: 'Get the public booking page URL for this business.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
      },
      required: ['businessId'],
    },
  },
  {
    type: 'custom',
    name: 'searchKnowledge',
    description: 'Search the knowledge base for help articles or FAQ entries matching a keyword.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        query: { type: 'string', description: 'Search keyword or phrase' },
      },
      required: ['businessId', 'query'],
    },
  },
];

const smsIntelligenceTools: BetaManagedAgentsCustomToolParams[] = [
  {
    type: 'custom',
    name: 'loadCustomerContext',
    description: 'Load full customer context: profile, upcoming appointments, conversation history, and insights.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        customerPhone: { type: 'string', description: 'Customer phone number' },
        customerId: { type: 'number', description: 'Customer ID if known' },
      },
      required: ['businessId', 'customerPhone'],
    },
  },
  {
    type: 'custom',
    name: 'checkEngagementLock',
    description: 'Check if another agent is currently messaging this customer.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        customerId: { type: 'number', description: 'Customer ID' },
      },
      required: ['businessId', 'customerId'],
    },
  },
  {
    type: 'custom',
    name: 'acquireEngagementLock',
    description: 'Lock this customer so no other agent messages them during this conversation.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        customerId: { type: 'number', description: 'Customer ID' },
        customerPhone: { type: 'string', description: 'Customer phone' },
        durationMinutes: { type: 'number', description: 'Lock duration in minutes. Default 15.' },
      },
      required: ['businessId', 'customerId', 'customerPhone'],
    },
  },
  {
    type: 'custom',
    name: 'releaseEngagementLock',
    description: 'Release the engagement lock on this customer after conversation is resolved.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        customerId: { type: 'number', description: 'Customer ID' },
      },
      required: ['businessId', 'customerId'],
    },
  },
  {
    type: 'custom',
    name: 'checkAvailability',
    description: 'Check appointment slot availability for a specific date.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        duration: { type: 'number', description: 'Service duration in minutes. Default 60.' },
        staffId: { type: 'number', description: 'Optional staff member ID' },
      },
      required: ['businessId', 'date'],
    },
  },
  {
    type: 'custom',
    name: 'rescheduleAppointment',
    description: 'Move an appointment to a new date and time. Validates availability first.',
    input_schema: {
      type: 'object',
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID to reschedule' },
        newDate: { type: 'string', description: 'New date in YYYY-MM-DD format' },
        newTime: { type: 'string', description: 'New time in HH:MM 24h format' },
      },
      required: ['appointmentId', 'newDate', 'newTime'],
    },
  },
  {
    type: 'custom',
    name: 'cancelAppointment',
    description: 'Cancel an appointment. Sets status to cancelled.',
    input_schema: {
      type: 'object',
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID to cancel' },
      },
      required: ['appointmentId'],
    },
  },
  {
    type: 'custom',
    name: 'confirmAppointment',
    description: 'Confirm an appointment. Sets status to confirmed.',
    input_schema: {
      type: 'object',
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID to confirm' },
      },
      required: ['appointmentId'],
    },
  },
  {
    type: 'custom',
    name: 'sendSms',
    description: 'Send an SMS to a customer via Twilio. Handles suppression list, sanitization, and business-specific from-number automatically.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID (for from-number resolution)' },
        to: { type: 'string', description: 'Customer phone number' },
        body: { type: 'string', description: 'SMS message body' },
      },
      required: ['businessId', 'to', 'body'],
    },
  },
  {
    type: 'custom',
    name: 'checkSmsCompliance',
    description: 'Check if a customer has smsOptIn, marketingOptIn, and is not on suppression list.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        customerId: { type: 'number', description: 'Customer ID' },
      },
      required: ['businessId', 'customerId'],
    },
  },
  {
    type: 'custom',
    name: 'resolveConversation',
    description: 'Mark an SMS conversation as resolved.',
    input_schema: {
      type: 'object',
      properties: {
        conversationId: { type: 'number', description: 'SMS conversation ID' },
      },
      required: ['conversationId'],
    },
  },
  {
    type: 'custom',
    name: 'createSmsConversation',
    description: 'Start tracking a multi-turn SMS conversation.',
    input_schema: {
      type: 'object',
      properties: {
        businessId: { type: 'number', description: 'Business ID' },
        customerId: { type: 'number', description: 'Customer ID' },
        customerPhone: { type: 'string', description: 'Customer phone' },
        agentType: { type: 'string', description: 'Agent type (e.g., reschedule, support)' },
        state: { type: 'string', description: 'Initial state' },
        context: { type: 'object', description: 'Conversation context data' },
      },
      required: ['businessId', 'customerPhone', 'agentType', 'state'],
    },
  },
];

// ─── Main Setup ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== SmallBizAgent Managed Agents Setup ===\n');

  // 1. Create environment
  console.log('Creating environment...');
  const environment = await client.beta.environments.create({
    name: 'smallbizagent-prod',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
  });
  console.log(`Environment created: ${environment.id}\n`);

  // 2. Create Social Media Brain agent
  console.log('Creating Social Media Brain agent...');
  const socialMediaAgent = await client.beta.agents.create({
    name: 'SmallBizAgent Social Media Brain',
    model: 'claude-sonnet-4-6',
    description: 'Autonomous social media content generation, blog writing, and video brief creation for SmallBizAgent.',
    system: SOCIAL_MEDIA_SYSTEM,
    tools: socialMediaTools,
  });
  console.log(`Social Media Agent created: ${socialMediaAgent.id}\n`);

  // 3. Create Support Assistant agent
  console.log('Creating Support Assistant agent...');
  const supportAgent = await client.beta.agents.create({
    name: 'SmallBizAgent Support Assistant',
    model: 'claude-sonnet-4-6',
    description: 'In-app support assistant that helps business owners set up and use SmallBizAgent.',
    system: SUPPORT_SYSTEM,
    tools: supportTools,
  });
  console.log(`Support Agent created: ${supportAgent.id}\n`);

  // 4. Create SMS Intelligence agent
  console.log('Creating SMS Intelligence agent...');
  const smsAgent = await client.beta.agents.create({
    name: 'SmallBizAgent SMS Intelligence',
    model: 'claude-sonnet-4-6',
    description: 'SMS reply intelligence agent handling freeform text classification, rescheduling, and multi-turn conversations.',
    system: SMS_INTELLIGENCE_SYSTEM,
    tools: smsIntelligenceTools,
  });
  console.log(`SMS Intelligence Agent created: ${smsAgent.id}\n`);

  // 5. Print summary
  console.log('=== Setup Complete ===');
  console.log('');
  console.log('Add these to your .env / Railway environment variables:');
  console.log('');
  console.log(`MANAGED_AGENT_ENV_ID=${environment.id}`);
  console.log(`SOCIAL_MEDIA_AGENT_ID=${socialMediaAgent.id}`);
  console.log(`SUPPORT_AGENT_ID=${supportAgent.id}`);
  console.log(`SMS_INTELLIGENCE_AGENT_ID=${smsAgent.id}`);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
