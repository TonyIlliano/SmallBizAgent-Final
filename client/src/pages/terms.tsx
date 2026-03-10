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

export default function TermsOfService() {
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Terms of Service</h1>
          <p className="text-neutral-400 mb-12">Last updated: March 1, 2026</p>

          <div className="prose prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">1. Acceptance of Terms</h2>
              <p className="text-neutral-300 leading-relaxed">
                By accessing or using the SmallBizAgent platform ("Service"), you agree to be bound by these
                Terms of Service ("Terms"). If you are using the Service on behalf of a business, you represent
                that you have the authority to bind that business to these Terms. If you do not agree to these
                Terms, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">2. Description of Service</h2>
              <p className="text-neutral-300 leading-relaxed">
                SmallBizAgent is a cloud-based business management platform designed for small businesses. The
                Service includes, but is not limited to: AI-powered virtual receptionist, appointment scheduling,
                customer relationship management (CRM), invoicing and payment processing, SMS and email
                notifications, job tracking, marketing tools, and analytics. Features available to you depend on
                your subscription plan.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">3. Account Registration</h2>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li>You must provide accurate, current, and complete information when creating an account.</li>
                <li>You are responsible for maintaining the security of your account credentials.</li>
                <li>You must be at least 18 years old to use the Service.</li>
                <li>You are responsible for all activities that occur under your account.</li>
                <li>You must notify us immediately of any unauthorized use of your account.</li>
                <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">4. Subscriptions and Payment</h2>

              <h3 className="text-xl font-medium mb-3 text-neutral-200">4.1 Free Trial</h3>
              <p className="text-neutral-300 leading-relaxed mb-4">
                New accounts may include a free trial period. During the trial, you have access to the Service
                features as described. When the trial expires, you must subscribe to a paid plan to continue
                using the Service. If you do not subscribe, your account will be limited and provisioned resources
                (such as your AI receptionist phone number) may be deactivated.
              </p>

              <h3 className="text-xl font-medium mb-3 text-neutral-200">4.2 Billing</h3>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li>Subscription fees are billed in advance on a monthly or annual basis depending on your plan.</li>
                <li>All payments are processed securely through Stripe. By subscribing, you authorize us to charge your payment method on file.</li>
                <li>Prices are listed in US dollars and are subject to change with 30 days' notice.</li>
                <li>You are responsible for any applicable taxes.</li>
              </ul>

              <h3 className="text-xl font-medium mb-3 mt-6 text-neutral-200">4.3 Cancellation</h3>
              <p className="text-neutral-300 leading-relaxed">
                You may cancel your subscription at any time from your account settings. Cancellation takes effect
                at the end of your current billing period. You will retain access to the Service until the end of
                the period you have already paid for. We do not provide prorated refunds for partial billing periods.
              </p>

              <h3 className="text-xl font-medium mb-3 mt-6 text-neutral-200">4.4 Overage Charges</h3>
              <p className="text-neutral-300 leading-relaxed">
                Certain plan features may have usage limits (e.g., number of AI receptionist minutes, SMS messages).
                If you exceed your plan's included usage, you may incur overage charges as described in your plan
                details. We will notify you when you approach your limits.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">5. Acceptable Use</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li>Use the Service for any unlawful purpose or in violation of any applicable law or regulation</li>
                <li>Send unsolicited messages (spam) through the Service's SMS or email features</li>
                <li>Violate the Telephone Consumer Protection Act (TCPA) or any other telecommunications regulation</li>
                <li>Send marketing messages to individuals who have not provided their consent</li>
                <li>Use the Service to harass, abuse, or threaten any person</li>
                <li>Attempt to gain unauthorized access to the Service, other accounts, or our systems</li>
                <li>Interfere with or disrupt the Service or servers connected to it</li>
                <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                <li>Use the Service to store or transmit malicious code</li>
                <li>Resell, sublicense, or redistribute access to the Service without our written consent</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">6. SMS and Telephone Compliance</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">
                As a user of the Service, you are responsible for complying with all applicable laws regarding
                SMS messages and telephone communications, including but not limited to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">TCPA Compliance:</strong> You must obtain proper consent before sending marketing messages to your customers. The Service provides opt-in mechanisms, but you are responsible for ensuring consent is properly obtained.</li>
                <li><strong className="text-white">Opt-Out Handling:</strong> You must honor opt-out requests promptly. The Service automatically processes STOP requests, but you must not re-add opted-out customers to marketing lists.</li>
                <li><strong className="text-white">Message Content:</strong> You are solely responsible for the content of messages sent through the Service. Messages must not contain illegal, deceptive, or misleading content.</li>
                <li><strong className="text-white">Call Recording Disclosure:</strong> If you use the AI receptionist in a jurisdiction requiring two-party consent for call recording, you are responsible for ensuring appropriate disclosures are made.</li>
                <li><strong className="text-white">Sender of Record:</strong> You acknowledge that when SMS messages are sent through the Service to your customers, you — the business subscriber — are the sender of record. SmallBizAgent acts solely as a technology platform facilitating message delivery on your behalf and is not the originator or sender of your messages.</li>
                <li><strong className="text-white">Consent Record-Keeping:</strong> You are required to obtain and maintain records of consent from your customers before sending them messages through the Service. This includes documenting the date, time, method, and scope of consent obtained. You must be able to produce these records upon request by SmallBizAgent, any regulatory authority, or in connection with any legal proceeding. Failure to maintain adequate consent records may result in suspension or termination of your account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">7. SMS/Text Messaging Terms</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">
                The SmallBizAgent platform sends SMS text messages on behalf of businesses using our Service.
                By providing your phone number to a business that uses SmallBizAgent, you may receive text
                messages including appointment reminders, reservation confirmations, order updates, missed call
                notifications, review requests, and promotional offers.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Message Frequency:</strong> Message frequency varies based on your interactions with the business (e.g., appointments booked, invoices sent, marketing campaigns). You may receive multiple messages per month.</li>
                <li><strong className="text-white">Message and Data Rates:</strong> Message and data rates may apply. Check with your mobile carrier for details about your messaging plan.</li>
                <li><strong className="text-white">Opt-Out:</strong> You can opt out of text messages at any time by replying <strong>STOP</strong> to any message. After opting out, you will receive a confirmation message and no further messages will be sent unless you re-subscribe.</li>
                <li><strong className="text-white">Help:</strong> For help or questions about text messages, reply <strong>HELP</strong> to any message or contact us at Bark@smallbizagent.ai.</li>
                <li><strong className="text-white">Supported Carriers:</strong> Messages are sent via Twilio and are supported on all major US carriers.</li>
                <li><strong className="text-white">Privacy:</strong> Your phone number and messaging data are handled in accordance with our <a href="/privacy" className="text-blue-400 hover:text-blue-300">Privacy Policy</a>. We do not sell your personal information or share it for third-party marketing purposes.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">8. Your Data</h2>

              <h3 className="text-xl font-medium mb-3 text-neutral-200">8.1 Ownership</h3>
              <p className="text-neutral-300 leading-relaxed mb-4">
                You retain ownership of all data you upload or create using the Service ("Your Data"), including
                customer information, appointment records, invoices, and business details. We do not claim
                ownership of Your Data.
              </p>

              <h3 className="text-xl font-medium mb-3 text-neutral-200">8.2 License Grant</h3>
              <p className="text-neutral-300 leading-relaxed mb-4">
                By using the Service, you grant us a limited, non-exclusive license to use, process, and store
                Your Data solely for the purpose of providing the Service to you. This includes processing data
                through third-party services (e.g., Twilio for SMS, Vapi for AI voice, Stripe for payments) as
                necessary to deliver the features you use.
              </p>

              <h3 className="text-xl font-medium mb-3 text-neutral-200">8.3 Data Export</h3>
              <p className="text-neutral-300 leading-relaxed">
                You may export Your Data at any time through the Service's export features or by contacting
                support. Upon account termination, we will make Your Data available for export for a period of
                30 days before deletion.
              </p>

              <h3 className="text-xl font-medium mb-3 mt-6 text-neutral-200">8.4 Data Processing</h3>
              <p className="text-neutral-300 leading-relaxed">
                With respect to any personal data of your customers that you store or process through the Service,
                you are the data controller and SmallBizAgent acts as a data processor on your behalf. We process
                your customers' personal data only as necessary to provide the Service to you and in accordance
                with your instructions as expressed through your use of the Service's features. We will not process
                your customers' data for any independent purpose, sell it to third parties, or use it for our own
                marketing. You are responsible for ensuring that you have a lawful basis to collect and process
                your customers' personal data and that your use of the Service complies with all applicable data
                protection laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">9. Intellectual Property</h2>
              <p className="text-neutral-300 leading-relaxed">
                The Service, including its design, code, features, documentation, and branding, is the property
                of SmallBizAgent and is protected by intellectual property laws. You may not copy, modify,
                distribute, or create derivative works based on the Service. Your use of the Service does not
                grant you any ownership rights in the Service itself.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">10. AI Receptionist Disclaimer</h2>
              <p className="text-neutral-300 leading-relaxed">
                The AI receptionist is an automated system that uses artificial intelligence to handle phone
                calls on behalf of your business. While we strive for accuracy and natural interactions, the
                AI receptionist may occasionally misunderstand callers, provide incorrect information, or fail
                to handle certain requests. You acknowledge that:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300 mt-4">
                <li>The AI receptionist is not a substitute for human judgment in critical situations</li>
                <li>You are responsible for reviewing and maintaining the knowledge base that trains the AI</li>
                <li>We are not liable for missed calls, incorrect bookings, or miscommunications by the AI</li>
                <li>Call quality may vary based on caller's phone connection and environmental factors</li>
                <li>You should regularly test and monitor the AI's performance using the tools provided</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">11. Service Availability</h2>
              <p className="text-neutral-300 leading-relaxed">
                We strive to maintain high availability but do not guarantee uninterrupted access to the Service.
                The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond
                our control. We will make reasonable efforts to notify you of planned maintenance in advance.
                We are not liable for any loss or damage arising from service interruptions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">12. Limitation of Liability</h2>
              <p className="text-neutral-300 leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, SMALLBIZAGENT AND ITS OFFICERS, DIRECTORS, EMPLOYEES,
                AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
                DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, BUSINESS OPPORTUNITIES, OR GOODWILL,
                ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING
                OUT OF THESE TERMS SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING
                THE CLAIM.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">13. Disclaimer of Warranties</h2>
              <p className="text-neutral-300 leading-relaxed">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
                OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
                PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE,
                UNINTERRUPTED, OR SECURE.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">14. Indemnification</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">
                You agree to indemnify, defend, and hold harmless SmallBizAgent and its officers, directors,
                employees, and agents from and against any claims, liabilities, damages, losses, and expenses
                (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Service;
                (b) your violation of these Terms; (c) your violation of any applicable law or regulation,
                including TCPA and SMS compliance; or (d) any content or data you upload, transmit, or store
                through the Service.
              </p>
              <p className="text-neutral-300 leading-relaxed">
                <strong className="text-white">SMS and TCPA Indemnification:</strong> Without limiting the foregoing,
                you specifically agree to indemnify, defend, and hold harmless SmallBizAgent from any and all claims,
                damages, fines, penalties, and expenses (including reasonable attorneys' fees) arising from or related
                to SMS messages or telephone calls sent or made through the Service on your behalf, including but not
                limited to claims under the Telephone Consumer Protection Act (TCPA), state telemarketing laws, or any
                other telecommunications regulation. As the sender of record for all messages sent through your account,
                you bear sole responsibility for ensuring proper consent has been obtained and maintained for each
                recipient. This indemnification obligation survives termination of your account and these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">15. Termination</h2>
              <p className="text-neutral-300 leading-relaxed">
                We may suspend or terminate your access to the Service at any time, with or without cause, with
                or without notice. Upon termination: (a) your right to use the Service ceases immediately;
                (b) we may delete Your Data after the 30-day export period; (c) any outstanding fees become
                immediately due. Sections 7, 8, 9, 12, 13, 14, and 16 survive termination.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">16. Governing Law and Disputes</h2>
              <p className="text-neutral-300 leading-relaxed">
                These Terms are governed by the laws of the State of Maryland, without regard to conflict of law
                provisions. Any disputes arising from these Terms or the Service shall first be addressed through
                good-faith negotiation. If the dispute cannot be resolved within 30 days, it shall be resolved
                through binding arbitration in accordance with the American Arbitration Association's rules. You
                agree to resolve disputes on an individual basis and waive any right to participate in a class
                action lawsuit.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">17. Changes to Terms</h2>
              <p className="text-neutral-300 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify you of material changes
                by posting the updated Terms on this page and, for significant changes, by sending an email or
                in-app notification. Your continued use of the Service after changes take effect constitutes
                your acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">18. Contact Us</h2>
              <p className="text-neutral-300 leading-relaxed">
                If you have questions about these Terms, please contact us:
              </p>
              <div className="mt-4 bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                <p className="text-neutral-300">SmallBizAgent</p>
                <p className="text-neutral-300 mt-1">
                  Email: <a href="mailto:Bark@smallbizagent.ai" className="text-blue-400 hover:text-blue-300">Bark@smallbizagent.ai</a>
                </p>
                <p className="text-neutral-300 mt-1">
                  Website: <a href="https://smallbizagent.ai" className="text-blue-400 hover:text-blue-300">smallbizagent.ai</a>
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
              <span className="text-white font-medium">Terms</span>
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
