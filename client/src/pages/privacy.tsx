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

export default function PrivacyPolicy() {
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-neutral-400 mb-12">Last updated: March 1, 2026</p>

          <div className="prose prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">1. Introduction</h2>
              <p className="text-neutral-300 leading-relaxed">
                SmallBizAgent ("we," "our," or "us") operates the SmallBizAgent platform, a software-as-a-service
                business management tool for small businesses. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you use our platform, website, and related services
                (collectively, the "Service"). By using the Service, you agree to the collection and use of
                information in accordance with this policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">2. Information We Collect</h2>

              <h3 className="text-xl font-medium mb-3 text-neutral-200">2.1 Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Account Information:</strong> When you register, we collect your name, email address, username, password, and business name.</li>
                <li><strong className="text-white">Business Information:</strong> Business name, address, phone number, industry type, services offered, business hours, and other details you provide during onboarding.</li>
                <li><strong className="text-white">Customer Data:</strong> Names, phone numbers, email addresses, appointment history, invoices, and other information about your customers that you store in the platform.</li>
                <li><strong className="text-white">Payment Information:</strong> Credit card and billing information is collected and processed by our payment processor, Stripe. We do not store your full credit card number on our servers.</li>
                <li><strong className="text-white">Communications:</strong> Call recordings, voicemail transcriptions, and SMS messages processed through our AI receptionist and notification systems.</li>
              </ul>

              <h3 className="text-xl font-medium mb-3 mt-6 text-neutral-200">2.2 Information Collected Automatically</h3>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Usage Data:</strong> Pages visited, features used, time spent on the platform, and interaction patterns.</li>
                <li><strong className="text-white">Device Information:</strong> Browser type, operating system, device type, and screen resolution.</li>
                <li><strong className="text-white">Log Data:</strong> IP address, access times, referring URLs, and error logs.</li>
                <li><strong className="text-white">Cookies:</strong> Session cookies to maintain your login state and preferences.</li>
              </ul>

              <h3 className="text-xl font-medium mb-3 mt-6 text-neutral-200">2.3 Information from Third-Party Services</h3>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Telephony Data:</strong> Call metadata, recordings, and transcriptions processed through Twilio.</li>
                <li><strong className="text-white">AI Processing:</strong> Voice interactions processed through our AI receptionist partner (Retell AI) for call handling and appointment booking.</li>
                <li><strong className="text-white">Payment Data:</strong> Transaction details and subscription status from Stripe.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">3. How We Use Your Information</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li>Provide, maintain, and improve the Service</li>
                <li>Process your transactions and manage your subscription</li>
                <li>Operate the AI receptionist to answer calls on behalf of your business</li>
                <li>Send appointment confirmations, reminders, and notifications to your customers via SMS and email</li>
                <li>Generate invoices, quotes, and payment requests</li>
                <li>Provide customer support and respond to your requests</li>
                <li>Send you service-related communications (e.g., trial expiration notices, system updates)</li>
                <li>Detect, prevent, and address technical issues and security threats</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">4. SMS and Telephone Communications</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">
                Our platform sends SMS messages and processes telephone calls on behalf of businesses using our Service.
                This section applies to the end customers of those businesses:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Transactional Messages:</strong> Appointment confirmations, reminders, invoice notifications, reservation confirmations, and order confirmations are sent when you interact with a business using SmallBizAgent.</li>
                <li><strong className="text-white">Marketing Messages:</strong> Review requests, promotional offers, and birthday messages may be sent by businesses with your prior consent. You can opt out at any time by replying STOP.</li>
                <li><strong className="text-white">Call Recordings:</strong> Calls handled by the AI receptionist may be recorded for quality assurance and to provide accurate service. The business owner can access these recordings through their dashboard.</li>
                <li><strong className="text-white">Message Frequency:</strong> Message frequency varies based on your interactions with the business (appointments, invoices, etc.).</li>
                <li><strong className="text-white">Opt-Out:</strong> Reply STOP to any SMS message to unsubscribe. Reply HELP for assistance. Message and data rates may apply.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">5. How We Share Your Information</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">We do not sell your personal information. We may share information with:</p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Service Providers:</strong> Third-party companies that help us operate the Service, including Twilio (telephony and SMS), Retell AI (AI voice processing), Stripe (payment processing), and email delivery services. These providers are contractually obligated to protect your information.</li>
                <li><strong className="text-white">Business Owners:</strong> If you are a customer of a business using SmallBizAgent, the business owner has access to your information as stored in their account (e.g., contact details, appointment history, invoices).</li>
                <li><strong className="text-white">Legal Requirements:</strong> We may disclose your information if required by law, regulation, legal process, or governmental request.</li>
                <li><strong className="text-white">Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, your information may be transferred as part of the transaction.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">6. Data Security</h2>
              <p className="text-neutral-300 leading-relaxed">
                We implement industry-standard security measures to protect your information, including encryption
                of data in transit (TLS/SSL), secure password hashing, and access controls. Payment information
                is handled by Stripe, which is PCI DSS Level 1 compliant. However, no method of transmission over
                the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">7. Data Retention</h2>
              <p className="text-neutral-300 leading-relaxed">
                We retain your account data for as long as your account is active or as needed to provide the Service.
                If you delete your account, we will delete or anonymize your personal data within 30 days, except
                where we are required to retain it for legal or regulatory purposes. Call recordings are retained
                for 90 days unless the business owner deletes them sooner. Customer data stored by businesses is
                retained as long as the business maintains an active account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">8. Your Rights</h2>
              <p className="text-neutral-300 leading-relaxed mb-4">Depending on your location, you may have the right to:</p>
              <ul className="list-disc pl-6 space-y-2 text-neutral-300">
                <li><strong className="text-white">Access:</strong> Request a copy of the personal information we hold about you.</li>
                <li><strong className="text-white">Correction:</strong> Request correction of inaccurate or incomplete information.</li>
                <li><strong className="text-white">Deletion:</strong> Request deletion of your personal information, subject to legal retention requirements.</li>
                <li><strong className="text-white">Opt-Out:</strong> Opt out of marketing communications at any time by replying STOP to SMS messages or clicking "unsubscribe" in emails.</li>
                <li><strong className="text-white">Data Portability:</strong> Request your data in a portable format.</li>
              </ul>
              <p className="text-neutral-300 leading-relaxed mt-4">
                To exercise these rights, contact us at <a href="mailto:Bark@smallbizagent.ai" className="text-blue-400 hover:text-blue-300">Bark@smallbizagent.ai</a>.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">9. Children's Privacy</h2>
              <p className="text-neutral-300 leading-relaxed">
                The Service is not intended for use by anyone under the age of 18. We do not knowingly collect
                personal information from children. If we learn that we have collected information from a child
                under 18, we will take steps to delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">10. Third-Party Links</h2>
              <p className="text-neutral-300 leading-relaxed">
                The Service may contain links to third-party websites or services (e.g., Google Reviews, payment
                processors). We are not responsible for the privacy practices of these third parties. We encourage
                you to review their privacy policies before providing any personal information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">11. Changes to This Policy</h2>
              <p className="text-neutral-300 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any material changes
                by posting the updated policy on this page and updating the "Last updated" date. Your continued
                use of the Service after any changes constitutes your acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4 text-white">12. Contact Us</h2>
              <p className="text-neutral-300 leading-relaxed">
                If you have questions about this Privacy Policy or our data practices, please contact us:
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
              <span className="text-white font-medium">Privacy</span>
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
