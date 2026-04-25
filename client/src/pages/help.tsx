import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Search, Mail, MessageSquare, HelpCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSection {
  title: string;
  items: FaqItem[];
}

const faqSections: FaqSection[] = [
  {
    title: "Getting Started",
    items: [
      {
        question: "What is SmallBizAgent?",
        answer:
          "SmallBizAgent is an all-in-one AI-powered platform for small service businesses. It provides an AI voice receptionist that answers calls 24/7, appointment and job scheduling, invoicing and payments via Stripe, a customer CRM, automated SMS follow-ups, marketing tools, and more. Whether you run a salon, HVAC company, dental practice, or restaurant, SmallBizAgent helps you save time and never miss a customer.",
      },
      {
        question: "How do I set up my business on SmallBizAgent?",
        answer:
          "After registering and verifying your email, you can choose the Express Setup (2 minutes) or the Detailed Setup wizard (5-10 minutes). Express Setup asks for your business name, industry, phone, and email, then automatically provisions your AI receptionist and creates default services and hours. The Detailed Setup walks you through each section step by step. You can always refine your settings later from the Settings page.",
      },
      {
        question: "How does the free trial work?",
        answer:
          "Every new account gets a 14-day free trial with no credit card required. During the trial you get full access to all features, including 25 free AI call minutes. When the trial ends, your phone number is kept for a 30-day grace period (AI calls are paused), giving you time to subscribe. Once you subscribe, everything is re-activated instantly.",
      },
      {
        question: "How do I import my existing customers?",
        answer:
          "Go to the Customers page and click the Import button. You can upload a CSV file with up to 500 customers at a time. The importer auto-detects common column headers like Name, Email, and Phone. You can map columns manually if needed, preview the data before importing, and see a summary of how many were imported, skipped, or had errors.",
      },
      {
        question: "How do I set up my business hours?",
        answer:
          "Navigate to Settings and open the Business section. You will see a 7-day schedule where you can set open and close times for each day, or mark specific days as closed. You can also set hours during the onboarding wizard. The AI receptionist uses your business hours to tell callers whether you are open or closed and to offer accurate appointment slots.",
      },
    ],
  },
  {
    title: "AI Receptionist",
    items: [
      {
        question: "How does the AI receptionist work?",
        answer:
          "The AI receptionist uses Retell AI to answer your business phone calls 24/7. When a customer calls, the AI greets them by name if they are a returning caller, checks real-time availability, books appointments, answers questions from your knowledge base, and sends SMS confirmations. It is fully customizable with your business name, greeting, voice, and industry-specific behavior.",
      },
      {
        question: "Can I customize the greeting and voice?",
        answer:
          "Yes. Go to the AI Receptionist page to configure your assistant name, custom greeting message, and voice. You can choose from multiple AI voices (ElevenLabs, Cartesia, and OpenAI voices). You can also add custom instructions, toggle call recording, enable voicemail, and manage your knowledge base of frequently asked questions.",
      },
      {
        question: "What happens when a customer calls after hours?",
        answer:
          "The AI receptionist knows your real-time open/closed status. After hours, it informs the caller that the business is currently closed, tells them your next open hours, and still offers to book an appointment for a future date and time. If voicemail is enabled, callers can also leave a message.",
      },
      {
        question: "How does the AI handle multiple languages?",
        answer:
          "The AI receptionist is configured with English-only transcription for optimal accuracy and speed. However, the system prompt includes multilingual support so the AI can respond in Spanish or other languages if the caller speaks in that language. Industry-specific terminology dictionaries help the AI understand common slang and jargon across 15+ verticals.",
      },
      {
        question: "How do I see my call logs and transcripts?",
        answer:
          "Go to the AI Receptionist page and select the Call Logs tab. You will see a list of all calls with caller ID, duration, status, and detected intent. Click any call to view the full transcript, AI-generated intelligence summary (sentiment, key facts, follow-up needs), and the recording if call recording is enabled.",
      },
    ],
  },
  {
    title: "Scheduling & Jobs",
    items: [
      {
        question: "How do I set up my services?",
        answer:
          "Go to Settings and open the Business section, or navigate to the Services area during onboarding. You can add services with a name, price, and duration. These services appear in your online booking page, the AI receptionist's availability checks, and your invoices. You can also assign specific services to specific staff members.",
      },
      {
        question: "How does online booking work?",
        answer:
          "Each business gets a unique booking page at smallbizagent.ai/book/your-slug. Customers can view your available services, pick a staff member (if applicable), select a date and time from real-time availability, and confirm their booking. They receive an SMS confirmation with options to confirm, reschedule, or cancel. You can embed the booking widget on your own website as well.",
      },
      {
        question: "How do I assign staff to appointments?",
        answer:
          "First add your staff members in Settings under the Business section. You can set each staff member's working hours, assign them to specific services, and manage their time off. When customers book, they can choose a specific staff member, or the system will auto-assign based on availability. Staff members can also be invited to join the platform with their own login.",
      },
      {
        question: "What is the difference between appointments and jobs?",
        answer:
          "Appointments are time-based calendar entries (haircuts, consultations, dental checkups). Jobs are task-based work items common in field service businesses (HVAC repairs, plumbing calls, electrical work). Jobs have statuses like pending, in progress, waiting for parts, and completed. For job-category businesses, the navigation automatically switches to show a Schedule/Jobs view instead of Appointments.",
      },
      {
        question: "How do recurring schedules work?",
        answer:
          "Go to the Recurring page to set up repeating appointments or jobs. You can choose a frequency (daily, weekly, biweekly, monthly), set a start date, and optionally auto-create invoices on each occurrence. When a recurring series is created via phone booking, the customer receives a single summary SMS listing all booked dates.",
      },
    ],
  },
  {
    title: "Billing & Payments",
    items: [
      {
        question: "What plans are available?",
        answer:
          "SmallBizAgent offers three plans: Starter ($149/month, 150 AI call minutes), Growth ($299/month, 300 minutes), and Pro ($449/month, 500 minutes). All plans include the AI receptionist, scheduling, invoicing, CRM, and SMS agents. Growth adds calendar sync, Google Business Profile sync, advanced analytics, and staff scheduling for up to 5. Pro adds multi-location support, up to 15 staff, API access, custom AI training, dedicated onboarding, and white-label readiness. Annual billing saves roughly 20%.",
      },
      {
        question: "How does overage billing work?",
        answer:
          "If you exceed your included AI call minutes in a billing period, additional minutes are billed at your plan's overage rate: $0.20/min on Starter, $0.15/min on Growth, $0.10/min on Pro. Overage charges are calculated at the end of each billing cycle and added to your next Stripe invoice. You can monitor your usage in the Settings under the Billing section.",
      },
      {
        question: "How do I cancel my subscription?",
        answer:
          "Go to Settings and open the Billing section. Click Manage Subscription to open the Stripe Billing Portal where you can cancel, change plans, or update your payment method. When you cancel, your service remains active until the end of the current billing period. Your phone number is kept for 30 days in case you decide to resubscribe.",
      },
      {
        question: "How does Stripe Connect work for accepting payments?",
        answer:
          "Stripe Connect lets you accept payments directly from your customers through SmallBizAgent invoices. Go to Settings and connect your Stripe account (or create a new one). Once connected, you can send invoices with one-tap payment links. Customers pay via credit card, and funds go directly to your Stripe account.",
      },
      {
        question: "How do I send invoices to customers?",
        answer:
          "Go to the Invoices page and click Create Invoice. Select a customer, add line items with descriptions, quantities, and prices, and the total is calculated automatically. You can send the invoice via SMS or email with a payment link. Customers can view and pay the invoice online. For job-category businesses, invoices can be auto-generated when a job is marked as completed.",
      },
    ],
  },
  {
    title: "SMS & Automations",
    items: [
      {
        question: "What SMS agents are available?",
        answer:
          "SmallBizAgent includes several automated SMS agents: Follow-Up Agent (thank-you and upsell after completed jobs), No-Show Agent (recovery messages for missed appointments), Rebooking Agent (win-back for inactive customers), Estimate Follow-Up Agent (quote follow-ups), Invoice Collection Agent (escalating reminders for overdue invoices), and Review Request Agent (requests Google reviews after service). Each agent can be enabled or disabled from the AI Agents page.",
      },
      {
        question: "How does TCPA compliance work?",
        answer:
          "SmallBizAgent is built with full TCPA compliance. Customers must opt in to receive SMS messages. A welcome SMS with full disclosure is sent on opt-in. All marketing messages include a STOP opt-out footer. Replying STOP opts the customer out of marketing messages while still allowing transactional messages like appointment reminders. The platform maintains a suppression list and respects all opt-out requests.",
      },
      {
        question: "How do I set up automated follow-up texts?",
        answer:
          "Go to the AI Agents page and enable the agents you want. Each agent has its own configuration: the Follow-Up Agent sends a thank-you after job completion, the No-Show Agent triggers when an appointment is marked as a no-show, and the Rebooking Agent reaches out to customers who have not visited in 30+ days. All messages are AI-generated with your business personality using the SMS profile you set up during onboarding.",
      },
      {
        question: "How do I stop SMS messages to a specific customer?",
        answer:
          "Customers can reply STOP to any marketing SMS to opt out of future marketing messages. They will still receive transactional messages like appointment confirmations and reminders. You can also manually toggle a customer's SMS opt-in status from their profile in the Customers page. The suppression list is checked before every outbound message.",
      },
      {
        question: "How do workflow automations work?",
        answer:
          "Workflows let you create custom multi-step SMS sequences triggered by business events. Go to the AI Agents page and select the Workflows tab. You can install pre-built templates (post-appointment follow-up, no-show recovery, job completion flow, invoice collection, rebooking drip) or build your own. Each workflow has steps like Wait (delay before next action) and Send SMS (with configurable message types). Workflows respect engagement locks to prevent message conflicts between agents.",
      },
    ],
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedQuery = searchQuery.toLowerCase().trim();

  const filteredSections = faqSections
    .map((section) => {
      if (!normalizedQuery) return section;
      const filteredItems = section.items.filter(
        (item) =>
          item.question.toLowerCase().includes(normalizedQuery) ||
          item.answer.toLowerCase().includes(normalizedQuery)
      );
      return { ...section, items: filteredItems };
    })
    .filter((section) => section.items.length > 0);

  const totalResults = filteredSections.reduce(
    (sum, s) => sum + s.items.length,
    0
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-black text-white">
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <HelpCircle className="h-10 w-10 mx-auto mb-4 text-gray-300" />
          <h1 className="text-3xl font-bold mb-2">Help Center</h1>
          <p className="text-gray-400 mb-8">
            Find answers to common questions about SmallBizAgent.
          </p>

          {/* Search */}
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search for a question..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus:bg-white/15 focus:border-white/40"
            />
          </div>

          {normalizedQuery && (
            <p className="text-sm text-gray-400 mt-3">
              {totalResults} result{totalResults !== 1 ? "s" : ""} found
            </p>
          )}
        </div>
      </div>

      {/* FAQ Sections */}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {filteredSections.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No results found</p>
              <p className="text-sm text-gray-400 mt-1">
                Try different keywords or{" "}
                <a
                  href="mailto:bark@smallbizagent.ai?subject=Support%20Request"
                  className="text-black underline hover:no-underline"
                >
                  contact support
                </a>
                .
              </p>
            </CardContent>
          </Card>
        )}

        {filteredSections.map((section, sectionIdx) => (
          <Card key={sectionIdx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {section.items.map((item, itemIdx) => (
                  <AccordionItem
                    key={itemIdx}
                    value={`${sectionIdx}-${itemIdx}`}
                  >
                    <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-gray-600 leading-relaxed">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}

        {/* Contact Section */}
        <Card className="border-2 border-gray-200">
          <CardContent className="py-8 text-center">
            <MessageSquare className="h-8 w-8 mx-auto mb-3 text-gray-400" />
            <h2 className="text-lg font-semibold mb-1">Still need help?</h2>
            <p className="text-sm text-gray-500 mb-6">
              Our team is here to help you get the most out of SmallBizAgent.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a href="mailto:bark@smallbizagent.ai?subject=Support%20Request">
                <Button variant="outline" className="gap-2">
                  <Mail className="h-4 w-4" />
                  bark@smallbizagent.ai
                </Button>
              </a>
              <a href="/contact">
                <Button className="gap-2 bg-black text-white hover:bg-gray-800">
                  <MessageSquare className="h-4 w-4" />
                  Open Support Chat
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
