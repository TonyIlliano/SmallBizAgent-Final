import { Link } from "wouter";
import { ArrowLeft, MessageSquare, Phone, Mail, BookOpen, Clock, Zap, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

// Robot Logo SVG matching the SmallBizAgent brand
const RobotLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
    <rect x="47" y="5" width="6" height="10" rx="3" />
    <circle cx="50" cy="5" r="4" />
    <rect x="25" y="18" width="50" height="40" rx="12" />
    <rect x="30" y="28" width="40" height="15" rx="7" fill="black" />
    <circle cx="40" cy="35" r="5" fill="white" />
    <circle cx="60" cy="35" r="5" fill="white" />
    <path d="M 38 48 Q 50 55 62 48" stroke="black" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M 32 58 L 32 75 Q 32 82 39 82 L 61 82 Q 68 82 68 75 L 68 58" />
    <path d="M 42 62 L 50 68 L 58 62" stroke="black" strokeWidth="2" fill="none" />
    <ellipse cx="20" cy="65" rx="8" ry="12" />
    <ellipse cx="80" cy="65" rx="8" ry="12" />
    <circle cx="20" cy="78" r="5" />
    <circle cx="80" cy="78" r="5" />
    <rect x="36" y="82" width="10" height="12" rx="3" />
    <rect x="54" y="82" width="10" height="12" rx="3" />
  </svg>
);

const faqs = [
  {
    question: "How do I set up my AI receptionist?",
    answer: "After signing up, go to the AI Receptionist tab in your dashboard. Complete the Configuration step (choose voice, set greeting, business hours), then use the Knowledge Base to train the AI on your services, pricing, and FAQs. You can test it using the 'Test Call' button on the Knowledge Base page."
  },
  {
    question: "How does call forwarding work?",
    answer: "Once your AI receptionist is set up, you'll receive a dedicated phone number. You can forward your business phone to this number by dialing *72 followed by the number from your business phone. To remove forwarding, dial *73. When forwarding is active, calls to your business number will be answered by your AI receptionist."
  },
  {
    question: "Can my customers book appointments online?",
    answer: "Yes! Each business gets a unique booking page (e.g., smallbizagent.ai/book/your-business). Share this link on your website, social media, or Google Business profile. Customers can see your available times and book directly. You'll receive a notification and the appointment will appear on your calendar."
  },
  {
    question: "How do SMS notifications work?",
    answer: "The platform automatically sends SMS messages for appointment confirmations, reminders, invoice notifications, and more. Your customers can reply CONFIRM to confirm appointments or STOP to opt out. Marketing messages (review requests, promotions) require customer consent and always include opt-out instructions."
  },
  {
    question: "What happens when my trial expires?",
    answer: "Your 14-day trial gives you full access to all features. When it expires, you'll need to subscribe to continue using the Service. If you've set up call forwarding to your AI receptionist number, the number will be deactivated — so make sure to either subscribe or dial *73 from your business phone to remove forwarding before your trial ends."
  },
  {
    question: "How do I cancel my subscription?",
    answer: "Go to Settings > Subscription in your dashboard. Click 'Cancel Subscription' and your access will continue until the end of your current billing period. You won't be charged again. You can export your data before cancellation."
  },
  {
    question: "Can I have multiple staff members use the platform?",
    answer: "Yes! From Settings > Staff, you can invite team members to join your account. Staff members get their own login and can manage appointments, view their schedule, and handle customer interactions based on the permissions you set."
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We use industry-standard encryption (TLS/SSL) for all data in transit, secure password hashing, and payment processing through Stripe (PCI DSS Level 1 compliant). We do not store credit card numbers on our servers. See our Privacy Policy for full details."
  }
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-neutral-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-neutral-900/50 transition-colors"
      >
        <span className="font-medium text-white pr-4">{question}</span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-neutral-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-neutral-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 text-neutral-300 leading-relaxed border-t border-neutral-800 pt-4">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <RobotLogo className="h-8 w-8 text-white" />
                <span className="text-lg font-bold tracking-wide">SMALLBIZ AGENT</span>
              </div>
            </Link>
            <Link href="/">
              <span className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">How Can We Help?</h1>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
            Get the support you need to make the most of SmallBizAgent. We're here to help your business succeed.
          </p>
        </div>
      </section>

      {/* Support Options */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
          <Card className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-colors">
            <CardContent className="p-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-7 w-7 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Email Support</h3>
              <p className="text-neutral-400 text-sm mb-4">
                Send us an email and we'll get back to you within 24 hours.
              </p>
              <a href="mailto:Bark@smallbizagent.ai">
                <Button variant="outline" className="border-neutral-700 text-white hover:bg-neutral-800 w-full">
                  Bark@smallbizagent.ai
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-colors">
            <CardContent className="p-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-7 w-7 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Business Hours</h3>
              <p className="text-neutral-400 text-sm mb-4">
                Our support team is available during business hours.
              </p>
              <div className="text-sm text-neutral-300 space-y-1">
                <p>Monday - Friday</p>
                <p className="font-medium text-white">9:00 AM - 6:00 PM EST</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-colors">
            <CardContent className="p-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="h-7 w-7 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Priority Support</h3>
              <p className="text-neutral-400 text-sm mb-4">
                Growth and Pro plan subscribers get priority response times.
              </p>
              <div className="text-sm text-neutral-300 space-y-1">
                <p>Response within</p>
                <p className="font-medium text-white">4 hours (business days)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Quick Start Guides */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8 bg-neutral-950">
        <div className="max-w-5xl mx-auto py-16">
          <h2 className="text-3xl font-bold text-center mb-12">Getting Started</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Phone,
                title: "Set Up Your AI Receptionist",
                description: "Configure your virtual receptionist with your business details, services, and custom greeting. Test it before going live.",
                step: "Receptionist > Configuration"
              },
              {
                icon: BookOpen,
                title: "Train Your Knowledge Base",
                description: "Scan your website or manually add FAQs, services, and pricing so the AI can answer questions accurately.",
                step: "Receptionist > Knowledge Base"
              },
              {
                icon: MessageSquare,
                title: "Set Up Notifications",
                description: "Configure SMS and email notifications for appointment confirmations, reminders, and invoice alerts.",
                step: "Settings > Notifications"
              },
              {
                icon: HelpCircle,
                title: "Create Your Booking Page",
                description: "Set up your public booking page where customers can see availability and book appointments online.",
                step: "Settings > Booking Page"
              }
            ].map((guide, i) => (
              <div key={i} className="flex gap-4 p-5 rounded-xl bg-neutral-900/50 border border-neutral-800">
                <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <guide.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">{guide.title}</h3>
                  <p className="text-sm text-neutral-400 mb-2">{guide.description}</p>
                  <p className="text-xs text-neutral-500 font-mono">{guide.step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto py-16">
          <h2 className="text-3xl font-bold text-center mb-4">Frequently Asked Questions</h2>
          <p className="text-neutral-400 text-center mb-12 max-w-2xl mx-auto">
            Find answers to common questions about using SmallBizAgent.
          </p>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FAQItem key={i} question={faq.question} answer={faq.answer} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-neutral-400 mb-4">Still have questions?</p>
            <Link href="/contact">
              <Button className="bg-white text-black hover:bg-neutral-200">
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-neutral-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <RobotLogo className="h-6 w-6 text-white" />
                <span className="font-bold">SMALLBIZ AGENT</span>
              </div>
            </Link>
            <div className="flex items-center gap-8 text-sm text-neutral-400">
              <Link href="/privacy"><span className="hover:text-white transition-colors cursor-pointer">Privacy</span></Link>
              <Link href="/terms"><span className="hover:text-white transition-colors cursor-pointer">Terms</span></Link>
              <span className="text-white font-medium">Support</span>
              <Link href="/contact"><span className="hover:text-white transition-colors cursor-pointer">Contact</span></Link>
            </div>
            <div className="text-sm text-neutral-500">
              &copy; {new Date().getFullYear()} SmallBizAgent. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
