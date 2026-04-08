/**
 * Support Chat Service V2 — action-executing AI assistant.
 * Can answer questions AND take actions: set hours, add services, create staff, etc.
 * Uses OpenAI function calling to decide when to act vs when to just respond.
 */
import OpenAI from 'openai';
import { storage } from '../storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Page Context Map ────────────────────────────────────────────────────

const PAGE_CONTEXT: Record<string, string> = {
  '/dashboard': 'Main dashboard. Shows business stats (calls, appointments, revenue), setup checklist with completion %, AI ROI card showing call-to-booking conversion.',
  '/receptionist': 'AI Receptionist configuration. Set custom greeting, choose voice, manage Knowledge Base Q&A, toggle call recording, view call logs with transcripts.',
  '/customers': 'Customer CRM. View all customers auto-created from calls and bookings. Search, filter, export CSV.',
  '/appointments': 'Appointment calendar. Week/day/month views. Drag-and-drop to reschedule. Staff filter pills.',
  '/jobs': 'Job schedule (field service businesses). Calendar and list view toggle. Job cards show status.',
  '/invoices': 'Invoice management. Create, send, and track invoices. Payment links via Stripe.',
  '/quotes': 'Quote management. Create quotes, send to customers. Convert to invoices.',
  '/settings': 'Business settings. Tabs: Profile, Hours, Staff, Notifications, Calendar, Integrations.',
  '/analytics': 'Analytics dashboard. Revenue charts, call volume, booking trends.',
  '/marketing': 'Marketing tools. Review requests, campaigns.',
  '/ai-agents': 'AI Agent dashboard. Configure automated SMS agents.',
  '/website': 'Website builder. Auto-generate a website from your business data.',
  '/google-business-profile': 'Google Business Profile sync. Reviews, posts, SEO score.',
  '/onboarding': 'Setup wizard. Multi-step flow to configure everything.',
  '/recurring': 'Recurring schedules. Set up repeating jobs or appointments.',
};

// ─── Platform Knowledge ──────────────────────────────────────────────────

const PLATFORM_KNOWLEDGE = `SmallBizAgent is an AI-powered platform for small service businesses. Core: AI Voice Receptionist (24/7 phone answering, books appointments, quotes pricing), Scheduling (calendar views, drag-and-drop, SMS reminders), Customer CRM (auto-built from calls), Invoicing (Stripe payments), Quotes. Automation: SMS follow-ups, no-show recovery, rebooking nudges, job status updates. Integrations: Google/Microsoft/Apple Calendar, Stripe, QuickBooks, Google Business Profile. Pricing: Starter $149/mo (150 min), Growth $299/mo (300 min), Pro $449/mo (500 min). 14-day free trial.`;

// ─── Tool Definitions ────────────────────────────────────────────────────

const SUPPORT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'set_business_hours',
      description: 'Set business open/close hours for one or more days of the week. Use when the user wants to set, change, or update their business hours.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'string', enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
                open: { type: 'string', description: 'Opening time in HH:MM 24h format, e.g. "09:00"' },
                close: { type: 'string', description: 'Closing time in HH:MM 24h format, e.g. "17:00"' },
                isClosed: { type: 'boolean', description: 'Set true if the business is closed this day' },
              },
              required: ['day'],
            },
          },
        },
        required: ['days'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_service',
      description: 'Add a new service to the business. Use when the user wants to add a service they offer.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Service name, e.g. "Drain Cleaning"' },
          price: { type: 'number', description: 'Price in dollars, e.g. 150' },
          duration: { type: 'number', description: 'Duration in minutes, e.g. 60. Default 60 if not specified.' },
          description: { type: 'string', description: 'Optional description of the service' },
        },
        required: ['name', 'price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_staff_member',
      description: 'Add a new staff member / team member / technician / barber / stylist to the business.',
      parameters: {
        type: 'object',
        properties: {
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address (optional)' },
          phone: { type: 'string', description: 'Phone number (optional)' },
          specialty: { type: 'string', description: 'Role/specialty, e.g. "Senior Barber", "HVAC Technician"' },
        },
        required: ['firstName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_knowledge_entry',
      description: 'Add a Q&A entry to the AI receptionist knowledge base. Use when the user wants to teach the AI something about their business.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question a caller might ask, e.g. "Do you offer emergency service?"' },
          answer: { type: 'string', description: 'The answer the AI should give, e.g. "Yes, we offer 24/7 emergency service for an additional $100 fee."' },
          category: { type: 'string', description: 'Category: faq, pricing, services, policies, hours. Default: faq' },
        },
        required: ['question', 'answer'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_setup_status',
      description: 'Run a full setup diagnostic. Shows what is configured, what is missing, and completion percentage. Use when the user asks if they are set up, what is missing, or how to finish setup.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_provisioning',
      description: 'Check if the phone number and AI receptionist are provisioned and active. Use when the user asks if their phone is working, if the AI is active, or about their phone number.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_setting',
      description: 'Enable or disable a business setting like call recording, SMS reminders, or the AI receptionist.',
      parameters: {
        type: 'object',
        properties: {
          setting: {
            type: 'string',
            enum: ['receptionistEnabled', 'callRecordingEnabled', 'appointmentConfirmationSms', 'appointmentReminderSms', 'jobCompletedSms', 'autoInvoiceOnJobCompletion'],
            description: 'The setting to toggle',
          },
          enabled: { type: 'boolean', description: 'True to enable, false to disable' },
        },
        required: ['setting', 'enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_booking_link',
      description: 'Get the public booking page URL for this business. Use when the user asks for their booking link or how to share it.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ─── Tool Executor ───────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: any,
  businessId: number
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (toolName) {
      case 'set_business_hours': {
        const existingHours = await storage.getBusinessHours(businessId);
        const updatedDays: string[] = [];
        for (const day of (args.days || [])) {
          const existing = existingHours.find((h: any) => h.day === day.day);
          if (existing) {
            await storage.updateBusinessHours(existing.id, {
              open: day.isClosed ? null : (day.open || '09:00'),
              close: day.isClosed ? null : (day.close || '17:00'),
              isClosed: day.isClosed || false,
            });
          } else {
            await storage.createBusinessHours({
              businessId,
              day: day.day,
              open: day.isClosed ? null : (day.open || '09:00'),
              close: day.isClosed ? null : (day.close || '17:00'),
              isClosed: day.isClosed || false,
            });
          }
          updatedDays.push(day.isClosed
            ? `${day.day}: CLOSED`
            : `${day.day}: ${day.open || '09:00'} to ${day.close || '17:00'}`
          );
        }
        // Refresh the AI receptionist with new hours
        try {
          const { debouncedUpdateRetellAgent } = await import('./retellProvisioningService');
          debouncedUpdateRetellAgent(businessId);
        } catch {}
        return {
          success: true,
          message: `Business hours updated:\n${updatedDays.join('\n')}\nThe AI receptionist has been updated with the new hours.`,
        };
      }

      case 'add_service': {
        const service = await storage.createService({
          businessId,
          name: args.name,
          price: args.price,
          duration: args.duration || 60,
          description: args.description || null,
        });
        // Refresh AI receptionist with new service list
        try {
          const { debouncedUpdateRetellAgent } = await import('./retellProvisioningService');
          debouncedUpdateRetellAgent(businessId);
        } catch {}
        return {
          success: true,
          message: `Service "${service.name}" created — $${args.price}, ${args.duration || 60} minutes. The AI receptionist now knows about this service.`,
          data: { serviceId: service.id },
        };
      }

      case 'add_staff_member': {
        const staffMember = await storage.createStaffMember({
          businessId,
          firstName: args.firstName,
          lastName: args.lastName || '',
          email: args.email || null,
          phone: args.phone || null,
          specialty: args.specialty || null,
        });
        return {
          success: true,
          message: `Staff member "${args.firstName}${args.lastName ? ' ' + args.lastName : ''}" added${args.specialty ? ` as ${args.specialty}` : ''}. They can now be assigned to appointments and jobs.`,
          data: { staffId: staffMember.id },
        };
      }

      case 'add_knowledge_entry': {
        const entry = await storage.createBusinessKnowledge({
          businessId,
          question: args.question,
          answer: args.answer,
          category: args.category || 'faq',
          source: 'owner',
          isApproved: true,
          priority: 10,
        });
        // Refresh AI receptionist with new knowledge
        try {
          const { debouncedUpdateRetellAgent } = await import('./retellProvisioningService');
          debouncedUpdateRetellAgent(businessId);
        } catch {}
        return {
          success: true,
          message: `Knowledge base entry added. When callers ask "${args.question}", the AI will answer: "${args.answer}"`,
          data: { entryId: entry.id },
        };
      }

      case 'check_setup_status': {
        const [biz, svcs, stf, hrs] = await Promise.all([
          storage.getBusiness(businessId),
          storage.getServices(businessId),
          storage.getStaff(businessId),
          storage.getBusinessHours(businessId),
        ]);
        const checks = {
          'Business name': !!biz?.name,
          'Industry set': !!biz?.industry,
          'Phone provisioned': !!biz?.twilioPhoneNumber,
          'AI Receptionist active': !!biz?.receptionistEnabled,
          'Services added': svcs.length > 0,
          'Staff added': stf.length > 0,
          'Business hours set': hrs.length > 0 && hrs.some((h: any) => !h.isClosed),
          'Booking page active': !!biz?.bookingSlug,
        };
        const completed = Object.values(checks).filter(Boolean).length;
        const total = Object.keys(checks).length;
        const pct = Math.round((completed / total) * 100);
        const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
        return {
          success: true,
          message: `Setup: ${pct}% complete (${completed}/${total}).\n` +
            (missing.length > 0
              ? `Missing: ${missing.join(', ')}.`
              : 'All core setup steps are complete!') +
            `\nServices: ${svcs.length}, Staff: ${stf.filter((s: any) => s.active !== false).length}, ` +
            `Phone: ${biz?.twilioPhoneNumber || 'not provisioned'}`,
        };
      }

      case 'check_provisioning': {
        const biz = await storage.getBusiness(businessId);
        return {
          success: true,
          message: `Phone: ${biz?.twilioPhoneNumber || 'NOT provisioned'}\n` +
            `AI Receptionist: ${biz?.receptionistEnabled ? 'ACTIVE' : 'DISABLED'}\n` +
            `Retell Agent: ${biz?.retellAgentId ? 'connected' : 'not connected'}\n` +
            `Provisioning Status: ${biz?.provisioningStatus || 'unknown'}` +
            (biz?.twilioPhoneNumber
              ? `\n\nYour AI receptionist is live. Call ${biz.twilioPhoneNumber} to test it.`
              : '\n\nNo phone number assigned. Go to the AI Receptionist page to provision one.'),
        };
      }

      case 'toggle_setting': {
        const { setting, enabled } = args;
        // Notification settings live on a different table
        const notifSettings = ['appointmentConfirmationSms', 'appointmentReminderSms', 'jobCompletedSms'];
        if (notifSettings.includes(setting)) {
          const existing = await storage.getNotificationSettings(businessId);
          if (existing) {
            await storage.upsertNotificationSettings({ ...existing, [setting]: enabled });
          }
          return { success: true, message: `${setting} ${enabled ? 'enabled' : 'disabled'}.` };
        }
        // Business-level settings
        await storage.updateBusiness(businessId, { [setting]: enabled });
        if (setting === 'receptionistEnabled') {
          try {
            const { debouncedUpdateRetellAgent } = await import('./retellProvisioningService');
            debouncedUpdateRetellAgent(businessId);
          } catch {}
        }
        return { success: true, message: `${setting} ${enabled ? 'enabled' : 'disabled'}.` };
      }

      case 'get_booking_link': {
        const biz = await storage.getBusiness(businessId);
        const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';
        if (biz?.bookingSlug) {
          return {
            success: true,
            message: `Your booking page: ${appUrl}/book/${biz.bookingSlug}\nShare this link with customers so they can book online 24/7.`,
          };
        }
        return {
          success: true,
          message: 'Your booking page is not set up yet. Go to Settings > Profile to set a booking slug.',
        };
      }

      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[SupportChat Tool] Error executing ${toolName}:`, error.message);
    return { success: false, message: `Failed to execute ${toolName}: ${error.message}` };
  }
}

// ─── Main Function ───────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  answer: string;
  tokensUsed: number;
  error?: string;
}

export async function answerQuestion(
  userId: number,
  businessId: number,
  question: string,
  currentPage: string,
  history: ChatMessage[]
): Promise<ChatResponse> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        answer: "I'm not available right now. Please email Bark@smallbizagent.ai for help!",
        tokensUsed: 0,
      };
    }

    // Parallel fetch user context
    const [business, services, staff, hours] = await Promise.all([
      storage.getBusiness(businessId).catch(() => null),
      storage.getServices(businessId).catch(() => []),
      storage.getStaff(businessId).catch(() => []),
      storage.getBusinessHours(businessId).catch(() => []),
    ]);

    // Build state summary
    const setupState: string[] = [];
    const setupGaps: string[] = [];

    if (business) {
      setupState.push(`Business: "${business.name}" (${business.industry || 'not set'})`);
      setupState.push(`Subscription: ${business.subscriptionStatus || 'inactive'}${business.trialEndsAt ? `, trial ends ${new Date(business.trialEndsAt).toLocaleDateString()}` : ''}`);
      if (business.twilioPhoneNumber) setupState.push(`Phone: ${business.twilioPhoneNumber} (provisioned)`);
      else setupGaps.push('Phone number not provisioned');
      if (business.receptionistEnabled) setupState.push('AI Receptionist: active');
      else setupGaps.push('AI Receptionist is disabled');
    }
    if (services.length > 0) setupState.push(`Services: ${services.length} configured`);
    else setupGaps.push('No services added');
    if (staff.length > 0) setupState.push(`Staff: ${staff.filter((s: any) => s.active !== false).length} active`);
    else setupGaps.push('No staff members added');
    if (hours.length > 0 && hours.some((h: any) => !h.isClosed)) setupState.push('Business hours: configured');
    else setupGaps.push('Business hours not set');

    // Page context
    const pageKey = Object.keys(PAGE_CONTEXT).find(key => currentPage.startsWith(key)) || '';
    const pageHelp = PAGE_CONTEXT[pageKey] || `User is on: ${currentPage}`;

    // System prompt with tool instructions
    const systemPrompt = `You are the SmallBizAgent support assistant. You help small business owners set up and use their AI receptionist platform. You can both answer questions AND take actions.

RULES:
- Be concise: 2-3 sentences max.
- Be specific: Reference exact page names and buttons.
- Be friendly and professional.
- If you don't know, say: "I'm not sure about that — let me flag this for the team."
- Never make up features.
- Pricing: Starter $149/mo, Growth $299/mo, Pro $449/mo. 14-day free trial.

TOOLS: You have tools to take actions on behalf of the user.
- For READ operations (check status, get booking link): use tools immediately, no confirmation needed.
- For WRITE operations (set hours, add service, add staff, add knowledge): tell the user what you're about to do, then do it. Example: "I'll set your hours to Mon-Fri 9am-5pm and close on weekends." then call the tool.
- After executing a tool, summarize what you did in plain language.
- If a tool fails, explain the error simply.

${PLATFORM_KNOWLEDGE}

CURRENT PAGE: ${pageHelp}

USER STATE:
${setupState.join('\n')}
${setupGaps.length > 0 ? `\nSETUP GAPS: ${setupGaps.join(', ')}` : '\nAll core setup complete.'}`;

    // Build messages
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: question },
    ];

    let totalTokens = 0;
    const MAX_TOOL_LOOPS = 3; // Safety: prevent infinite tool loops
    let loopCount = 0;
    const MODEL = 'gpt-5.4-mini';

    // Initial call (may return tool calls or direct answer)
    let response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      max_completion_tokens: 400,
      messages,
      tools: SUPPORT_TOOLS,
      tool_choice: 'auto',
    });
    totalTokens += response.usage?.total_tokens || 0;

    // Tool loop — execute tool calls and feed results back
    let assistantMessage = response.choices[0]?.message;
    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0 && loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      // Execute each tool call
      const toolResults: any[] = [];
      for (const toolCall of assistantMessage.tool_calls) {
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {}
        console.log(`[SupportChat] Tool call: ${toolCall.function.name}(${JSON.stringify(toolArgs)}) for business ${businessId}`);
        const result = await executeTool(toolCall.function.name, toolArgs, businessId);
        toolResults.push({
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Feed tool results back to the model
      messages.push(assistantMessage, ...toolResults);
      response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.3,
        max_completion_tokens: 400,
        messages,
        tools: SUPPORT_TOOLS,
      });
      totalTokens += response.usage?.total_tokens || 0;
      assistantMessage = response.choices[0]?.message;
    }

    const answer = assistantMessage?.content || "I'm having trouble right now. Please try again or email Bark@smallbizagent.ai.";

    // Log unanswered questions
    if (answer.toLowerCase().includes("flag this for the team") || answer.toLowerCase().includes("not sure about that")) {
      try {
        await storage.createUnansweredQuestion({
          businessId: 0,
          question: `[Support Chat] ${question} (business ${businessId}, page: ${currentPage})`,
          status: 'pending',
        });
      } catch {}
    }

    return { answer, tokensUsed: totalTokens };
  } catch (error: any) {
    const errMsg = error.message || 'Unknown error';
    const errStatus = error.status || error.statusCode || '';
    const errCode = error.code || error.error?.code || '';
    console.error(`[SupportChat] Error: ${errMsg} | status: ${errStatus} | code: ${errCode}`);
    console.error('[SupportChat] Full error:', JSON.stringify(error.response?.data || error.error || {}, null, 2));
    // Surface the real error in dev/debug so we can diagnose
    const debugInfo = process.env.NODE_ENV !== 'production'
      ? ` (Debug: ${errMsg})`
      : '';
    return {
      answer: `I'm having a temporary issue. Please try again in a moment, or email Bark@smallbizagent.ai for help.${debugInfo}`,
      tokensUsed: 0,
      error: errMsg, // Include error in response for debugging
    };
  }
}

// ─── Suggested Questions by Page ─────────────────────────────────────────

export function getSuggestedQuestions(currentPage: string): string[] {
  const suggestions: Record<string, string[]> = {
    '/dashboard': [
      'Am I all set up?',
      'How do I test my AI receptionist?',
      'Set my hours to Mon-Fri 9 to 5',
    ],
    '/receptionist': [
      'How do I change the AI voice?',
      'Add a FAQ: Do you offer emergency service? Yes, for $300.',
      'Is my phone number working?',
    ],
    '/appointments': [
      'How do appointment reminders work?',
      'How do I reschedule?',
      'What is my booking link?',
    ],
    '/jobs': [
      'Do customers get SMS when I update status?',
      'How do I create an invoice from a job?',
      'Turn on auto-invoice',
    ],
    '/settings': [
      'Set my hours to Monday-Friday 9 to 5',
      'Add a staff member named Mike',
      'How do I connect my calendar?',
    ],
    '/invoices': [
      'How do customers pay invoices?',
      'How do payment reminders work?',
      'How do I send a payment link?',
    ],
    '/customers': [
      'Where do customers come from?',
      'How does the CRM auto-update?',
      'How do I export my customer list?',
    ],
    '/ai-agents': [
      'What do the AI agents do?',
      'How do follow-up messages work?',
      'Turn on job completion SMS',
    ],
    '/onboarding': [
      'Help me finish setting up',
      'Set my hours to 8am-6pm weekdays',
      'Add a service: Haircut for $30',
    ],
  };

  const key = Object.keys(suggestions).find(k => currentPage.startsWith(k));
  return suggestions[key || ''] || [
    'Am I all set up?',
    'What can the AI receptionist do?',
    'Help me finish setting up',
  ];
}
