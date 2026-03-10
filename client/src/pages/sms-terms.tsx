import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

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

export default function SmsTerms() {
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
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">SMS Terms & Conditions</h1>
          <p className="text-neutral-400 mb-12">Last updated: March 10, 2026</p>

          <div className="prose prose-invert max-w-none space-y-8">

            {/* Program Description */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Program Description</h2>
              <p className="text-neutral-300 leading-relaxed">
                SmallBizAgent is a business management platform that sends SMS text messages on behalf of
                small service businesses (salons, barbershops, HVAC, plumbing, restaurants, and more). By
                providing your phone number to a business that uses SmallBizAgent, you may receive text
                messages related to your interactions with that business.
              </p>
            </section>

            {/* Message Types */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Types of Messages</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">
                When you provide your phone number and consent, you may receive the following types of
                text messages:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Appointment Reminders:</strong> Reminders about upcoming appointments you have scheduled</li>
                <li><strong className="text-white">Reservation Confirmations:</strong> Confirmation of reservations you have made</li>
                <li><strong className="text-white">Missed Call Notifications:</strong> Text-back messages when a business misses your call</li>
                <li><strong className="text-white">Follow-Up Messages:</strong> Post-service follow-ups from businesses you have visited</li>
                <li><strong className="text-white">Booking Confirmations:</strong> Confirmation and details of appointments you have booked</li>
                <li><strong className="text-white">Marketing Messages:</strong> Promotional offers, win-back campaigns, review requests, and seasonal offers from businesses you have opted in to receive messages from</li>
                <li><strong className="text-white">Two-Factor Authentication:</strong> Verification codes for SmallBizAgent account security</li>
              </ul>
            </section>

            {/* Consent / Opt-In */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">How You Consent (Opt-In)</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">
                You consent to receive text messages through one or more of the following methods:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Online Booking:</strong> When you book an appointment or reservation through a SmallBizAgent-powered booking page and check the SMS consent checkbox</li>
                <li><strong className="text-white">Calling a Business:</strong> When you call a business using our platform and your call is missed, you may receive a transactional text-back notification (permitted under TCPA as a transactional message)</li>
                <li><strong className="text-white">In-Person Consent:</strong> When you provide your phone number and verbal or written consent directly to a business at their place of service</li>
                <li><strong className="text-white">Website Forms:</strong> When you provide your phone number through a business's website contact or intake form that includes SMS consent language</li>
                <li><strong className="text-white">Account Creation:</strong> When you create a SmallBizAgent account and provide your phone number, you consent to receive two-factor authentication codes</li>
              </ul>
              <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 mt-6">
                <p className="text-neutral-300 leading-relaxed">
                  <strong className="text-white">Important:</strong> Consent to receive messages is not a condition of purchase.
                  You are not required to consent to SMS messaging in order to purchase any goods or services from
                  businesses using SmallBizAgent.
                </p>
              </div>
            </section>

            {/* Message Frequency */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Message Frequency</h2>
              <p className="text-neutral-300 leading-relaxed">
                Message frequency varies based on your interactions with the business. For example, you may
                receive appointment reminders 24 hours before a scheduled visit, a follow-up message after
                your appointment, or periodic marketing messages if you have opted in. Typical message
                frequency ranges from 1 to 10 messages per month depending on your level of engagement
                with the business.
              </p>
            </section>

            {/* Message and Data Rates */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Message and Data Rates</h2>
              <p className="text-neutral-300 leading-relaxed">
                <strong className="text-white">Message and data rates may apply.</strong> Standard messaging
                rates from your wireless carrier will apply to messages you send and receive. Check with your
                mobile carrier for details about your messaging plan. SmallBizAgent is not responsible for any
                charges from your wireless provider.
              </p>
            </section>

            {/* Opt-Out — most critical section */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">How to Opt Out</h2>
              <div className="bg-neutral-900 border border-blue-800 rounded-xl p-6 mb-6">
                <p className="text-lg text-white font-semibold mb-3">
                  You can opt out of text messages at any time by replying <span className="text-blue-400 font-bold">STOP</span> to any message you receive.
                </p>
                <p className="text-neutral-300 leading-relaxed">
                  After replying STOP, you will receive one final confirmation message confirming that you
                  have been unsubscribed. You will not receive any additional messages unless you opt back in.
                </p>
              </div>
              <p className="text-neutral-300 leading-relaxed mb-4">
                The following keywords are recognized as opt-out requests and will immediately unsubscribe you:
              </p>
              <div className="flex flex-wrap gap-3 mb-6">
                {['STOP', 'STOPALL', 'CANCEL', 'END', 'QUIT', 'UNSUBSCRIBE', 'OPTOUT', 'REVOKE'].map((keyword) => (
                  <span key={keyword} className="bg-neutral-800 text-white px-4 py-2 rounded-full text-sm font-mono font-semibold">
                    {keyword}
                  </span>
                ))}
              </div>
              <p className="text-neutral-300 leading-relaxed">
                To re-subscribe after opting out, reply <strong className="text-white">START</strong> to any
                previous message thread, or contact the business directly to opt back in.
              </p>
            </section>

            {/* Help */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Help & Support</h2>
              <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 mb-4">
                <p className="text-neutral-300 leading-relaxed">
                  For help with text messages, reply <strong className="text-white font-bold">HELP</strong> to
                  any message. You will receive a response with the business name, contact information, and
                  opt-out instructions.
                </p>
              </div>
              <p className="text-neutral-300 leading-relaxed">
                You can also reach SmallBizAgent support directly:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300 mt-3">
                <li>Email: <a href="mailto:support@smallbizagent.ai" className="text-blue-400 hover:text-blue-300">support@smallbizagent.ai</a></li>
                <li>Website: <a href="https://www.smallbizagent.ai/support" className="text-blue-400 hover:text-blue-300">www.smallbizagent.ai/support</a></li>
              </ul>
            </section>

            {/* Supported Carriers */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Supported Carriers</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">
                Messages are delivered via Twilio and are compatible with all major US wireless carriers, including
                but not limited to:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['AT&T', 'Verizon', 'T-Mobile', 'Sprint', 'US Cellular', 'Cricket', 'Metro by T-Mobile', 'Boost Mobile'].map((carrier) => (
                  <span key={carrier} className="bg-neutral-900 border border-neutral-800 text-neutral-300 px-4 py-2 rounded-lg text-sm text-center">
                    {carrier}
                  </span>
                ))}
              </div>
              <p className="text-neutral-400 text-sm mt-3">
                Carriers are not liable for delayed or undelivered messages.
              </p>
            </section>

            {/* Privacy */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Privacy</h2>
              <p className="text-neutral-300 leading-relaxed">
                Your phone number, messaging preferences, and opt-in/opt-out status are collected and stored
                in accordance with our <Link href="/privacy"><span className="text-blue-400 hover:text-blue-300 cursor-pointer">Privacy Policy</span></Link>.
                We do not sell, rent, or share your phone number with third parties for their marketing
                purposes. Your information is used solely to deliver the messaging services described above
                and to comply with legal requirements.
              </p>
            </section>

            {/* TCPA Compliance */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">TCPA Compliance</h2>
              <p className="text-neutral-300 leading-relaxed">
                SmallBizAgent and its business subscribers comply with the Telephone Consumer Protection
                Act (TCPA) and all applicable federal and state regulations governing SMS communications.
                Messages are only sent to individuals who have provided their consent as described in the
                "How You Consent" section above. All messages include opt-out instructions, and opt-out
                requests are processed immediately.
              </p>
            </section>

            {/* Terms of Service */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Additional Terms</h2>
              <p className="text-neutral-300 leading-relaxed">
                These SMS Terms & Conditions are part of our overall{" "}
                <Link href="/terms"><span className="text-blue-400 hover:text-blue-300 cursor-pointer">Terms of Service</span></Link>.
                For complete information about how we handle your data, please review our{" "}
                <Link href="/privacy"><span className="text-blue-400 hover:text-blue-300 cursor-pointer">Privacy Policy</span></Link>.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">Contact Us</h2>
              <p className="text-neutral-300 leading-relaxed">
                If you have questions about these SMS Terms & Conditions, please contact us:
              </p>
              <div className="mt-4 bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                <p className="text-neutral-300 font-semibold">SmallBizAgent</p>
                <p className="text-neutral-300 mt-1">
                  Email: <a href="mailto:support@smallbizagent.ai" className="text-blue-400 hover:text-blue-300">support@smallbizagent.ai</a>
                </p>
                <p className="text-neutral-300 mt-1">
                  Website: <a href="https://www.smallbizagent.ai" className="text-blue-400 hover:text-blue-300">www.smallbizagent.ai</a>
                </p>
              </div>
            </section>
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
              <span className="text-white font-medium">SMS Terms</span>
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
