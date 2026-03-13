# SmallBizAgent — Complete Project Reference

> **Read this file first.** This is the single source of truth for any AI agent working on this codebase. It covers architecture, tech stack, database schema, services, routes, integrations, and known patterns.

> ⚠️ **MANDATORY: Keep This File Up To Date.** Every time you make changes to this project — new files, new services, new routes, schema changes, new integrations, config changes, bug fixes, or any other meaningful update — you **MUST** update this `claude.md` file to reflect those changes before finishing your work. This ensures the next agent (or the next conversation) has accurate, current context. **No exceptions.** If you added it, changed it, or removed it, document it here.

## What Is This?

SmallBizAgent is a **multi-tenant SaaS platform** for small service businesses (salons, restaurants, HVAC, plumbing, dental, auto shops, etc.). It provides:

- **AI Voice Receptionist** (Vapi.ai) — answers calls 24/7, books appointments, takes orders
- **Appointment & Job Management** — scheduling, calendar sync, job tracking
- **Invoicing & Payments** — Stripe payments, invoice sharing, payment links
- **Customer CRM** — auto-built from calls/bookings, SMS conversations, tags
- **Automated SMS Agents** — follow-ups, no-show recovery, rebooking, review requests
- **Marketing & Social Media** — blog generation, social post drafts, Shotstack video rendering
- **Multi-location & Staff** — business groups, staff scheduling, role-based access
- **POS Integrations** — Clover, Square, Heartland for restaurant ordering
- **Admin Dashboard** — platform-wide analytics, user management, agent controls

**Owner:** Tony Illiano
**Domain:** smallbizagent.ai
**Deployment:** Railway (PostgreSQL on Neon)
**Repo root:** `/Users/tonyilliano/Downloads/ZipFileExplorer 6/`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript, Vite, Tailwind CSS, Radix UI (shadcn/ui) |
| **Routing** | wouter (lightweight) |
| **State** | TanStack React Query + Context API |
| **Forms** | React Hook Form + Zod validation |
| **Charts** | Recharts |
| **Backend** | Express.js + TypeScript |
| **Database** | PostgreSQL (Neon serverless) |
| **ORM** | Drizzle ORM |
| **Auth** | Passport.js local strategy, express-session, connect-pg-simple |
| **Security** | CSRF tokens, Helmet, rate limiting, 2FA (TOTP), Turnstile CAPTCHA |
| **Mobile** | Capacitor (iOS + Android wrappers) |
| **Email** | SendGrid or Resend |
| **SMS/Voice** | Twilio |
| **AI Voice** | Vapi.ai |
| **AI/LLM** | OpenAI (gpt-4o-mini) |
| **AI Memory** | Mem0 (persistent conversational memory) |
| **AI Orchestration** | LangGraph.js (state machine agent graph with PostgreSQL checkpointing) |
| **Payments** | Stripe (Checkout, Connect, Billing Portal) |
| **Calendar** | Google Calendar, Microsoft Graph, Apple iCal |
| **POS** | Clover, Square, Heartland/Genius |
| **Accounting** | QuickBooks Online |
| **Video** | Shotstack Edit API |
| **Storage** | AWS S3 |
| **Error Tracking** | Sentry |

---

## Directory Structure

```
.
├── client/                    # React frontend
│   └── src/
│       ├── components/        # UI components (60+ shadcn/ui + custom)
│       │   ├── ui/            # Base shadcn/ui components
│       │   ├── dashboard/     # Dashboard widgets
│       │   ├── receptionist/  # AI receptionist config
│       │   ├── automations/   # Agent cards, feeds, settings
│       │   ├── settings/      # Settings panels
│       │   ├── restaurant/    # Restaurant-specific
│       │   └── ...
│       ├── hooks/             # use-auth, use-toast, use-mobile, use-debounce, use-onboarding-progress
│       ├── context/           # SidebarContext
│       ├── lib/               # queryClient.ts, api.ts, utils.ts
│       └── pages/             # All page components (see Routes below)
├── server/
│   ├── index.ts               # Express server entry point
│   ├── routes.ts              # Main route registration (huge file, ~6000 lines)
│   ├── routes/                # Feature-specific route files
│   ├── services/              # Business logic services (50+ files)
│   │   └── platformAgents/    # AI platform agents (10 files)
│   ├── middleware/             # Auth middleware
│   ├── utils/                 # s3Upload, encryption, etc.
│   └── storage.ts             # Data access layer
├── shared/
│   └── schema.ts              # Drizzle ORM schema (57 tables)
├── migrations/                # SQL migration files
├── public/                    # Static assets, icons, templates
├── android/ / ios/            # Capacitor native projects
└── scripts/                   # Build/deployment scripts
```

---

## Routes (All Pages)

### Public (no auth)
| Route | Page | Purpose |
|-------|------|---------|
| `/` | HomePage | Landing page (logged out) or dashboard (logged in) |
| `/welcome` | LandingPage | Marketing landing page |
| `/auth` | AuthPage | Login / Register with 2FA + Turnstile |
| `/verify-email` | VerifyEmailPage | 6-digit OTP verification |
| `/reset-password` | ResetPasswordPage | Password reset with token |
| `/book/:slug` | PublicBooking | Customer-facing booking calendar |
| `/book/:slug/manage/:token` | ManageAppointment | Reschedule/cancel via link |
| `/book/:slug/manage-reservation/:token` | ManageReservation | Reservation management |
| `/portal` | CustomerPortal | Customer invoice lookup |
| `/portal/invoice/:token` | PortalInvoice | Public invoice view/pay |
| `/portal/quote/:token` | PortalQuote | Public quote view |
| `/invoices/pay/:invoiceId` | InvoicePayment | Payment link |
| `/staff/join/:code` | StaffJoin | Staff onboarding via invite |
| `/privacy` | PrivacyPolicy | Privacy policy |
| `/terms` | TermsOfService | Terms of service |
| `/sms-terms` | SmsTerms | SMS/TCPA opt-in terms |
| `/support` | SupportPage | Help resources |
| `/contact` | ContactPage | Contact form |

### Protected (auth + email verified)
| Route | Page | Purpose |
|-------|------|---------|
| `/dashboard` | Dashboard | Main business dashboard with stats, setup checklist |
| `/customers` | Customers | Customer list with search, export |
| `/customers/:id` | CustomerDetail | Individual customer profile + history |
| `/appointments` | Appointments | Calendar view (week/day/month) |
| `/appointments/fullscreen` | FullscreenSchedule | Kiosk/display calendar |
| `/appointments/:id` | AppointmentDetail | Single appointment view |
| `/jobs` | Jobs | Job list with status filtering |
| `/jobs/:id` | JobDetail | Job details, line items, timeline |
| `/invoices` | Invoices | Invoice list, payment links |
| `/invoices/create` | CreateInvoice | Invoice creation form |
| `/invoices/:id` | InvoiceDetail | Invoice view |
| `/invoices/:id/edit` | EditInvoice | Edit invoice |
| `/invoices/:id/print` | PrintInvoice | Print-friendly layout |
| `/quotes` | Quotes | Quote list |
| `/quotes/create` | CreateQuote | Quote creation |
| `/quotes/:id` | QuoteDetail | Quote view |
| `/quotes/:id/edit` | EditQuote | Edit quote |
| `/quotes/:id/print` | PrintQuote | Print-friendly layout |
| `/receptionist` | Receptionist | AI receptionist config, call logs, knowledge base |
| `/analytics` | Analytics | Revenue, calls, jobs, appointments charts |
| `/marketing` | Marketing | Reviews, campaigns, social media |
| `/ai-agents` | Automations | SMS agent dashboard, activity feed, conversations |
| `/recurring` | RecurringSchedules | Recurring job/invoice templates |
| `/settings` | Settings | All business settings (multi-tab) |
| `/settings/calendar` | CalendarSettings | Google/Microsoft/Apple calendar |
| `/settings/pwa-installation` | PWAInstall | Mobile install guide |
| `/onboarding` | OnboardingFlow | Multi-step setup wizard |
| `/onboarding/subscription` | SubscriptionSelection | Plan selection |
| `/payment` | Payment | Payment processing |
| `/subscription-success` | SubscriptionSuccess | Post-payment confirmation |
| `/staff/dashboard` | StaffDashboard | Staff-only view |

### Admin (admin role only)
| Route | Page | Purpose |
|-------|------|---------|
| `/admin` | AdminDashboard | Platform stats, users, businesses, revenue, agents, webhooks, content |
| `/admin/phone-management` | PhoneManagement | Twilio number provisioning |
| `/admin/social-media` | SocialMediaAdmin | Social post queue, OAuth connections, video generation |

---

## Database Schema (60 Tables)

### Core
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | username, email, password, role (user/staff/admin), businessId, emailVerified, twoFactorEnabled |
| `businesses` | Business profiles | name, industry, type, phone, timezone, bookingSlug, twilioPhoneNumber, vapiAssistantId, subscriptionStatus, stripeCustomerId, all POS tokens |
| `business_hours` | Operating hours | businessId, day, open, close, isClosed |
| `business_groups` | Multi-location groups | ownerUserId, stripeSubscriptionId, multiLocationDiscountPercent |
| `business_phone_numbers` | Multiple Twilio numbers | businessId, twilioPhoneNumber, twilioPhoneNumberSid, vapiPhoneNumberId, isPrimary |
| `user_business_access` | Multi-business access | userId, businessId, role |

### Customers & Communication
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `customers` | Customer contacts | businessId, firstName, lastName, phone, email, smsOptIn, marketingOptIn, birthday, tags |
| `sms_conversations` | SMS threads | businessId, customerId, customerPhone, agentType, state, context (jsonb), expiresAt |
| `sms_suppression_list` | TCPA opt-outs | phoneNumber, businessId, reason |
| `call_logs` | Call records | businessId, callerId, transcript, intentDetected, callDuration, recordingUrl, status |
| `notification_log` | Sent notifications | businessId, type, channel (sms/email), recipient, status |
| `notification_settings` | Per-business notification prefs | All boolean toggles for SMS/email per event type |

### Scheduling & Jobs
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `services` | Services offered | businessId, name, price, duration |
| `staff` | Staff members | businessId, userId, firstName, lastName, specialty |
| `staff_hours` | Staff schedules | staffId, day, startTime, endTime, isOff |
| `staff_services` | Staff-service assignments | staffId, serviceId |
| `staff_invites` | Staff invitation codes | businessId, staffId, email, inviteCode, status |
| `appointments` | Scheduled appointments | businessId, customerId, staffId, serviceId, startDate, endDate, status, googleCalendarEventId |
| `jobs` | Service jobs | businessId, customerId, title, status (pending/in_progress/waiting_parts/completed) |
| `job_line_items` | Job line items | jobId, type, description, quantity, unitPrice |
| `recurring_schedules` | Recurring templates | businessId, frequency, interval, nextRunDate, autoCreateInvoice |

### Invoicing & Quotes
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `invoices` | Customer invoices | businessId, customerId, invoiceNumber, amount, total, status, stripePaymentIntentId, accessToken |
| `invoice_items` | Invoice line items | invoiceId, description, quantity, unitPrice |
| `quotes` | Service quotes | businessId, customerId, quoteNumber, total, status, convertedToInvoiceId, accessToken |
| `quote_items` | Quote line items | quoteId, description, quantity, unitPrice |
| `quote_follow_ups` | Follow-up tracking | quoteId, attemptNumber, channel, sentAt |

### AI & Receptionist
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `receptionist_config` | AI receptionist settings | businessId, greeting, voiceId, assistantName, callRecordingEnabled, customInstructions |
| `business_knowledge` | Knowledge base Q&A | businessId, question, answer, category, source, isApproved |
| `unanswered_questions` | Qs AI couldn't answer | businessId, callLogId, question, status, ownerAnswer |
| `ai_suggestions` | Weekly AI suggestions | businessId, type, title, description, riskLevel, status |

### Agents & Automation
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `agent_settings` | Per-business agent config | businessId, agentType, enabled, config (jsonb) |
| `agent_activity_log` | Agent execution history | businessId, agentType, action, details (jsonb) |

### Intelligence & Orchestration
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `call_intelligence` | Post-call AI analysis | businessId, callLogId (unique), customerId, intent, outcome, sentiment (1-5), summary, keyFacts (jsonb), followUpNeeded, followUpType, isNewCaller, processingStatus, modelUsed, tokenCount |
| `customer_insights` | Aggregated per-customer profile | customerId+businessId (unique), lifetimeValue, totalVisits, avgVisitFrequencyDays, preferredServices (jsonb), preferredStaff, sentimentTrend, riskLevel, riskFactors (jsonb), churnProbability, autoTags (jsonb), reliabilityScore |
| `customer_engagement_lock` | Prevents agent message conflicts | customerId, businessId, lockedByAgent, lockedAt, expiresAt, status |

### Social Media & Marketing
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `social_media_posts` | Generated social posts | platform, content, mediaUrl, mediaType, status (draft/approved/published/rejected), industry, details (jsonb) |
| `blog_posts` | Generated blog articles | title, slug, body, industry, targetKeywords, status, generatedVia (openai/template) |
| `marketing_campaigns` | Email/SMS campaigns | businessId, type, channel, template, status |

### Reviews
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `review_settings` | Review request config | businessId, googleReviewUrl, autoSendAfterJobCompletion, reviewCooldownDays |
| `review_requests` | Sent review requests | businessId, customerId, sentVia, platform, status |
| `review_responses` | AI-drafted review replies | businessId, reviewSource, reviewText, aiDraftResponse, status |

### Calendar & Integrations
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `calendar_integrations` | OAuth tokens | businessId, provider, accessToken, refreshToken, expiresAt |

### POS (Clover, Square, Heartland)
| Table | Purpose |
|-------|---------|
| `clover_menu_cache` | Cached Clover menu |
| `clover_order_log` | Clover order history |
| `square_menu_cache` | Cached Square catalog |
| `square_order_log` | Square order history |
| `heartland_menu_cache` | Cached Heartland menu |
| `heartland_order_log` | Heartland order history |
| `inventory_items` | Stock tracking with low-stock alerts |
| `restaurant_reservations` | Table reservations |

### Billing & Admin
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `subscription_plans` | Available plans | name, price, interval, maxCallMinutes, overageRatePerMinute, stripePriceId |
| `overage_charges` | Call minute overage billing | businessId, minutesUsed, overageAmount, stripeInvoiceId |
| `webhooks` | Webhook subscriptions | businessId, url, events (jsonb), secret |
| `webhook_deliveries` | Delivery log | webhookId, event, payload, status, attempts |
| `audit_logs` | Security audit trail | userId, action, resource, ipAddress |
| `api_keys` | Business API keys | businessId, name, keyHash, keyPrefix |
| `password_reset_tokens` | Password reset flow | userId, token, expiresAt, used |
| `website_scrape_cache` | Scraped website content for knowledge | businessId, url, structuredKnowledge |

---

## Server Services

### Business Agents (server/services/)
| Service | Purpose | External APIs |
|---------|---------|---------------|
| `followUpAgentService` | Thank-you + upsell SMS after completed jobs | Twilio |
| `noShowAgentService` | No-show SMS with conversational rescheduling | Twilio, OpenAI |
| `estimateFollowUpAgentService` | Quote follow-up SMS (3 attempts) | Twilio |
| `rebookingAgentService` | Win-back SMS for inactive customers (30+ days) | Twilio, OpenAI |
| `reviewResponseAgentService` | AI-drafted Google review responses | OpenAI, Google Business Profile |
| `conversationalBookingService` | Multi-turn SMS booking via AI | OpenAI |

### Platform Agents (server/services/platformAgents/)
| Agent | Purpose | Runs |
|-------|---------|------|
| `contentSeoAgent` | Blog post generation (GPT or templates) | Every 7 days |
| `socialMediaAgent` | Social post drafts for Twitter/FB/IG/LinkedIn | Daily |
| `churnPredictionAgent` | Predict at-risk businesses | Periodic |
| `competitiveIntelAgent` | Competitive landscape analysis | Periodic |
| `healthScoreAgent` | Business health scoring | Periodic |
| `leadScoringAgent` | Score & rank leads | Periodic |
| `onboardingCoachAgent` | Guide users through setup | Event-driven |
| `revenueOptimizationAgent` | Revenue improvement suggestions | Periodic |
| `supportTriageAgent` | Triage support issues | Event-driven |
| `testimonialAgent` | Generate testimonials/case studies | Periodic |

### Core Services
| Service | Purpose |
|---------|---------|
| `vapiService` | Vapi.ai voice receptionist (system prompts for 15+ industries, multi-language) |
| `vapiWebhookHandler` | Handle Vapi call webhooks (transcripts, function calls) |
| `twilioService` | SMS/voice via Twilio (TCPA compliant, A2P 10DLC) |
| `notificationService` | Unified email+SMS notifications for all events |
| `emailService` | Email via SendGrid or Resend |
| `appointmentService` | Availability checking, conflict prevention, booking |
| `calendarService` | Google/Microsoft/Apple calendar sync |
| `stripeService` | Payment intents, customers, invoices |
| `subscriptionService` | Full subscription lifecycle (create, cancel, prorate, dunning) |
| `overageBillingService` | Call minute overage billing |
| `analyticsService` | Revenue, call, job, appointment, customer analytics |
| `adminService` | Platform-wide stats (`getPlatformStats()` — no businessId needed) |
| `videoGenerationService` | Shotstack video rendering (5 templates, live platform stats) |
| `socialMediaService` | OAuth + publishing to Twitter, Facebook, Instagram, LinkedIn |
| `autoRefineService` | Weekly AI analysis of call transcripts for receptionist improvement |
| `schedulerService` | Cron-like scheduler for all periodic tasks |
| `dataRetentionService` | Auto-purge old recordings (90d) and transcripts (365d) |
| `auditService` | Security event audit logging |
| `webhookService` | Webhook delivery with retry logic |
| `businessProvisioningService` | New business setup (Twilio + Vapi provisioning) |
| `inventoryService` | POS inventory sync + low-stock alerts |
| `callIntelligenceService` | Post-call GPT-4o-mini transcript analysis (intent, sentiment, key facts, follow-up needs). Fire-and-forget from `handleEndOfCall()`. ~$0.01/call |
| `customerInsightsService` | Aggregates per-customer profile (LTV, preferences, risk, sentiment). Event-driven after intelligence extraction + nightly batch recalculation |
| `orchestrationService` | Central event dispatcher. Routes `appointment.completed`, `appointment.no_show`, `job.completed`, `intelligence.ready`, `conversation.resolved` to appropriate agents with engagement lock checks |
| `morningBriefService` | Daily 7am email digest per business timezone. Covers calls, bookings, revenue, agent activity, attention items. Skipped if zero activity |
| `mem0Service` | Persistent AI memory layer via Mem0 cloud. Stores conversational context from calls/events per customer. Enriches recognizeCaller() with memory search. Multi-tenant scoped: `b{businessId}_c{customerId}`. Graceful degradation if API key missing |
| `agentGraph` | LangGraph.js state machine orchestration. Replaces switch/case dispatcher with proper state graph: check_lock → load_context → route → action → log_result. PostgreSQL checkpointing. Falls back to switch/case if LangGraph unavailable |

---

## API Route Files (server/routes/)

| File | Mount Point | Purpose |
|------|-------------|---------|
| `adminRoutes` | `/api/admin/*` | Platform admin CRUD, stats, blog posts |
| `analyticsRoutes` | `/api/analytics/*` | Business analytics queries |
| `appointmentRoutes` | `/api/appointments/*` | Appointment CRUD |
| `automationRoutes` | `/api/automations/*` | Agent config, activity logs |
| `bookingRoutes` | `/api/booking/*` | Public booking, availability |
| `calendarRoutes` | `/api/calendar/*` | Calendar OAuth callbacks |
| `customerRoutes` | `/api/customers/*` | Customer CRUD |
| `cloverRoutes` | `/api/clover/*` | Clover POS OAuth, menu, orders |
| `squareRoutes` | `/api/square/*` | Square POS integration |
| `heartlandRoutes` | `/api/heartland/*` | Heartland POS integration |
| `socialMediaRoutes` | `/api/social-media/*` | Social posts, video gen, OAuth, publishing |
| `subscriptionRoutes` | `/api/subscriptions/*` | Plans, billing portal, promo codes |
| `stripeConnectRoutes` | `/api/stripe-connect/*` | Stripe Connect for payments |
| `phoneRoutes` | `/api/phone/*` | Twilio number provisioning |
| `marketingRoutes` | `/api/marketing/*` | Campaigns, drip emails |
| `quoteRoutes` | `/api/quotes/*` | Quote CRUD |
| `quickbooksRoutes` | `/api/quickbooks/*` | QuickBooks sync |
| `webhookRoutes` | `/api/webhooks/*` | Webhook management |
| `zapierRoutes` | `/api/zapier/*` | Zapier integration |
| `exportRoutes` | `/api/export/*` | CSV data export |
| `gbpRoutes` | `/api/gbp/*` | Google Business Profile |
| `inventoryRoutes` | `/api/inventory/*` | Inventory management |
| `locationRoutes` | `/api/locations/*` | Multi-location |
| `recurring` | `/api/recurring/*` | Recurring schedules |
| `import` | `/api/import/*` | Data import |
| `embedRoutes` | `/api/embed/*` | Embedded booking widget |

**Note:** Many routes are also defined inline in `server/routes.ts` (~6000 lines), especially auth, call logs, invoices, jobs, Twilio/Vapi webhooks.

**Intelligence & Insights API endpoints (inline in routes.ts):**
- `GET /api/call-intelligence/:callLogId` — Intelligence for a specific call
- `GET /api/call-intelligence/business/summary` — Aggregated call intelligence stats
- `GET /api/customers/:id/insights` — Customer insights profile
- `GET /api/customers/insights/high-risk` — High-risk customers for the business

---

## Environment Variables

### Required
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (Neon) |
| `SESSION_SECRET` | Express session encryption |
| `APP_URL` | Public URL (customer links, video branding, SMS links, CORS) |

### Communication
| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_PHONE_NUMBER` | Default Twilio number |
| `VAPI_API_KEY` | Vapi.ai API key |
| `VAPI_WEBHOOK_SECRET` | Vapi webhook verification |

### Payments
| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_PUBLIC_KEY` | Stripe client-side |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |

### AI & Content
| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | GPT-4o-mini for agents, content, booking |
| `SHOTSTACK_API_KEY` | Video rendering |
| `SHOTSTACK_ENV` | `v1` (production) or `stage` (sandbox) |

### Calendar
| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Google Calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback (e.g., `https://www.smallbizagent.ai/api/calendar/google/callback`) |
| `MICROSOFT_CLIENT_ID` | Microsoft Calendar OAuth |
| `MICROSOFT_CLIENT_SECRET` | Microsoft Calendar OAuth |
| `MICROSOFT_REDIRECT_URI` | Microsoft OAuth callback |

### Email
| Variable | Purpose |
|----------|---------|
| `SENDGRID_API_KEY` | Email via SendGrid |
| `SENDGRID_FROM_EMAIL` | SendGrid sender address |
| `RESEND_API_KEY` | Email via Resend (alternative) |
| `RESEND_FROM_EMAIL` | Resend sender address |

### POS Integrations
| Variable | Purpose |
|----------|---------|
| `CLOVER_APP_ID`, `CLOVER_APP_SECRET` | Clover POS |
| `SQUARE_APP_ID`, `SQUARE_APP_SECRET` | Square POS |

### Storage & Monitoring
| Variable | Purpose |
|----------|---------|
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_MEDIA_BUCKET` | S3 file storage |
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | Error tracking (server + client) |

### Optional
| Variable | Purpose |
|----------|---------|
| `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` | QuickBooks accounting sync |
| `TURNSTILE_SECRET_KEY` | Cloudflare CAPTCHA (server-side) |
| `ENCRYPTION_KEY` | 64-char hex key for DB-stored credentials |
| `OPENWEATHER_API_KEY` | Weather-aware reminders |
| `MEM0_API_KEY` | Mem0 cloud persistent memory (format: `m0-...`). Optional — system degrades gracefully without it |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Default admin account seeding |
| `BASE_URL` | Legacy alias for APP_URL |
| `RAILWAY_API_TOKEN` | Railway deployment API |
| `VITE_GOOGLE_PLACES_API_KEY` | Google Places autocomplete (client) |
| `VITE_STRIPE_PUBLIC_KEY` | Stripe publishable key (client) |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (client) |

---

## Authentication System

- **Type:** Session-based (express-session + connect-pg-simple)
- **Strategy:** Passport.js local (username + password)
- **CSRF:** Token in HTTP-only cookie, validated via `X-CSRF-Token` header
- **2FA:** Optional TOTP with backup codes
- **Email verification:** 6-digit OTP (30-min expiry), required before full access, CSRF-exempt endpoints
- **Roles:** `user` (business owner), `staff` (limited access), `admin` (platform-wide)
- **Password rules:** 12+ chars, uppercase, lowercase, number, special char
- **CAPTCHA:** Cloudflare Turnstile on login/register

---

## Key Patterns & Gotchas

### API Response Shapes
**This has been a recurring bug source.** Always verify the response shape:
- `GET /api/admin/blog-posts` returns `{ posts: [...] }` (wrapped)
- `GET /api/social-media/posts` returns `[...]` (raw array)
- `POST /api/social-media/generate` returns `{ draftsGenerated: N, ... }` (not `{ result: { draftsGenerated } }`)

### React Query
- Default `queryFn` uses `getQueryFn({ on401: "throw" })` from `queryClient.ts`
- Always provide explicit `queryFn` when the default won't work (e.g., POST endpoints, custom params)
- `staleTime: Infinity` by default — data doesn't auto-refetch

### Multi-tenancy
- All data scoped by `businessId`
- Platform agents use `businessId: 0` for platform-level actions
- Admin routes check `user.role === "admin"`

### TCPA/SMS Compliance
- SMS only sent to customers with `smsOptIn: true`
- `sms_suppression_list` checked before every send
- A2P 10DLC via Twilio Messaging Service SID
- STOP keyword handling with auto-suppression

### Video Generation (Shotstack)
- 5 templates: `feature_highlight`, `customer_stats`, `before_after`, `testimonial_quote`, `platform_demo`
- All HTML/CSS rendered into MP4 — no external media files
- Fetches live platform stats from `getPlatformStats()` before each render
- Instagram: 9:16, others: 16:9
- Renders take 30-120 seconds, UI polls every 10s
- Videos stored as URLs (Shotstack CDN or S3)

### Social Media Agent
- Generates posts for Twitter/Facebook/Instagram/LinkedIn
- 3-day deduplication per industry+platform
- Max 20 pending drafts cap
- Posts require admin approval before publishing
- Publishing uses real OAuth tokens for each platform

### Content SEO Agent
- Generates blog posts (full articles via GPT or templates)
- Cap: 5 articles per industry
- Stored in `blog_posts` table, visible in admin Content tab
- Content formats rotate: how_to, listicle, case_study, comparison, tips

### Scheduler
- `schedulerService` runs periodic checks:
  - Appointment reminders
  - Follow-up agent
  - No-show detection
  - Rebooking check
  - Estimate follow-ups
  - Daily digest emails
  - Data retention purge
  - Platform agents
  - **Customer insights nightly recalculation** (24h interval)
  - **Engagement lock cleanup** (15 min interval)
  - **Morning brief** (hourly check, sends at 7am per business timezone)

---

## Recent Work (Commits)

| Commit | Change |
|--------|--------|
| `842052c` | Industry-aware morning brief + full schema sync + query optimization |
| `87c4b43` | Upgrade zod 3.24.2 → 3.25.76 to enable LangGraph at runtime |
| `4e247d1` | Fix production crash: convert LangGraph to dynamic imports |
| `60a590f` | Add intelligence layer tables to auto-migration |
| `baf550c` | Add .npmrc with legacy-peer-deps for LangGraph zod compatibility |
| `df7bc7f` | Add intelligence layer: Mem0 memory, LangGraph orchestration, call intelligence, customer insights, morning briefs |
| `cb62ae9` | Video generation: live stats, auto-polling, BRAND_URL fix + add claude.md |
| `f6c6127` | Fix social media posts not showing (API returns array, not {posts}) |
| `7862056` | Add Social Media summary card to Content tab with link to /admin/social-media |
| `b42f7f4` | Fix Content tab crash (add queryFn to unwrap API response) |
| `de6a7ca` | 15 security/reliability fixes across 6 files |
| `d5fc22b` | Add Blog Content Management tab to Admin Dashboard |
| `2a18a60` | Add /sms-terms page for Twilio A2P 10DLC approval |
| `3c447f6` | Replace hardcoded URLs with APP_URL env var across 17 files |
| `7c3334e` | Fix login (exempt auth from CSRF, add www redirect) |
| `e291cb2` | Test coverage for SMS agents, auth, payments (228 tests) |

### Uncommitted changes (current session — Security Audit & Bug Fixes):

#### Email Verification Flow (Production Bug Fix)
- **Root cause**: `/api/verify-email` and `/api/resend-verification` were blocked by CSRF middleware
- `server/index.ts` — Added `/api/verify-email`, `/api/resend-verification`, `/api/2fa/validate`, `/api/book/`, `/api/booking/` to CSRF exempt paths
- `server/auth.ts` — Fixed code comparison with `String(code).trim()`, increased verification expiry from 10 → 30 minutes
- `client/src/pages/auth/verify-email.tsx` — Added CSRF token headers to fetch calls, added resend success message, added "check spam" tip
- `server/emailService.ts` — Improved verification email: better subject line (reduces spam score), added `Reply-To` header, `X-Entity-Ref-ID` header, professional HTML template

#### Security Audit Fixes (CRITICAL)
- `server/routes/calendarRoutes.ts` — Fixed 4 IDOR vulnerabilities (URL param → session businessId), fixed 3 appointment IDOR (added ownership verification), HTML-escaped XSS in OAuth error pages, fixed postMessage wildcard to use APP_URL
- `server/routes/recurring.ts` — Fixed IDOR on pause/resume/run/history endpoints (added session businessId + ownership checks)
- `server/routes/adminRoutes.ts` — Fixed bulk subscription update: requires non-empty businessIds array (was dangerous: empty array updated ALL businesses)
- `client/src/pages/book/[slug].tsx` — Fixed postMessage data leak: reduced payload to `{ type: "sba-booking-success", booked: true }` instead of full appointment PII

#### Security Audit Fixes (HIGH)
- `server/routes/socialMediaRoutes.ts` — Fixed host header injection (2 locations): use `process.env.APP_URL` instead of `req.get('host')`
- `server/routes/quoteRoutes.ts` — Changed `BASE_URL` to `APP_URL` for quote URL generation
- `server/routes/subscriptionRoutes.ts` — Fixed open redirect: removed client-supplied `returnUrl`, server-constructs from `APP_URL`
- `server/services/notificationService.ts` — Changed `BASE_URL` to `APP_URL` for quote follow-up URLs
- `server/services/stripeService.ts` — Removed hardcoded `'whsec_test_example'` webhook secret fallback (now throws if not set), added payment amount positive validation
- `server/services/businessProvisioningService.ts` — Fixed always-success bug: `results.success` now recalculated from actual provisioning outcomes

#### Defense-in-Depth: Storage Layer Multi-Tenant Scoping
- `server/storage.ts` — 9 delete methods (`deleteService`, `deleteCustomer`, `deleteAppointment`, `deleteJob`, `deleteInvoice`, `deleteBusinessKnowledge`, `deleteUnansweredQuestion`, `deletePhoneNumber`, `deleteQuote`) now require `businessId` parameter and use `and()` in WHERE clauses as a second layer of protection
- `server/storage.ts` — `getInvoicesWithAccessToken` query capped at `.limit(50)` to prevent unbounded cross-tenant results
- `server/routes.ts` — All 7 inline delete callers updated to pass `businessId`
- `server/routes/customerRoutes.ts` — `deleteCustomer` caller updated
- `server/routes/phoneRoutes.ts` — `deletePhoneNumber` caller updated
- `server/routes/quoteRoutes.ts` — `deleteQuote` caller updated

#### Input Validation: parseInt NaN Checks
- `server/routes.ts` — ~75 `parseInt()` calls now have `isNaN()` guards returning 400 on invalid IDs
- `server/routes/gbpRoutes.ts` — 10 `parseInt()` calls now have `isNaN()` guards

#### Rate Limiting: SMS/Notification Endpoints
- `server/routes.ts` — Added `notificationLimiter` (10 requests/hour): applied to appointment send-reminder, invoice send-reminder, job send-followup, test notifications

#### Frontend Reliability Fixes
- `client/src/components/ui/feature-tour.tsx` — Added `safeJsonParse()` helper to prevent crashes on corrupted localStorage
- `client/src/pages/admin/index.tsx` — Wrapped `JSON.parse(details)` in try-catch for agent activity log
- `client/src/pages/invoices/index.tsx` — Added `staleTime: 30000, refetchOnWindowFocus: true` to prevent stale data after mutations
- `client/src/pages/quotes/index.tsx` — Added `staleTime: 30000, refetchOnWindowFocus: true` to prevent stale data after mutations
- `client/src/pages/auth/verify-email.tsx` — Extracted `getCsrfHeaders()` helper to eliminate CSRF token code duplication

#### Scalability: Connection Pool, Scheduler Guards, Engagement Lock, Cache Fixes
- `server/db.ts` — Connection pool increased from 10 → 25 to prevent connection starvation at 50+ businesses
- `server/services/schedulerService.ts` — All 26+ scheduler jobs now wrapped with `withReentryGuard()` (in-memory Set) to prevent overlapping execution. Critical financial/communication jobs (overage-billing, trial-expiration, customer-insights, morning-brief) additionally wrapped with `withAdvisoryLock()` using PostgreSQL `pg_try_advisory_lock` for cross-instance safety
- `server/storage.ts` — `acquireEngagementLock()` rewritten with raw SQL `SELECT ... FOR UPDATE` to prevent race condition where two agents could simultaneously acquire a lock on the same customer
- `server/services/vapiWebhookHandler.ts` — `BusinessDataCache` now has MAX_SIZE (500 entries) with LRU eviction, `invalidate(businessId)` method, `cleanup()` method, and 15-minute periodic expired entry cleanup
- `server/routes.ts` — Cache invalidation (`dataCache.invalidate()`) added to all business hours, services, staff, staff hours, and appointment mutation endpoints (~20 locations)
- `server/services/socialMediaService.ts` — OAuth `pendingStates` Map now has 15-minute periodic cleanup of expired entries

#### E2E Test Suite (supertest + vitest)
- `server/test/e2e-setup.ts` — Shared test helper: createTestApp(), CSRF helpers, cookie extraction, test fixtures
- `server/test/e2e-auth.test.ts` — 18 tests: register, login, email verification, session management, logout, CSRF enforcement
- `server/test/e2e-business.test.ts` — 49 tests: business CRUD, business hours, services CRUD, customer CRUD, CSRF enforcement, full onboarding flow
- `server/test/e2e-appointments-invoices.test.ts` — 51 tests: appointment CRUD, invoice CRUD with items, NaN validation, ownership checks, CSRF enforcement, full flow (register → appointment → invoice)

---

## File Quick Reference

| What you need | Where to look |
|---------------|---------------|
| Database schema | `shared/schema.ts` |
| Main route registration | `server/routes.ts` (~6000 lines) |
| Feature routes | `server/routes/*.ts` |
| All services | `server/services/*.ts` |
| Platform agents | `server/services/platformAgents/*.ts` |
| Data access layer | `server/storage.ts` |
| React Query config | `client/src/lib/queryClient.ts` |
| Auth hook | `client/src/hooks/use-auth.tsx` |
| Admin dashboard | `client/src/pages/admin/index.tsx` |
| Social media page | `client/src/pages/admin/social-media.tsx` |
| Video templates | `server/services/videoGenerationService.ts` |
| Vapi AI receptionist | `server/services/vapiService.ts` |
| Subscription billing | `server/services/subscriptionService.ts` |
| Post-call intelligence | `server/services/callIntelligenceService.ts` |
| Customer insights/memory | `server/services/customerInsightsService.ts` |
| Agent orchestration | `server/services/orchestrationService.ts` |
| Morning brief email | `server/services/morningBriefService.ts` |
| Mem0 persistent memory | `server/services/mem0Service.ts` |
| LangGraph agent graph | `server/services/agentGraph.ts` |
| Env vars reference | `.env.example` |
| Package scripts | `package.json` |

---

## Build & Run

```bash
# Install
npm install

# Dev (starts both client + server)
npm run dev

# Type check
npx tsc --noEmit

# Tests
npm test

# Build for production
npm run build

# Push DB schema
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

---

---

## ⚠️ Maintenance Rule

**Every AI agent working on this project MUST update this file after making changes.** This includes but is not limited to:

- Adding or removing **files, pages, components, or services**
- Adding or modifying **API routes**
- Changing the **database schema** (new tables, new columns, dropped columns)
- Adding **new integrations** or external service connections
- Changing **environment variables**
- Significant **bug fixes** or behavioral changes
- Adding or updating **platform agents**
- Changes to the **build process, deployment, or infrastructure**

Update the relevant section(s) above and bump the "Last updated" date below. If a new section is needed, add it. **This file is only useful if it's accurate.**

---

*Last updated: March 12, 2026. 346 tests passing (228 unit + 118 E2E). Zero TypeScript errors. 60 tables. Intelligence layer (Sprints 1-3) + Mem0 persistent memory (Sprint 4) + LangGraph.js orchestration (Sprint 5). Security audit: IDOR, XSS, host header injection, CSRF, Stripe, postMessage fixes applied. Defense-in-depth: storage layer multi-tenant scoping, parseInt NaN validation, SMS rate limiting, frontend resilience fixes. Scalability: connection pool 25, scheduler re-entry guards + advisory locks, engagement lock race condition fix, cache max size + periodic cleanup + invalidation on mutations. E2E tests: auth flow (18), business+customer CRUD (49), appointments+invoices (51).*
