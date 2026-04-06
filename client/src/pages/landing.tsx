import { useState, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { Turnstile } from "@/components/ui/turnstile";
import {
  Phone,
  Calendar,
  Users,
  FileText,
  Bot,
  Clock,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
  Shield,
  MessageSquare,
  Loader2,
  AlertCircle,
  PhoneCall,
  Play,
  Headphones,
  Volume2
} from "lucide-react";

// Robot Logo SVG matching the SmallBizAgent brand
const RobotLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
    {/* Antenna */}
    <rect x="47" y="5" width="6" height="10" rx="3" />
    <circle cx="50" cy="5" r="4" />
    {/* Head */}
    <rect x="25" y="18" width="50" height="40" rx="12" />
    {/* Visor */}
    <rect x="30" y="28" width="40" height="15" rx="7" fill="black" />
    {/* Eyes */}
    <circle cx="40" cy="35" r="5" fill="white" />
    <circle cx="60" cy="35" r="5" fill="white" />
    {/* Smile */}
    <path d="M 38 48 Q 50 55 62 48" stroke="black" strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* Body */}
    <path d="M 32 58 L 32 75 Q 32 82 39 82 L 61 82 Q 68 82 68 75 L 68 58" />
    {/* Chest detail */}
    <path d="M 42 62 L 50 68 L 58 62" stroke="black" strokeWidth="2" fill="none" />
    {/* Arms */}
    <ellipse cx="20" cy="65" rx="8" ry="12" />
    <ellipse cx="80" cy="65" rx="8" ry="12" />
    <circle cx="20" cy="78" r="5" />
    <circle cx="80" cy="78" r="5" />
    {/* Legs */}
    <rect x="36" y="82" width="10" height="12" rx="3" />
    <rect x="54" y="82" width="10" height="12" rx="3" />
  </svg>
);

const features = [
  {
    icon: Bot,
    title: "AI Receptionist",
    description: "Never miss a call. Our AI answers 24/7, books appointments, and handles inquiries just like your best employee."
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Online booking that syncs with your calendar. Automatic reminders reduce no-shows by up to 50%."
  },
  {
    icon: Users,
    title: "Customer Management",
    description: "Keep all customer info, history, and notes in one place. Build relationships that last."
  },
  {
    icon: FileText,
    title: "Invoicing & Payments",
    description: "Create professional invoices in seconds. Get paid faster with online payment links."
  },
  {
    icon: MessageSquare,
    title: "Automated Reminders",
    description: "SMS and email reminders sent automatically. Keep your schedule full and customers informed."
  },
  {
    icon: Zap,
    title: "Job Tracking",
    description: "Track jobs from start to finish. Add line items, photos, and notes all in one place."
  }
];

const whyReasons = [
  {
    icon: Phone,
    title: "Never Miss Another Call",
    description: "Your AI receptionist picks up every call, 24/7 — even nights, weekends, and holidays. Callers get a real conversation, not a voicemail."
  },
  {
    icon: Clock,
    title: "Get Your Time Back",
    description: "Stop juggling phone calls while you're with clients. Your AI handles bookings, answers FAQs, and routes urgent calls to you."
  },
  {
    icon: Shield,
    title: "Built for Small Business",
    description: "No complex setup or IT team required. Connect your phone number, train your AI on your services, and you're live."
  }
];

const pricingPlans = [
  {
    name: "Starter",
    monthlyPrice: "$149",
    annualPrice: "$119",
    annualTotal: "$1,429/yr",
    description: "Perfect for solo operators",
    minutes: "150 AI receptionist min/mo",
    overage: "$0.05/min overage",
    features: [
      "150 AI receptionist minutes/mo",
      "Unlimited customers",
      "Appointment scheduling",
      "Invoicing & payments",
      "Email reminders",
      "Public booking page",
      "Basic analytics"
    ],
    cta: "Start Free Trial",
    popular: false
  },
  {
    name: "Growth",
    monthlyPrice: "$299",
    annualPrice: "$239",
    annualTotal: "$2,869/yr",
    description: "Most popular for growing businesses",
    minutes: "300 AI receptionist min/mo",
    overage: "$0.05/min overage",
    features: [
      "300 AI receptionist minutes/mo",
      "Everything in Starter, plus:",
      "SMS automation suite",
      "Google Business Profile sync",
      "Calendar sync (Google, Apple, Microsoft)",
      "Staff scheduling (up to 5)",
      "Website chat widget",
      "Advanced analytics + call transcripts",
      { text: "QuickBooks integration", comingSoon: true }
    ],
    cta: "Start Free Trial",
    popular: true
  },
  {
    name: "Pro",
    monthlyPrice: "$449",
    annualPrice: "$359",
    annualTotal: "$4,309/yr",
    description: "For established businesses",
    minutes: "500 AI receptionist min/mo",
    overage: "$0.05/min overage",
    features: [
      "500 AI receptionist minutes/mo",
      "Everything in Growth, plus:",
      "Up to 3 locations",
      "Up to 15 staff members",
      "API access & webhooks",
      "Custom AI receptionist training",
      "Dedicated onboarding",
      "Priority support",
      "White-label ready",
      { text: "Social media content pipeline", comingSoon: true }
    ],
    cta: "Start Free Trial",
    popular: false
  }
];

function LandingAuthForm() {
  const [activeTab, setActiveTab] = useState<string>("register");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const { loginMutation, registerMutation } = useAuth();


  // Login form state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (loginUsername.length < 3) {
      setLoginError("Username must be at least 3 characters");
      return;
    }
    if (loginPassword.length < 6) {
      setLoginError("Password must be at least 6 characters");
      return;
    }
    loginMutation.mutate(
      { username: loginUsername.trim(), password: loginPassword, turnstileToken },
      {
        onSuccess: () => {
              window.location.href = "/";
            },
        onError: (error: Error) => {
          if (error.message.includes("Invalid") || error.message.includes("401")) {
            setLoginError("Invalid username or password.");
          } else {
            setLoginError(error.message);
          }
        },
      }
    );
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    if (regUsername.length < 3) {
      setRegisterError("Username must be at least 3 characters");
      return;
    }
    if (!regEmail.includes("@")) {
      setRegisterError("Please enter a valid email");
      return;
    }
    if (regPassword.length < 12) {
      setRegisterError("Password must be at least 12 characters");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegisterError("Passwords do not match");
      return;
    }
    registerMutation.mutate(
      { username: regUsername, email: regEmail, password: regPassword, turnstileToken },
      {
        onSuccess: () => {
          window.location.href = "/onboarding/subscription";
        },
        onError: (error: Error) => {
          setRegisterError(error.message);
        },
      }
    );
  };

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-4">
        <CardTitle className="text-white text-xl">Get Started</CardTitle>
        <CardDescription className="text-neutral-400">
          Create an account or sign in
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 bg-neutral-800">
            <TabsTrigger value="register" className="data-[state=active]:bg-white data-[state=active]:text-black">
              Sign Up
            </TabsTrigger>
            <TabsTrigger value="login" className="data-[state=active]:bg-white data-[state=active]:text-black">
              Login
            </TabsTrigger>
          </TabsList>

          <TabsContent value="register" className="mt-4">
            <form onSubmit={handleRegister} className="space-y-3" autoComplete="off">
              {registerError && (
                <Alert variant="destructive" className="border-red-800 bg-red-900/30">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{registerError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Label htmlFor="reg-username" className="text-neutral-300 text-sm">Username</Label>
                <Input
                  id="reg-username"
                  placeholder="yourname"
                  value={regUsername}
                  onChange={(e) => { setRegisterError(null); setRegUsername(e.target.value); }}
                  className="mt-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                />
              </div>
              <div>
                <Label htmlFor="reg-email" className="text-neutral-300 text-sm">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => { setRegisterError(null); setRegEmail(e.target.value); }}
                  className="mt-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                />
              </div>
              <div>
                <Label htmlFor="reg-password" className="text-neutral-300 text-sm">Password</Label>
                <Input
                  id="reg-password"
                  name="reg-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={regPassword}
                  onChange={(e) => { setRegisterError(null); setRegPassword(e.target.value); }}
                  className="mt-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                />
                <p className="text-xs text-neutral-500 mt-1">12+ chars, uppercase, lowercase, number, special char</p>
              </div>
              <div>
                <Label htmlFor="reg-confirm" className="text-neutral-300 text-sm">Confirm Password</Label>
                <Input
                  id="reg-confirm"
                  name="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={regConfirmPassword}
                  onChange={(e) => { setRegisterError(null); setRegConfirmPassword(e.target.value); }}
                  className="mt-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                />
              </div>
              <Turnstile onVerify={setTurnstileToken} onExpire={handleTurnstileExpire} />
              <Button type="submit" className="w-full bg-white text-black hover:bg-neutral-200" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</>
                ) : (
                  <>Start Free Trial <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="login" className="mt-4">
            <form onSubmit={handleLogin} className="space-y-3">
              {loginError && (
                <Alert variant="destructive" className="border-red-800 bg-red-900/30">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Label htmlFor="login-username" className="text-neutral-300 text-sm">Username</Label>
                <Input
                  id="login-username"
                  name="login-username"
                  autoComplete="username"
                  placeholder="yourname"
                  value={loginUsername}
                  onChange={(e) => { setLoginError(null); setLoginUsername(e.target.value); }}
                  className="mt-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                />
              </div>
              <div>
                <Label htmlFor="login-password" className="text-neutral-300 text-sm">Password</Label>
                <Input
                  id="login-password"
                  name="login-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => { setLoginError(null); setLoginPassword(e.target.value); }}
                  className="mt-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                />
              </div>
              <Turnstile onVerify={setTurnstileToken} onExpire={handleTurnstileExpire} />
              <Button type="submit" className="w-full bg-white text-black hover:bg-neutral-200" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</>
                ) : (
                  "Sign In"
                )}
              </Button>
              <div className="text-center">
                <Link href="/reset-password">
                  <span className="text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer">
                    Forgot password?
                  </span>
                </Link>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="border-t border-neutral-800 pt-4">
        <p className="text-xs text-neutral-500 text-center w-full">
          By continuing, you agree to our{" "}
          <Link href="/terms"><span className="text-neutral-400 hover:text-white underline cursor-pointer">Terms of Service</span></Link>
          {" "}and{" "}
          <Link href="/privacy"><span className="text-neutral-400 hover:text-white underline cursor-pointer">Privacy Policy</span></Link>.
        </p>
      </CardFooter>
    </Card>
  );
}

function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-neutral-950">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-neutral-400 text-lg mb-2">
            14-day free trial. Cancel anytime before you're charged.
          </p>
          <p className="text-neutral-500 text-sm mb-8">
            Card required at signup. You won't be billed until after your trial ends.
          </p>
          <div className="inline-flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-full p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                !annual ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                annual ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Annual <span className="text-green-500 ml-1">Save 20%</span>
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {pricingPlans.map((plan, i) => (
            <Card
              key={i}
              className={`relative bg-neutral-900 border-neutral-800 ${
                plan.popular ? 'border-white ring-1 ring-white' : ''
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
                    Billed annually at {plan.annualTotal}
                  </div>
                )}
                <p className="text-sm text-neutral-400 mb-2">{plan.description}</p>
                <div className="flex items-center gap-1.5 text-sm font-medium text-white mb-1">
                  <Phone className="h-4 w-4 text-green-400" />
                  <span>{plan.minutes}</span>
                </div>
                <p className="text-xs text-neutral-500 mb-6">{plan.overage}</p>
                <a href="#get-started">
                  <Button
                    className={`w-full ${
                      plan.popular
                        ? 'bg-white text-black hover:bg-neutral-200'
                        : 'bg-neutral-800 text-white hover:bg-neutral-700'
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </a>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature, j) => {
                    const isComingSoon = typeof feature === 'object' && feature.comingSoon;
                    const text = typeof feature === 'object' ? feature.text : feature;
                    return (
                      <li key={j} className={`flex items-center gap-2 text-sm ${isComingSoon ? 'text-neutral-500' : 'text-neutral-300'}`}>
                        {isComingSoon ? (
                          <div className="h-4 w-4 rounded-full border border-neutral-600 flex-shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                        {text}
                        {isComingSoon && (
                          <span className="text-xs bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded ml-1">Coming Soon</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <RobotLogo className="h-8 w-8 text-white" />
              <span className="text-lg font-bold tracking-wide">SMALLBIZ AGENT</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-neutral-400 hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="text-sm text-neutral-400 hover:text-white transition-colors">Pricing</a>
              <a href="#why" className="text-sm text-neutral-400 hover:text-white transition-colors">Why Us</a>
            </div>
            <div className="flex items-center gap-4">
              <a href="#get-started">
                <Button variant="ghost" className="text-neutral-400 hover:text-white">
                  Login
                </Button>
              </a>
              <a href="#get-started">
                <Button className="bg-white text-black hover:bg-neutral-200">
                  Get Started
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 mb-8">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-neutral-300">AI-Powered Business Management</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              Your Business,
              <br />
              <span className="bg-gradient-to-r from-white via-neutral-300 to-neutral-500 bg-clip-text text-transparent">
                On Autopilot
              </span>
            </h1>
            <p className="text-xl text-neutral-400 mb-10 max-w-2xl mx-auto">
              The all-in-one platform that handles your calls, books your appointments,
              and manages your customers — so you can focus on what you do best.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="#get-started">
                <Button size="lg" className="bg-white text-black hover:bg-neutral-200 px-8 py-6 text-lg">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <a href="#demo">
                <Button size="lg" variant="outline" className="bg-transparent border-neutral-700 text-white hover:bg-neutral-900 hover:text-white px-8 py-6 text-lg">
                  <PhoneCall className="mr-2 h-5 w-5" />
                  Hear a Live Demo
                </Button>
              </a>
            </div>
            <p className="mt-6 text-sm text-neutral-500">
              14-day free trial. Cancel anytime before you're charged.
            </p>
          </div>

          {/* Value Props */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              { value: "24/7", label: "AI Availability" },
              { value: "0", label: "Missed Calls" },
              { value: "50%", label: "Fewer No-Shows" },
              { value: "<15 min", label: "Setup Time" }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-neutral-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Try It Live Demo Section */}
      <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-black via-neutral-950 to-black">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <Volume2 className="h-4 w-4 text-green-400" />
              <span className="text-sm text-green-400">Live Demo</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Don't take our word for it.
              <br />
              <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                Call and hear it yourself.
              </span>
            </h2>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
              Call our demo number right now. Ask about pricing, try to book an appointment,
              or ask anything — just like a real customer would.
            </p>
          </div>

          {/* Demo Phone CTA */}
          <div className="max-w-xl mx-auto mb-16">
            <div className="bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-green-500/10 rounded-2xl p-8 border border-green-500/20 text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-500/20 mb-4">
                <PhoneCall className="h-8 w-8 text-green-400" />
              </div>
              <div className="text-sm text-green-400 uppercase tracking-wider font-semibold mb-2">
                Call our AI receptionist now
              </div>
              <a
                href={`tel:${import.meta.env.VITE_DEMO_PHONE_NUMBER || '+17324020884'}`}
                className="text-4xl md:text-5xl font-bold text-white hover:text-green-400 transition-colors"
              >
                {import.meta.env.VITE_DEMO_PHONE_NUMBER
                  ? import.meta.env.VITE_DEMO_PHONE_NUMBER.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '($2) $3-$4')
                  : '(732) 402-0884'}
              </a>
              <p className="text-neutral-500 text-sm mt-3">
                Available 24/7. Try booking an appointment or asking about services.
              </p>
              <a href={`tel:${import.meta.env.VITE_DEMO_PHONE_NUMBER || '+17324020884'}`}>
                <Button size="lg" className="mt-6 bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg">
                  <Phone className="mr-2 h-5 w-5" />
                  Call Now
                </Button>
              </a>
            </div>
          </div>

          {/* Sample Calls */}
          <div className="text-center mb-8">
            <h3 className="text-xl font-semibold text-neutral-300 mb-2">
              <Headphones className="inline h-5 w-5 mr-2" />
              Or listen to real sample calls
            </h3>
            <p className="text-neutral-500 text-sm">
              Hear how the AI handles different scenarios across industries
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                industry: "Plumbing",
                scenario: "Emergency drain repair booking",
                icon: "🔧",
                description: "Customer calls at 8 PM about a clogged drain. AI checks availability and books a morning appointment.",
              },
              {
                industry: "Salon",
                scenario: "New client booking a haircut",
                icon: "💇",
                description: "First-time caller asks about services and pricing. AI walks them through options and books a slot.",
              },
              {
                industry: "HVAC",
                scenario: "AC unit not cooling",
                icon: "❄️",
                description: "Frustrated caller with a broken AC in summer. AI handles the urgency and schedules a technician.",
              },
            ].map((sample, i) => (
              <div
                key={i}
                className="bg-neutral-900 rounded-xl p-6 border border-neutral-800 hover:border-neutral-700 transition-colors"
              >
                <div className="text-3xl mb-3">{sample.icon}</div>
                <div className="text-sm text-neutral-500 uppercase tracking-wider mb-1">{sample.industry}</div>
                <h4 className="font-semibold text-white mb-2">{sample.scenario}</h4>
                <p className="text-neutral-400 text-sm mb-4">{sample.description}</p>
                {/* Audio player placeholder — replace src with real recordings */}
                <div className="bg-neutral-950 rounded-lg p-3 border border-neutral-800">
                  <div className="flex items-center gap-3">
                    <button className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0">
                      <Play className="h-4 w-4 text-white ml-0.5" />
                    </button>
                    <div className="flex-1">
                      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: '0%' }} />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-neutral-600">
                        <span>0:00</span>
                        <span>Coming soon</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-neutral-600 text-sm">
              All demo calls use our standard AI receptionist. Your business gets a custom-trained version.
            </p>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-neutral-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Tired of missing calls while you're with clients?
              </h2>
              <p className="text-neutral-400 text-lg mb-8">
                Every missed call is a missed opportunity. But you can't be on the phone
                when you're cutting hair, fixing pipes, or cleaning homes.
              </p>
              <div className="space-y-4">
                {[
                  "Missed calls costing you thousands in lost business",
                  "Double-bookings and scheduling headaches",
                  "Chasing invoices and late payments",
                  "Customers forgetting appointments"
                ].map((problem, i) => (
                  <div key={i} className="flex items-center gap-3 text-neutral-300">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    {problem}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 rounded-2xl p-8 border border-neutral-800">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center">
                  <RobotLogo className="h-8 w-8 text-black" />
                </div>
                <div>
                  <div className="font-semibold">SmallBiz Agent</div>
                  <div className="text-sm text-neutral-500">Your AI-powered solution</div>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  "AI answers every call, 24/7/365",
                  "Automatic scheduling that prevents conflicts",
                  "Get paid faster with online invoicing",
                  "SMS reminders that reduce no-shows 50%"
                ].map((solution, i) => (
                  <div key={i} className="flex items-center gap-3 text-neutral-300">
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                    {solution}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to run your business
            </h2>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
              One platform that replaces your receptionist, scheduler, CRM, and invoicing software.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <Card key={i} className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-colors">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-neutral-400">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AI Receptionist Highlight */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-black to-neutral-950">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-950 rounded-3xl p-8 md:p-12 border border-neutral-800">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm mb-6">
                  <Bot className="h-4 w-4" />
                  AI-Powered
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">
                  Meet your new receptionist. She never sleeps.
                </h2>
                <p className="text-neutral-400 text-lg mb-4">
                  Our AI receptionist answers calls just like a human. She knows your
                  services, checks availability, and books appointments — all without
                  you lifting a finger.
                </p>
                <a href="#demo" className="inline-flex items-center gap-2 text-green-400 hover:text-green-300 transition-colors text-sm font-medium mb-8">
                  <PhoneCall className="h-4 w-4" />
                  Call our demo to hear it in action
                  <ArrowRight className="h-3 w-3" />
                </a>
                <div className="space-y-4">
                  {[
                    { icon: Clock, text: "Available 24/7, even on holidays" },
                    { icon: MessageSquare, text: "Natural, conversational responses" },
                    { icon: Calendar, text: "Books directly into your calendar" },
                    { icon: Shield, text: "Trained on your business specifics" }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 text-neutral-400" />
                      <span className="text-neutral-300">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-3xl" />
                <div className="relative bg-black rounded-2xl p-6 border border-neutral-800">
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-neutral-800">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                  </div>
                  <div className="space-y-4 font-mono text-sm">
                    <div className="text-neutral-500">// Incoming call...</div>
                    <div className="bg-neutral-900 rounded-lg p-3">
                      <span className="text-green-400">AI:</span>
                      <span className="text-white ml-2">"Thanks for calling Mike's Plumbing! How can I help you today?"</span>
                    </div>
                    <div className="bg-neutral-900 rounded-lg p-3">
                      <span className="text-blue-400">Caller:</span>
                      <span className="text-white ml-2">"I need to schedule a drain cleaning."</span>
                    </div>
                    <div className="bg-neutral-900 rounded-lg p-3">
                      <span className="text-green-400">AI:</span>
                      <span className="text-white ml-2">"I'd be happy to help! We have openings tomorrow morning at 9 AM or afternoon at 2 PM. Which works better for you?"</span>
                    </div>
                    <div className="text-neutral-500">// Appointment booked automatically</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why SmallBizAgent */}
      <section id="why" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why SmallBizAgent?
            </h2>
            <p className="text-neutral-400 text-lg">
              Built from the ground up for service-based small businesses.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {whyReasons.map((reason, i) => (
              <Card key={i} className="bg-neutral-900 border-neutral-800">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                    <reason.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{reason.title}</h3>
                  <p className="text-neutral-400">{reason.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* Sign Up / Login Section */}
      <section id="get-started" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to put your business on autopilot?
              </h2>
              <p className="text-neutral-400 text-lg mb-8">
                Stop missing calls and losing customers. SmallBizAgent handles your
                phone, books your appointments, and manages your business — so you
                can focus on the work.
              </p>
              <div className="space-y-4">
                {[
                  "14-day free trial, cancel anytime",
                  "Set up in under 15 minutes",
                  "Cancel anytime, no questions asked",
                  "AI receptionist minutes included in every plan"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-neutral-300">
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <LandingAuthForm />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-neutral-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <RobotLogo className="h-6 w-6 text-white" />
              <span className="font-bold">SMALLBIZ AGENT</span>
            </div>
            <div className="flex items-center gap-8 text-sm text-neutral-400">
              <Link href="/privacy"><span className="hover:text-white transition-colors cursor-pointer">Privacy</span></Link>
              <Link href="/terms"><span className="hover:text-white transition-colors cursor-pointer">Terms</span></Link>
              <Link href="/sms-terms"><span className="hover:text-white transition-colors cursor-pointer">SMS Terms</span></Link>
              <Link href="/support"><span className="hover:text-white transition-colors cursor-pointer">Support</span></Link>
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
