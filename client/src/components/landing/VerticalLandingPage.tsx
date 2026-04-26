import { useEffect } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight,
  CheckCircle2,
  Phone,
  PhoneCall,
  Volume2,
  Mail,
  Instagram,
} from 'lucide-react';
import type { VerticalData } from '@/data/verticals';
import { verticalList } from '@/data/verticals';

/**
 * Shared landing page for vertical-specific marketing pages.
 *
 * Routes like `/for/barbershops`, `/for/hvac` etc. render this component
 * with their vertical data.
 *
 * Uses pages/landing.tsx as the structural reference but tailors copy + use
 * cases per vertical. Pricing and signup live on `/pricing` and `/auth` —
 * we don't duplicate those flows here. Conversion path:
 *   visitor → vertical hero → vertical demo → "why for vertical" → CTA → /auth
 */
export default function VerticalLandingPage({ vertical }: { vertical: VerticalData }) {
  useEffect(() => {
    document.title = `${vertical.seoTitle} | SmallBizAgent`;
    // Update meta description for SEO
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', vertical.seoDescription);
    } else {
      const tag = document.createElement('meta');
      tag.name = 'description';
      tag.content = vertical.seoDescription;
      document.head.appendChild(tag);
    }
  }, [vertical.seoTitle, vertical.seoDescription]);

  const otherVerticals = verticalList.filter((v) => v.slug !== vertical.slug);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav — minimal, links back to main landing */}
      <nav className="border-b border-neutral-800 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-40 bg-black/95 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <span className="text-xl font-bold cursor-pointer tracking-wide">SMALLBIZ AGENT</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/pricing">
              <span className="text-sm text-neutral-400 hover:text-white cursor-pointer hidden sm:inline">
                Pricing
              </span>
            </Link>
            <Link href="/#demo">
              <span className="text-sm text-neutral-400 hover:text-white cursor-pointer hidden sm:inline">
                Live Demo
              </span>
            </Link>
            <Link href="/auth">
              <Button
                size="sm"
                variant="outline"
                className="border-neutral-700 text-white hover:bg-neutral-800 hidden sm:inline-flex"
              >
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
      <section className="pt-16 sm:pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 mb-6">
            <span className="text-sm text-neutral-300">{vertical.microTagline}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            {vertical.heroLine1}
            <br />
            <span className="bg-gradient-to-r from-white via-neutral-300 to-neutral-500 bg-clip-text text-transparent">
              {vertical.heroLine2Highlight}
            </span>
            <br />
            {vertical.heroLine3}
          </h1>
          <p className="text-lg sm:text-xl text-neutral-400 mb-10 max-w-2xl mx-auto">
            {vertical.heroSubhead}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth">
              <Button
                size="lg"
                className="bg-white text-black hover:bg-neutral-200 px-8 py-6 text-lg"
              >
                Start My 14-Day Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/#demo">
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-neutral-700 text-white hover:bg-neutral-900 hover:text-white px-8 py-6 text-lg"
              >
                <PhoneCall className="mr-2 h-5 w-5" />
                Hear a Live Demo
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-neutral-500">
            No credit card required. Live in 2 minutes. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Pain section — "sound familiar?" */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-neutral-950">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-10 text-center">
            {vertical.painHeadline}
          </h2>
          <div className="space-y-4 max-w-2xl mx-auto">
            {vertical.painPoints.map((point, i) => (
              <div key={i} className="flex items-start gap-3 text-neutral-300">
                <div className="h-2 w-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo conversation */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-4">
              <Volume2 className="h-4 w-4 text-green-400" />
              <span className="text-sm text-green-400">{vertical.demoHeader}</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Hear how it sounds in your shop.</h2>
          </div>
          <div className="max-w-2xl mx-auto">
            <div className="bg-neutral-950 rounded-2xl p-6 border border-neutral-800">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-neutral-800">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
              </div>
              <div className="space-y-3 font-mono text-sm">
                {vertical.demoConversation.map((line, i) => (
                  <div key={i} className="bg-neutral-900 rounded-lg p-3">
                    <span
                      className={
                        line.speaker === 'AI' ? 'text-green-400' : 'text-blue-400'
                      }
                    >
                      {line.speaker}:
                    </span>
                    <span className="text-white ml-2">{line.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-center text-neutral-500 text-sm mt-4">
              Try a real call yourself —{' '}
              <Link href="/#demo">
                <span className="text-green-400 hover:text-green-300 cursor-pointer underline">
                  call our demo line
                </span>
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-neutral-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Real {vertical.namePlural} use it for...
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {vertical.useCases.map((uc, i) => (
              <div
                key={i}
                className="bg-neutral-900 rounded-xl p-6 border border-neutral-800"
              >
                <h3 className="font-semibold text-white mb-2">{uc.scenario}</h3>
                <p className="text-neutral-400 text-sm">{uc.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why for this vertical */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built for {vertical.namePlural}
            </h2>
            <p className="text-neutral-400 text-lg">
              Not a generic chatbot. An AI receptionist trained on your industry.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {vertical.whyReasons.map((r, i) => (
              <Card key={i} className="bg-neutral-900 border-neutral-800">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-6 w-6 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{r.title}</h3>
                  <p className="text-neutral-400 text-sm">{r.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 text-center bg-neutral-950">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to stop missing calls?
          </h2>
          <p className="text-neutral-400 text-lg mb-8">
            14-day free trial. No credit card required. Live in 2 minutes.
          </p>
          <Link href="/auth">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-neutral-200 px-8 py-6 text-lg"
            >
              Start My 14-Day Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <div className="mt-8 flex items-center justify-center gap-4 text-sm text-neutral-500">
            <Link href="/pricing">
              <span className="hover:text-white cursor-pointer">See pricing</span>
            </Link>
            <span>·</span>
            <Link href="/#demo">
              <span className="hover:text-white cursor-pointer">Hear a live demo</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Cross-link to other verticals (helps SEO + helps visitors who landed wrong) */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 border-t border-neutral-800">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm text-neutral-500 mb-4">
            Also built for these service businesses:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {otherVerticals.map((v) => (
              <Link key={v.slug} href={`/for/${v.slug}`}>
                <span className="px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-sm text-neutral-300 hover:text-white hover:border-neutral-700 cursor-pointer transition-colors">
                  {v.namePlural.charAt(0).toUpperCase() + v.namePlural.slice(1)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-lg border-t border-neutral-800 px-4 py-3">
        <Link href="/auth" className="block">
          <Button className="w-full bg-white text-black hover:bg-neutral-200 py-5 text-base font-semibold">
            Start My 14-Day Free Trial
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
        <p className="text-center text-xs text-neutral-500 mt-1.5">
          No credit card required
        </p>
      </div>

      {/* Footer */}
      <footer className="border-t border-neutral-800 py-8 px-4 sm:px-6 lg:px-8 pb-32 md:pb-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
          <span>&copy; {new Date().getFullYear()} SmallBizAgent. All rights reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a
              href="mailto:bark@smallbizagent.ai"
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
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
            <Link href="/privacy">
              <span className="hover:text-white cursor-pointer">Privacy</span>
            </Link>
            <Link href="/terms">
              <span className="hover:text-white cursor-pointer">Terms</span>
            </Link>
            <Link href="/support">
              <span className="hover:text-white cursor-pointer">Support</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
