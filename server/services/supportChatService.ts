/**
 * Support Chat Service — context-aware AI assistant for platform help.
 * Knows the user's business state, current page, setup gaps, and platform features.
 * Uses OpenAI gpt-4o-mini for fast, cheap, accurate support responses.
 */
import OpenAI from 'openai';
import { storage } from '../storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Page Context Map ────────────────────────────────────────────────────
// Rich descriptions of what each page does, so the AI gives page-specific help

const PAGE_CONTEXT: Record<string, string> = {
  '/dashboard': 'Main dashboard. Shows business stats (calls, appointments, revenue), setup checklist with completion %, AI ROI card showing call-to-booking conversion. The setup checklist links to incomplete steps.',
  '/receptionist': 'AI Receptionist configuration. Set custom greeting, choose voice (ElevenLabs/Cartesia/OpenAI voices), manage Knowledge Base Q&A (teach the AI about your business), toggle call recording, view call logs with transcripts and AI summaries. Click "Refresh Assistant" after making changes.',
  '/customers': 'Customer CRM. View all customers auto-created from calls and bookings. Search, filter, export CSV. Click a customer to see their full history (calls, appointments, invoices, SMS).',
  '/appointments': 'Appointment calendar. Week/day/month views. Drag-and-drop to reschedule (sends SMS to customer). Staff filter pills to show/hide staff. Quick stats bar shows booked/earned/active/no-shows.',
  '/jobs': 'Job schedule (for field service businesses). Calendar and list view toggle. Job cards show status (pending, in progress, waiting parts, completed). Customers get automatic SMS when status changes.',
  '/invoices': 'Invoice management. Create, send, and track invoices. Payment links via Stripe. Customers can pay online. Invoice reminders sent automatically.',
  '/quotes': 'Quote management. Create quotes, send to customers, track acceptance. Convert accepted quotes to invoices with one click.',
  '/settings': 'Business settings. Tabs: Profile (name, address, industry), Hours (business hours per day), Staff (add team members, set schedules), Notifications (toggle SMS/email per event type), Calendar (connect Google/Microsoft/Apple), Integrations (Stripe, QuickBooks).',
  '/settings?tab=hours': 'Business hours settings. Set open/close times for each day. Quick presets available (Mon-Fri 9-5, etc.). These hours determine when customers can book and when the AI says you are open.',
  '/settings?tab=staff': 'Staff management. Add team members with name, email, specialty. Set individual schedules per staff member. Add time off / vacation blocks.',
  '/analytics': 'Analytics dashboard. Revenue charts, call volume, booking trends, customer growth, no-show rates. Filter by date range.',
  '/marketing': 'Marketing tools. Review requests (auto-send after job completion), campaigns, Google review management.',
  '/ai-agents': 'AI Agent dashboard. Configure automated SMS agents: follow-up after jobs, no-show recovery, rebooking nudges, estimate follow-ups. Activity feed shows what agents have sent.',
  '/website': 'Website builder. Scan your existing website to auto-generate a new one. Customize colors, fonts, sections. Subdomain hosting included.',
  '/google-business-profile': 'Google Business Profile sync. Connect your GBP, sync reviews, create posts, track SEO score.',
  '/onboarding': 'Setup wizard. Multi-step flow to configure your business: name, services, hours, staff, AI receptionist, calendar, subscription.',
  '/recurring': 'Recurring schedules. Set up repeating jobs or appointments (weekly, biweekly, monthly). Auto-generates appointments on schedule.',
  '/book': 'Public booking page. Share this link with customers so they can book online 24/7. Customizable with your services, staff, and available times.',
};

// ─── Platform Knowledge ──────────────────────────────────────────────────

const PLATFORM_KNOWLEDGE = `SmallBizAgent is an AI-powered platform for small service businesses. Key features:

CORE:
- AI Voice Receptionist: Answers phone calls 24/7, books appointments, quotes pricing, handles FAQs. Powered by Retell AI.
- Appointment & Job Scheduling: Calendar views, drag-and-drop, automatic SMS confirmations and reminders.
- Customer CRM: Auto-built from calls and bookings. Tracks history, preferences, visit frequency.
- Invoicing & Payments: Create invoices, send payment links (Stripe), track payments.
- Quotes: Create and send quotes, convert to invoices when accepted.

AUTOMATION:
- SMS Agents: Automated follow-ups after jobs, no-show recovery, rebooking nudges, estimate follow-ups, review requests.
- Appointment Reminders: Automatic SMS/email reminders before appointments.
- Job Status SMS: Customers get texts when technician is on the way, job is waiting for parts, or work resumes.

SETUP:
- Express Onboarding: 2-minute quick setup (business name, industry, phone → everything auto-provisioned).
- Industry Templates: Pre-loaded services with pricing for 12+ industries (HVAC, plumbing, salon, etc.).
- Knowledge Base: Teach the AI about your business with Q&A pairs. It learns from unanswered caller questions.

INTEGRATIONS:
- Google/Microsoft/Apple Calendar: Sync appointments to your calendar.
- Stripe: Payment processing for invoices.
- QuickBooks: Accounting sync.
- Google Business Profile: Review sync, local posts, SEO scoring.

COMMON TASKS:
- To test the AI receptionist: Call your provisioned phone number and have a conversation.
- To add services: Go to Settings > Profile tab, scroll to Services section, click "Add Service".
- To set business hours: Go to Settings > Hours tab, set open/close for each day.
- To add staff: Go to Settings > Staff tab, click "Add Staff Member".
- To connect calendar: Go to Settings > Calendar tab, click Connect for Google/Microsoft.
- To share your booking page: Go to Settings > Profile, copy your booking link (smallbizagent.ai/book/your-slug).
- To view call recordings: Go to AI Receptionist page, scroll to Call Logs section.
- To train the AI: Go to AI Receptionist > Knowledge Base tab, add Q&A pairs.`;

// ─── Main Function ───────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  answer: string;
  tokensUsed: number;
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

    // Parallel fetch all user context
    const [business, services, staff, hours, calendarStatus] = await Promise.all([
      storage.getBusiness(businessId).catch(() => null),
      storage.getServices(businessId).catch(() => []),
      storage.getStaff(businessId).catch(() => []),
      storage.getBusinessHours(businessId).catch(() => []),
      Promise.resolve([]), // Calendar status checked via settings page
    ]);

    // Build user state summary
    const setupState: string[] = [];
    const setupGaps: string[] = [];

    if (business) {
      setupState.push(`Business: "${business.name}" (${business.industry || 'not set'})`);
      setupState.push(`Subscription: ${business.subscriptionStatus || 'inactive'}${business.trialEndsAt ? `, trial ends ${new Date(business.trialEndsAt).toLocaleDateString()}` : ''}`);

      if (business.twilioPhoneNumber) {
        setupState.push(`Phone: ${business.twilioPhoneNumber} (provisioned)`);
      } else {
        setupGaps.push('Phone number not provisioned — go to AI Receptionist page and click Provision');
      }

      if (business.receptionistEnabled) {
        setupState.push('AI Receptionist: active');
      } else {
        setupGaps.push('AI Receptionist is disabled — go to AI Receptionist page and toggle it on');
      }
    }

    if (services.length > 0) {
      setupState.push(`Services: ${services.length} configured`);
    } else {
      setupGaps.push('No services added — go to Settings > Profile, scroll to Services, click Add Service');
    }

    if (staff.length > 0) {
      const activeStaff = staff.filter((s: any) => s.active !== false);
      setupState.push(`Staff: ${activeStaff.length} active members`);
    } else {
      setupGaps.push('No staff members added — go to Settings > Staff tab, click Add Staff Member');
    }

    if (hours.length > 0 && hours.some((h: any) => !h.isClosed)) {
      setupState.push('Business hours: configured');
    } else {
      setupGaps.push('Business hours not set — go to Settings > Hours tab to set your schedule');
    }

    const hasCalendar = Array.isArray(calendarStatus) && calendarStatus.length > 0;
    if (hasCalendar) {
      setupState.push('Calendar: connected');
    } else {
      setupGaps.push('Calendar not connected — go to Settings > Calendar tab to connect Google or Microsoft');
    }

    // Find page context
    const pageKey = Object.keys(PAGE_CONTEXT).find(key => currentPage.startsWith(key)) || '';
    const pageHelp = PAGE_CONTEXT[pageKey] || `The user is on page: ${currentPage}`;

    // Build system prompt
    const systemPrompt = `You are the SmallBizAgent support assistant. You help small business owners set up and use their AI receptionist platform.

RULES:
- Be concise: 2-3 sentences max unless they ask for detailed instructions.
- Be specific: Reference exact page names, tab names, and button names.
- Be friendly but professional. Use "you" not "the user".
- If you genuinely don't know the answer, say: "I'm not sure about that — let me flag this for the team. They'll follow up by email."
- Never make up features that don't exist.
- If they ask about pricing: Starter $149/mo (150 min), Growth $299/mo (300 min), Pro $449/mo (500 min). 14-day free trial.

${PLATFORM_KNOWLEDGE}

CURRENT PAGE: ${pageHelp}

USER STATE:
${setupState.join('\n')}

${setupGaps.length > 0 ? `SETUP GAPS (mention if relevant to their question):\n${setupGaps.join('\n')}` : 'All core setup steps are complete.'}`;

    // Call OpenAI
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })), // Keep last 10 messages
      { role: 'user', content: question },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      temperature: 0.3,
      max_tokens: 400,
      messages,
    });

    const answer = response.choices[0]?.message?.content || "I'm having trouble right now. Please try again or email Bark@smallbizagent.ai.";
    const tokensUsed = response.usage?.total_tokens || 0;

    // Log unanswered questions (if the AI admits it doesn't know)
    if (answer.toLowerCase().includes("flag this for the team") || answer.toLowerCase().includes("not sure about that")) {
      try {
        await storage.createUnansweredQuestion({
          businessId: 0, // Platform-level question
          question: `[Support Chat] ${question} (from business ${businessId}, page: ${currentPage})`,
          status: 'pending',
        });
      } catch (logErr) {
        console.error('[SupportChat] Failed to log unanswered question:', logErr);
      }
    }

    return { answer, tokensUsed };
  } catch (error: any) {
    console.error('[SupportChat] Error:', error.message);
    return {
      answer: "I'm having a temporary issue. Please try again in a moment, or email Bark@smallbizagent.ai for help.",
      tokensUsed: 0,
    };
  }
}

// ─── Suggested Questions by Page ─────────────────────────────────────────

export function getSuggestedQuestions(currentPage: string): string[] {
  const suggestions: Record<string, string[]> = {
    '/dashboard': [
      'How do I test my AI receptionist?',
      'What does the AI ROI card mean?',
      'How do I finish setting up?',
    ],
    '/receptionist': [
      'How do I change the AI voice?',
      'How do I train the AI on my business?',
      'How do I view call recordings?',
    ],
    '/appointments': [
      'How do I reschedule an appointment?',
      'How do appointment reminders work?',
      'How do I add a new appointment?',
    ],
    '/jobs': [
      'How do job status updates work?',
      'Do customers get SMS when I update status?',
      'How do I create an invoice from a job?',
    ],
    '/settings': [
      'How do I set my business hours?',
      'How do I add a staff member?',
      'How do I connect my calendar?',
    ],
    '/invoices': [
      'How do customers pay invoices?',
      'How do payment reminders work?',
      'How do I create a new invoice?',
    ],
    '/customers': [
      'Where do customers come from?',
      'How do I export my customer list?',
      'How does the CRM auto-update?',
    ],
    '/ai-agents': [
      'What do the AI agents do?',
      'How do follow-up messages work?',
      'Can I customize agent messages?',
    ],
    '/onboarding': [
      'What do I need to set up?',
      'Can I skip steps and come back later?',
      'How long does setup take?',
    ],
  };

  const key = Object.keys(suggestions).find(k => currentPage.startsWith(k));
  return suggestions[key || ''] || [
    'How do I get started?',
    'What can the AI receptionist do?',
    'How do I contact support?',
  ];
}
