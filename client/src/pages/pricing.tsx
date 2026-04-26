import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Phone, ArrowRight, Zap, Shield, Clock, Mail, Instagram } from "lucide-react";

const plans = [
  {
    name: "Starter",
    monthlyPrice: "$149",
    annualPrice: "$119",
    annualTotal: "$1,429/yr",
    annualSavings: "$359/yr",
    description: "Perfect for solo operators",
    minutes: "150 AI receptionist min/mo",
    overage: "$0.20/min overage",
    features: [
      "24/7 AI voice receptionist",
      "150 AI receptionist minutes/mo",
      "Unlimited customers",
      "Appointment scheduling",
      "Invoicing & payments (Stripe)",
      "Email reminders",
      "Public booking page",
      "Basic analytics",
    ],
    cta: "Start with Starter",
    popular: false,
  },
  {
    name: "Growth",
    monthlyPrice: "$299",
    annualPrice: "$239",
    annualTotal: "$2,869/yr",
    annualSavings: "$719/yr",
    description: "Most popular for growing businesses",
    minutes: "300 AI receptionist min/mo",
    overage: "$0.15/min overage",
    features: [
      "24/7 AI voice receptionist",
      "300 AI receptionist minutes/mo",
      "Everything in Starter, plus:",
      "SMS automation suite (7 AI agents)",
      "Google Business Profile sync",
      "Calendar sync (Google, Apple, Microsoft)",
      "Staff scheduling (up to 5)",
      "Customer intelligence & insights",
      "Advanced analytics + call transcripts",
      "Workflow automation builder",
    ],
    cta: "Try Growth Free",
    popular: true,
  },
  {
    name: "Pro",
    monthlyPrice: "$449",
    annualPrice: "$359",
    annualTotal: "$4,309/yr",
    annualSavings: "$1,079/yr",
    description: "For established businesses",
    minutes: "500 AI receptionist min/mo",
    overage: "$0.10/min overage",
    features: [
      "24/7 AI voice receptionist",
      "500 AI receptionist minutes/mo",
      "Everything in Growth, plus:",
      "Up to 3 locations",
      "Up to 15 staff members",
      "API access & webhooks",
      "Custom AI receptionist training",
      "Dedicated onboarding",
      "Priority support",
      "White-label ready",
    ],
    cta: "Go Pro",
    popular: false,
  },
];

const faqs = [
  {
    q: "What happens when my AI minutes run out?",
    a: "Your AI receptionist keeps answering calls. Additional minutes are billed at your plan's overage rate: $0.20/min on Starter, $0.15/min on Growth, $0.10/min on Pro. No service interruption ever.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrade or downgrade anytime. Changes are prorated to the day.",
  },
  {
    q: "What's included in the free trial?",
    a: "Full access to your selected plan for 14 days. No credit card required. Your own dedicated AI phone number provisioned immediately.",
  },
  {
    q: "Do I keep my phone number if I cancel?",
    a: "Your number is held in a 30-day grace period. Resubscribe within 30 days and everything is restored. After 30 days, the number is released.",
  },
  {
    q: "What industries do you support?",
    a: "15+ service verticals: salons, barbershops, HVAC, plumbing, electrical, dental, auto repair, restaurants, landscaping, cleaning, construction, medical, veterinary, fitness, and more.",
  },
  {
    q: "How does the AI receptionist learn my business?",
    a: "During setup, we pull your services, hours, staff, and pricing. You can add custom knowledge base entries. The AI also learns from every call — analyzing patterns and automatically improving its responses over time.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  useEffect(() => {
    document.title = "Pricing - SmallBizAgent | AI Receptionist for Small Businesses";
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-neutral-800 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <span className="text-xl font-bold cursor-pointer">SmallBizAgent</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/#demo">
              <span className="text-sm text-neutral-400 hover:text-white cursor-pointer hidden sm:inline">Live Demo</span>
            </Link>
            <Link href="/#features">
              <span className="text-sm text-neutral-400 hover:text-white cursor-pointer hidden sm:inline">Features</span>
            </Link>
            <Link href="/auth">
              <Button size="sm" variant="outline" className="border-neutral-700 text-white hover:bg-neutral-800">
                Sign In
              </Button>
            </Link>
            <Link href="/auth">
              <Button size="sm" className="bg-white text-black hover:bg-neutral-200">
                Start Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-neutral-400 text-lg mb-2 max-w-2xl mx-auto">
          One platform. One price. No per-message fees, no hidden charges.
        </p>
        <p className="text-green-400 font-medium mb-8">
          14-day free trial. No credit card required.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-full p-1 mb-12">
          <button
            onClick={() => setAnnual(false)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              !annual ? "bg-white text-black" : "text-neutral-400 hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              annual ? "bg-white text-black" : "text-neutral-400 hover:text-white"
            }`}
          >
            Annual <span className="text-green-500 ml-1">Save 20%</span>
          </button>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <Card
              key={i}
              className={`relative bg-neutral-900 border-neutral-800 text-left ${
                plan.popular ? "border-white ring-1 ring-white" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-white text-black text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <CardContent className="p-6">
                <div className="text-lg font-semibold text-white mb-2">{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold text-white">
                    {annual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-neutral-500">/month</span>
                </div>
                {annual && (
                  <div className="text-xs text-green-500 mb-2">
                    Billed annually at {plan.annualTotal} • Save {plan.annualSavings}
                  </div>
                )}
                <p className="text-sm text-neutral-400 mb-2">{plan.description}</p>
                <div className="flex items-center gap-1.5 text-sm font-medium text-white mb-1">
                  <Phone className="h-4 w-4 text-green-400" />
                  <span>{plan.minutes}</span>
                </div>
                <p className="text-xs text-neutral-500 mb-6">{plan.overage}</p>
                <Link href="/auth">
                  <Button
                    className={`w-full ${
                      plan.popular
                        ? "bg-white text-black hover:bg-neutral-200"
                        : "bg-neutral-800 text-white hover:bg-neutral-700"
                    }`}
                  >
                    {plan.cta} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-neutral-300">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Comparison to alternatives */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-neutral-800">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Why businesses switch to SmallBizAgent</h2>
        </div>
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-4">
              <Zap className="h-6 w-6 text-green-400" />
            </div>
            <h3 className="font-semibold mb-2">No hidden fees</h3>
            <p className="text-sm text-neutral-400">
              Other tools nickel-and-dime you for SMS, AI minutes, and emails. We bundle everything into one flat price.
            </p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-4">
              <Shield className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="font-semibold mb-2">AI that knows your industry</h3>
            <p className="text-sm text-neutral-400">
              15 industry-specific AI personalities. When a caller says "gimme a lineup" our AI knows that's an edge-up at the barbershop.
            </p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mb-4">
              <Clock className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="font-semibold mb-2">Live in 2 minutes</h3>
            <p className="text-sm text-neutral-400">
              Express onboarding gets you a dedicated phone number and AI receptionist in under 2 minutes. No implementation fees.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-neutral-800">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">Frequently asked questions</h2>
          <div className="space-y-6">
            {faqs.map((faq, i) => (
              <div key={i} className="border-b border-neutral-800 pb-6">
                <h3 className="font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-sm text-neutral-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 text-center border-t border-neutral-800">
        <h2 className="text-3xl font-bold mb-4">Ready to never miss a call again?</h2>
        <p className="text-neutral-400 mb-8">Start your 14-day free trial. No credit card required.</p>
        <Link href="/auth">
          <Button size="lg" className="bg-white text-black hover:bg-neutral-200 px-8">
            Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
          <span>&copy; {new Date().getFullYear()} SmallBizAgent. All rights reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="mailto:bark@smallbizagent.ai" className="inline-flex items-center gap-1.5 hover:text-white">
              <Mail className="h-3.5 w-3.5" />
              bark@smallbizagent.ai
            </a>
            <a
              href="https://instagram.com/smallbizagent"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              <Instagram className="h-3.5 w-3.5" />
              @smallbizagent
            </a>
            <Link href="/privacy"><span className="hover:text-white cursor-pointer">Privacy</span></Link>
            <Link href="/terms"><span className="hover:text-white cursor-pointer">Terms</span></Link>
            <Link href="/support"><span className="hover:text-white cursor-pointer">Support</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
