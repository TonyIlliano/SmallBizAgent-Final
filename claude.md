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

## Database Schema (61 Tables)

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
| `staff_time_off` | Staff vacation/PTO blocks | staffId, businessId, startDate, endDate, reason, allDay, note |
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
| `agentCoordinator` | **Brain** — routes outputs between agents, sends intervention emails, provides real platform stats to content agents | Triggered by other agents |
| `contentSeoAgent` | Blog post generation (GPT or templates), enriched with real platform stats | Every 7 days |
| `socialMediaAgent` | Social post drafts for Twitter/FB/IG/LinkedIn, enriched with real platform stats | Daily |
| `churnPredictionAgent` | Predict at-risk businesses → feeds into coordinator for intervention emails | Every 24 hours |
| `competitiveIntelAgent` | Competitive landscape analysis (internal signals) | Every 7 days |
| `healthScoreAgent` | Business health scoring → feeds critical scores into coordinator for escalation | Every 24 hours |
| `leadScoringAgent` | Score & rank leads → feeds hot leads into coordinator for nudge emails | Every 12 hours |
| `onboardingCoachAgent` | Guide users through setup with step-by-step nudge emails | Every 6 hours |
| `revenueOptimizationAgent` | Revenue improvement suggestions (upgrade/downgrade/expansion) | Every 24 hours |
| `supportTriageAgent` | Triage support issues (provisioning, calls, SMS, payments) | Every 6 hours |
| `testimonialAgent` | Generate testimonials/case studies | Every 7 days |

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
| `c94123a` | Fix Vapi AI receptionist: personalized greetings + recording disclosure |
| `be413d5` | Fix Vapi hang-up: revert 'one moment' firstMessage, keep conversation flowing |
| `fdbe727` | Fix critical webhook auth bug (isAuthenticated blocking all /api/* webhooks) + enhance Vapi AI receptionist |
| `bbea37c` | Fix Vapi webhook auth: allow requests when Vapi has no server secret configured |
| `3cbd1d5` | Fix staff schedule gaps (merge with business hours for uncovered days) + fix reschedule SMS not sending (customer phone extraction in tool-calls path) |
| `a39f168` | Improve Vapi speed + intelligence: eliminate startup getStaffMembers call, reduce delays, static imports, parallel queries in recognizeCaller |

### Uncommitted changes (current session):

#### Stripe Subscription Lifecycle Fixes (Revenue-Critical)
- **Goal**: Fix 3 critical bugs in the subscription lifecycle that could cause revenue loss or resource leaks.
- `server/services/schedulerService.ts` — **BUG FIX (CRITICAL)**: Trial expiration scheduler was skipping businesses with `subscriptionStatus: 'trialing'` (line 606), meaning expired trials were never detected. Fixed: now only skips `'active'` status. After deprovisioning, updates `subscriptionStatus` to `'expired'`. Also added 7-day trial warning (was only 3-day and 1-day).
- `server/services/usageService.ts` — **BUG FIX (CRITICAL)**: `isSubscribed` check treated `'trialing'` as subscribed even when trial had expired. Fixed: `'trialing'` only counts if `isTrialActive` is true (checks actual `trialEndsAt` date). Applied to both `getUsageInfo()` and `canBusinessAcceptCalls()`.
- `server/services/schedulerService.ts` — **NEW**: `startDunningDeprovisionScheduler()` runs every 12 hours. Checks businesses with `'past_due'` or `'payment_failed'` status for 7+ days (grace period). Deprovisions Twilio/Vapi resources, updates status to `'suspended'`, sends suspension email. Uses advisory lock for cross-instance safety.
- `server/services/subscriptionService.ts` — **NEW**: `handleInvoicePaymentSucceeded()` now auto-re-provisions businesses that were previously deprovisioned (canceled/expired/suspended/past_due). Calls `provisionBusiness()`, sets `subscriptionStartDate`, sends welcome-back email. Users no longer need to manually reprovision after resubscribing.
- `server/services/subscriptionService.ts` — **BUG FIX**: `handleSubscriptionCanceled()` now clears `stripeSubscriptionId` to `null` so resubscription creates a clean new subscription.
- `server/services/subscriptionService.ts` — **FIX**: `createSubscription()` now sets `subscriptionStartDate` for accurate overage billing period calculation.
- `server/services/subscriptionService.ts` — **CLEANUP**: Removed dead `handleInvoicePaymentFailed()` method (replaced by `handleInvoicePaymentFailedWithDunning()`, was never called).

#### Onboarding Flow Improvements
- **Goal**: Improve onboarding completion rates by persisting wizard progress, adding missing critical steps (business hours, staff), and fixing dashboard checklist issues.
- `shared/schema.ts` — Added `onboardingProgress` JSONB column to `users` table for persisting wizard step progress.
- `server/migrations/runMigrations.ts` — Added `onboarding_progress JSONB` column migration for Railway deploy.
- `server/auth.ts` — Added 2 new API endpoints: `POST /api/onboarding/progress` (save step progress to DB), `GET /api/onboarding/progress` (load saved progress). Debounced saves prevent excessive DB writes.
- `client/src/hooks/use-onboarding-progress.ts` — **REWRITTEN**: Now persists to database via JSONB column instead of in-memory-only React state. Fetches saved progress on mount via React Query, resumes from last saved step. Debounced save (500ms) on each step change. Merges saved progress with defaults to handle new steps added after a save. Added `hours` and `staff` step types.
- `client/src/pages/onboarding/steps/hours-setup.tsx` — **NEW**: Business hours onboarding step. 7-day schedule with open/close times and closed toggle. 3 quick presets (Mon-Fri 9-5, Mon-Sat Extended, 7 Days a Week). Loads existing hours if set. Saves to `business_hours` table via `PUT /api/business/:id/hours`.
- `client/src/pages/onboarding/steps/staff-setup.tsx` — **NEW**: Staff/team onboarding step. Add team members with name, email, phone, and specialty. Shows existing staff list with delete. Dialog-based add form. Skip button if not ready to add staff.
- `client/src/pages/onboarding/index.tsx` — **UPDATED**: Added `hours` step after Services, `staff` step for non-restaurant businesses. Staff step conditional (restaurants get staff via POS). Imports new step components. Improved step resumption logic for conditional steps.
- `client/src/pages/onboarding/steps/welcome.tsx` — Updated "What we'll set up" section to reflect new steps (Services & Hours, Your Team).
- `client/src/components/dashboard/setup-checklist.tsx` — **BUG FIX**: Fixed receptionist checklist link from `/settings?tab=profile` to `/receptionist` (where actual provisioning happens). Fixed hours checklist link from `/settings?tab=integrations` to `/settings?tab=hours`.

#### Staff Time Off / Vacation Blocking
- **Goal**: Allow business owners to block off specific dates when staff members are unavailable (vacation, sick days, PTO), and have the AI receptionist automatically respect these blocks.
- `shared/schema.ts` — Added `staff_time_off` table with columns: staffId, businessId, startDate, endDate, reason, allDay, note. Includes insert schema and TypeScript types.
- `server/storage.ts` — Added 6 storage methods: `getStaffTimeOff()`, `getStaffTimeOffByBusiness()`, `getStaffTimeOffForDate()` (date overlap query), `createStaffTimeOff()`, `updateStaffTimeOff()`, `deleteStaffTimeOff()`. Also updated `getAvailableStaffForSlot()` to skip staff with all-day time off on the requested date.
- `server/routes.ts` — Added 5 API endpoints: `GET /api/staff/time-off` (business-wide), `GET /api/staff/:id/time-off` (per staff), `POST /api/staff/:id/time-off` (create), `PUT /api/staff/time-off/:timeOffId` (update), `DELETE /api/staff/time-off/:timeOffId` (delete). All endpoints scoped by businessId with ownership verification and cache invalidation.
- `server/services/vapiWebhookHandler.ts` — **checkAvailability** now checks `isStaffOffOnDate()` before generating slots. Range requests skip days where staff has time off. Single-date requests return `staffOff: true` with `nextAvailable` date suggestion. **bookAppointment** rejects bookings when staff has time off with helpful error message. **getStaffSchedule** includes upcoming time-off entries in the response message (e.g., "Mike also has time off scheduled: Mon Mar 20 - Fri Mar 24 (Vacation)").
- `server/migrations/runMigrations.ts` — Added `CREATE TABLE IF NOT EXISTS staff_time_off` with indexes on `(staff_id, start_date, end_date)` and `(business_id)` for auto-migration on Railway.
- `client/src/components/settings/StaffScheduleManager.tsx` — Added "Time Off" button in staff table actions (owner view). New dialog with: date range picker, reason dropdown (Vacation/Sick/Personal/Training/Holiday/Other), optional note field. Shows list of existing time-off entries sorted by date with delete capability. Past entries shown dimmed. AI receptionist automatically respects all blocked dates.
- `server/routes.ts` — Added 3 staff-portal endpoints: `GET /api/staff/me/time-off` (view own), `POST /api/staff/me/time-off` (create own), `DELETE /api/staff/me/time-off/:timeOffId` (delete own). Staff can only manage their own time off, scoped by their userId→staffId mapping.
- `client/src/pages/staff/dashboard.tsx` — Added "Time Off" card to staff dashboard with add/view/delete capability. Staff members can self-serve their own vacation/sick days without needing the owner to do it.

#### Vapi Call Flow Redesign (Cohesion & Smoothness)
- **Goal**: Make the AI receptionist feel like one smooth conversation instead of choppy disconnected checks
- `server/services/vapiWebhookHandler.ts` — **recognizeCaller** response simplified from 24 fields to 7 fields with a pre-composed `summary` narrative. Intelligence, insights, and Mem0 data are combined server-side into a natural-language paragraph the AI can weave into conversation.
- `server/services/vapiWebhookHandler.ts` — **checkAvailability** now returns 3-5 curated time slots (spread across morning/midday/afternoon/evening) instead of all 48. Added `pickBestSlots()` and `parseSlotHour()` helper functions. Removed pre-composed `message` fields — AI composes its own natural phrasing.
- `server/services/vapiService.ts` — **System prompt restructured** from ~930 lines to ~300 lines. Organized into 6 clean sections: Identity & Rules, Business Info, 5-Beat Call Flow (Greet→Understand→Check→Book→Close), Key Rules, Industry-Specific, Tools Reference. Eliminated duplicated instructions (date handling was repeated 3x, name collection 4x, staff instructions 3x).
- `server/services/vapiService.ts` — **Tool descriptions shortened** to 1 sentence each. Vapi sends these with every LLM turn — shorter = faster responses.
- `server/services/vapiService.ts` — **Industry prompt conflicts fixed**: Removed `getStaffMembers` instructions from salon, barber, and general industry prompts (staff is pre-loaded in prompt, so these conflicted with "do NOT call getStaffMembers at start").
- `server/services/vapiService.ts` — **Vertical-specific terminology dictionaries** added to all 15 industry prompts (automotive, plumbing, HVAC, salon, barber, electrical, cleaning, landscaping, construction, medical, dental, veterinary, fitness, restaurant, retail, professional, general). Each prompt now has a `CUSTOMER LINGO` section mapping common slang/jargon to the correct service or action (e.g., barbershop "lineup"/"shape-up" → edge-up service, automotive "she's pulling to the right" → alignment, HVAC "short cycling" → diagnostic). This helps the AI understand what customers actually mean when they use informal language and map it to bookable services.
- `server/services/vapiService.ts` — **Latency optimization: startSpeakingPlan** added to both create and update paths. Default `onNoPunctuationSeconds` was 1.5s (hidden latency killer). Now set to 0.5s with tuned endpointing: `onPunctuationSeconds: 0.1`, `onNumberSeconds: 0.4`, `waitSeconds: 0.4`. Cuts perceived response time from ~1.5s to ~0.5s. `smartEndpointingEnabled: false` (uses transcription endpointing instead — faster for English).
- `server/services/vapiService.ts` — **maxTokens: 250** added to LLM config in both create and update paths. Caps AI response length for voice — prevents rambling, faster TTS generation.
- `server/services/vapiService.ts` — **Update path transcriber fix**: `model: 'nova-2'` was missing from the update path transcriber config (another create/update drift bug). Also added `temperature: 0.6` to update path model config for consistency.
- `server/services/vapiWebhookHandler.ts` — **Batch staff-service queries**: Added `getCachedStaffServiceMap()` helper that fetches all staff-service mappings for a business in parallel (one `Promise.all`) and caches the result. Replaces the N+1 sequential `getStaffServices(s.id)` pattern in `checkAvailability` and `bookAppointment`. Saves 50-150ms when checking staff-service compatibility for 3+ staff members.
- `server/services/vapiWebhookHandler.ts` — **Batch service lookups in recognizeCaller**: Service name lookup for upcoming appointments now uses `getCachedServices()` (fetched in parallel with appointments + business) instead of individual `storage.getService()` calls per appointment. Eliminates per-appointment DB queries.
- `server/routes.ts` — Cache invalidation for `staffServiceMap` added to `setStaffServices` endpoint.

### Prior uncommitted changes (Security Audit & Bug Fixes):

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

#### Calendar Integration Fixes (Google/Microsoft/Apple)
- `server/services/googleCalendarService.ts` — **CRITICAL FIX**: OAuth redirect URI now constructed from `GOOGLE_REDIRECT_URI` → `APP_URL` → localhost fallback chain instead of relative path `/api/calendar/google/callback` which fails Google OAuth validation. Uses `getGoogleRedirectUri()` function.
- `server/services/microsoftCalendarService.ts` — **CRITICAL FIX**: Same redirect URI fix for Microsoft. Uses `getMicrosoftRedirectUri()` function.
- `server/services/calendarService.ts` — **BUG FIX**: Apple Calendar disconnect now returns `true` instead of `void`. The disconnect route checks `if (result)` — returning void caused disconnect to report failure even when it succeeded.
- `server/routes/calendarRoutes.ts` — **BUG FIX**: OAuth callback postMessage now uses `window.location.origin` instead of server-side `APP_URL` template string. This prevents origin mismatch when `APP_URL` differs from the actual browser origin (e.g., www vs bare domain).
- `server/index.ts` — Added calendar-specific startup validation: logs redirect URI for Google/Microsoft if credentials are set, warns if redirect URI would be relative, warns if ENCRYPTION_KEY missing in production (needed for calendar token encryption).

#### 14-Day Free Trial (No Credit Card Required)
- `server/services/subscriptionService.ts` — `createSubscription()` now detects active trial period. If business has an active trial and no Stripe subscription, saves `stripePlanId` and returns `{ status: 'trialing', trialEndsAt, planName }` without creating a Stripe subscription or requiring payment. After trial expires, the same endpoint creates a real Stripe subscription with `clientSecret` for payment.
- `client/src/components/subscription/SubscriptionPlans.tsx` — `onSuccess` handler now checks for `status === 'trialing'` response: shows "Plan selected!" toast and redirects to `/dashboard` instead of `/payment`.
- `client/src/pages/onboarding/subscription.tsx` — Updated text to "14-day free trial. No credit card required. Cancel anytime."
- `client/src/pages/landing.tsx` — Updated pricing section text to "14-day free trial. No credit card required. Cancel anytime."
- **Trial flow**: Register → Select plan (saved to `stripePlanId`) → Onboarding → Dashboard (no payment). Trial expires in 14 days → Settings > Subscription → real Stripe subscription created → payment page.
- **Existing infrastructure** already handles: trial expiration scheduler (deprovisioning + warning emails), trial usage limits (25 free minutes), email drip campaigns, trial status tracking.

#### Trial Expiration → Grace Period Model
- **Design**: Instead of immediately deprovisioning when a trial expires, the system now uses a 30-day grace period:
  - **Trial active**: Full AI features, phone number, everything works
  - **Trial expired → `grace_period` (0-30 days)**: Phone number KEPT, AI calls DISABLED (`receptionistEnabled: false`). Business can still log in, manage customers, etc. Nudge emails sent at 0, 7, 14, 21 days past expiry encouraging subscription.
  - **30+ days past trial, no subscription → `expired`**: Phone number RELEASED, Vapi assistant deleted, final notification sent.
- `server/services/schedulerService.ts` — `runTrialExpirationCheck()` rewritten with 2-phase model: Phase 1 sets status to `grace_period` and disables AI. Phase 2 (after 30 days) calls `deprovisionBusiness()`. Added `sendGracePeriodNudge()` and `sendDeprovisionNotification()` helper functions. Admin businesses and founder accounts are always protected.
- `server/services/usageService.ts` — `canBusinessAcceptCalls()` now explicitly blocks `grace_period` businesses with friendly message. `getUsageInfo()` returns `planName: 'Grace Period (AI Paused)'` and `planTier: 'grace_period'` for these businesses.
- `server/services/subscriptionService.ts` — `handleInvoicePaymentSucceeded()` now handles `grace_period` businesses: if they still have a phone number, just re-enables AI (`receptionistEnabled: true`) without re-provisioning. If fully deprovisioned, triggers full `provisionBusiness()`.
- `server/routes.ts` — `/api/business/:id/receptionist/provision` endpoint now restores `subscriptionStatus` to `'trialing'` when admin re-provisions a business that's in `expired` or `grace_period` status.
- `scripts/reprovision-business.ts` — One-time script to re-provision admin's business with a specific Twilio phone number.

#### Vapi AI Receptionist Fixes (Critical)
- `server/routes.ts` — **BUG FIX**: Removed `isAuthenticated` from `app.use("/api", exportRoutes)` which was blocking ALL `/api/*` requests including Vapi webhooks with 401. Export routes check auth internally.
- `server/routes.ts` — **BUG FIX**: Vapi webhook auth now allows requests when Vapi has no server secret configured (`isServerUrlSecretSet: false`). Previously, if `VAPI_WEBHOOK_SECRET` was set on Railway but Vapi wasn't sending it, all function calls were rejected.
- `server/routes.ts` — **BUG FIX**: Tool-calls handler now extracts `message.customer` and injects into `callObj.customer` when missing. Vapi's `tool-calls` format may place customer info at message level instead of `message.call.customer`, causing `callerPhone` to be undefined and silently skipping SMS confirmations on reschedule/booking.
- `server/services/vapiWebhookHandler.ts` — **BUG FIX**: `getStaffSchedule()` now merges with business hours for uncovered days. Previously, if a staff member had partial `staff_hours` entries (e.g., Mon-Thu only), days without rows (e.g., Friday) were invisible — not in workingDays or daysOff. Now iterates all 7 days and falls back to business hours for days without staff-specific entries.
- `server/services/vapiService.ts` — Silence timeout increased from 15s to 30s to prevent premature hangups. Reverted "one moment" firstMessage. Added recording disclosure to first message. Added personalized greetings. Temperature lowered 0.7→0.6 for more consistent responses. Response delay reduced 0.5→0.3s, LLM request delay reduced 0.1→0s. Staff members pre-loaded into system prompt at assistant creation/update (eliminates getStaffMembers round-trip on every call start).
- `server/services/vapiWebhookHandler.ts` — Static imports for `callIntelligenceService` and `mem0Service` (eliminates dynamic import cold-start latency). `recognizeCaller()` now parallelizes customer lookup + business fetch with `Promise.all`.

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

*Last updated: March 16, 2026. 346 tests passing (228 unit + 118 E2E). Zero TypeScript errors. 61 tables. Trial expiration redesigned: grace period model (30-day window where number is kept but AI is disabled, then deprovision after 30 days with no subscription). Subscription reactivation: grace_period businesses get AI re-enabled on payment without re-provisioning; fully deprovisioned businesses get full re-provisioning. Admin re-provision endpoint restores status to trialing. Stripe subscription lifecycle fixes: dunning deprovisioning scheduler (7-day grace period then suspend), auto-reprovision on resubscription, subscriptionStartDate set on create, stale subscriptionId cleared on cancel. Onboarding improvements: wizard progress persisted to database JSONB column, business hours + staff steps added to wizard. Staff time-off/vacation blocking: staff_time_off table + CRUD API + UI dialog + Vapi integration. Model: gpt-5-mini with ElevenLabs turbo voice + Deepgram nova-2 STT.*
