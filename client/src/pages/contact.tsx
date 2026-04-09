import { Link } from "wouter";
import { ArrowLeft, Mail, MapPin, Clock, Send, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

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

export default function ContactPage() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          message: formData.message,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to send message");
      }

      toast({
        title: "Message sent!",
        description: data.message || "We'll get back to you soon.",
      });
      setIsSubmitted(true);
    } catch (error: any) {
      toast({
        title: "Failed to send message",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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

      {/* Content */}
      <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Get in Touch</h1>
            <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
              Have a question, need help, or want to learn more about SmallBizAgent?
              We'd love to hear from you.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-12">
            {/* Contact Form */}
            <div className="md:col-span-3">
              {isSubmitted ? (
                <Card className="bg-neutral-900 border-neutral-800">
                  <CardContent className="p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 className="h-8 w-8 text-green-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3">Message Sent!</h2>
                    <p className="text-neutral-400 mb-6">
                      Thank you for reaching out. We've received your message and will
                      get back to you within 24 hours. You can also reach us directly at{" "}
                      <a href="mailto:Bark@smallbizagent.ai" className="text-blue-400 hover:text-blue-300">
                        Bark@smallbizagent.ai
                      </a>
                    </p>
                    <Button
                      variant="outline"
                      className="border-neutral-700 text-white hover:bg-neutral-800"
                      onClick={() => {
                        setIsSubmitted(false);
                        setFormData({ name: "", email: "", subject: "", message: "" });
                      }}
                    >
                      Send Another Message
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-neutral-900 border-neutral-800">
                  <CardContent className="p-8">
                    <h2 className="text-xl font-semibold text-white mb-6">Send Us a Message</h2>
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="name" className="text-neutral-300 text-sm">Your Name</Label>
                          <Input
                            id="name"
                            required
                            placeholder="John Smith"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            className="mt-1.5 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                          />
                        </div>
                        <div>
                          <Label htmlFor="email" className="text-neutral-300 text-sm">Email Address</Label>
                          <Input
                            id="email"
                            type="email"
                            required
                            placeholder="john@example.com"
                            value={formData.email}
                            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            className="mt-1.5 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="subject" className="text-neutral-300 text-sm">Subject</Label>
                        <Input
                          id="subject"
                          required
                          placeholder="How can we help?"
                          value={formData.subject}
                          onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                          className="mt-1.5 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500"
                        />
                      </div>
                      <div>
                        <Label htmlFor="message" className="text-neutral-300 text-sm">Message</Label>
                        <textarea
                          id="message"
                          required
                          rows={6}
                          placeholder="Tell us what you need help with..."
                          value={formData.message}
                          onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                          className="mt-1.5 w-full rounded-md bg-neutral-800 border border-neutral-700 text-white placeholder:text-neutral-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-white text-black hover:bg-neutral-200"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          "Sending..."
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Message
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Contact Info Sidebar */}
            <div className="md:col-span-2 space-y-6">
              <Card className="bg-neutral-900 border-neutral-800">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">Email Us</h3>
                      <a href="mailto:Bark@smallbizagent.ai" className="text-blue-400 hover:text-blue-300 text-sm">
                        Bark@smallbizagent.ai
                      </a>
                      <p className="text-xs text-neutral-500 mt-1">We typically respond within 24 hours</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-neutral-900 border-neutral-800">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <Clock className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">Support Hours</h3>
                      <p className="text-sm text-neutral-300">Monday - Friday</p>
                      <p className="text-sm text-neutral-300">9:00 AM - 6:00 PM EST</p>
                      <p className="text-xs text-neutral-500 mt-1">Priority support for paid plans</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-neutral-900 border-neutral-800">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">Location</h3>
                      <p className="text-sm text-neutral-300">United States</p>
                      <p className="text-xs text-neutral-500 mt-1">Serving small businesses nationwide</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 rounded-xl p-6 border border-neutral-800">
                <h3 className="font-semibold text-white mb-3">Common Inquiries</h3>
                <ul className="space-y-2 text-sm text-neutral-400">
                  <li className="flex items-start gap-2">
                    <span className="text-neutral-600 mt-0.5">&#8226;</span>
                    <span>Account setup and onboarding help</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-neutral-600 mt-0.5">&#8226;</span>
                    <span>AI receptionist configuration</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-neutral-600 mt-0.5">&#8226;</span>
                    <span>Billing and subscription questions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-neutral-600 mt-0.5">&#8226;</span>
                    <span>Feature requests and feedback</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-neutral-600 mt-0.5">&#8226;</span>
                    <span>Partnership and integration inquiries</span>
                  </li>
                </ul>
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <Link href="/support">
                    <span className="text-sm text-blue-400 hover:text-blue-300 cursor-pointer">
                      Check our FAQ for instant answers →
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

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
              <Link href="/support"><span className="hover:text-white transition-colors cursor-pointer">Support</span></Link>
              <span className="text-white font-medium">Contact</span>
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
