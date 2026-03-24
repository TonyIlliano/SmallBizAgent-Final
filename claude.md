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
| **AI/LLM** | OpenAI (gpt-5-mini for Vapi voice, gpt-5.4-mini for other services) |
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
| `/website` | WebsiteBuilder | Website builder: scanner, OpenAI generation, customizations, domains, site serving |
| `/google-business-profile` | GoogleBusinessProfilePage | GBP dashboard: sync, business info, reviews, posts, SEO score |
| `/staff/dashboard` | StaffDashboard | Staff-only view |

### Admin (admin role only)
| Route | Page | Purpose |
|-------|------|---------|
| `/admin` | AdminDashboard | Platform stats, users, businesses, revenue, agents, webhooks, content |
| `/admin/phone-management` | PhoneManagement | Twilio number provisioning |
| `/admin/social-media` | SocialMediaAdmin | Social post queue, OAuth connections, video generation |

---

## Database Schema (66 Tables)

### Core
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | username, email, password, role (user/staff/admin), businessId, emailVerified, twoFactorEnabled |
| `businesses` | Business profiles | name, industry, type, phone, timezone, bookingSlug, twilioPhoneNumber, vapiAssistantId, subscriptionStatus, stripeCustomerId, gbpLastSyncedAt, all POS tokens |
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
| `social_media_posts` | Generated social posts | platform, content, mediaUrl, mediaType, status (draft/approved/published/rejected), industry, details (jsonb), likes, comments, shares, saves, reach, engagementScore, isWinner |
| `video_briefs` | AI-generated video ad briefs + rendered videos | vertical, platform, pillar, briefData (jsonb), sourceWinnerIds (jsonb), renderStatus (none/rendering/done/failed), renderId, videoUrl, thumbnailUrl, voiceoverUrl, aspectRatio, renderError, renderedAt |
| `video_clips` | Pre-recorded screen recording library | name, description, category (dashboard/calls/calendar/sms/invoice/crm/agents/general), s3Key, s3Url, durationSeconds, width, height, fileSize, tags (jsonb), sortOrder |
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

### Google Business Profile
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `gbp_reviews` | Synced GBP reviews | businessId, gbpReviewId (unique), reviewerName, reviewerPhotoUrl, rating (1-5), reviewText, reviewDate, replyText, replyDate, flagged (bool), createdAt, updatedAt |
| `gbp_posts` | GBP local posts (drafts + published) | businessId, content, callToAction, callToActionUrl, status (draft/published/failed), gbpPostId, publishedAt, createdAt, updatedAt |

### Website Builder
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `websites` | One-page sites generated via OpenAI | businessId (unique), htmlContent, domainTier (subdomain/custom/purchased), subdomain (unique), customDomain, domainVerified, websiteSetupRequested, customizations (jsonb), scanData (jsonb), generatedAt |

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
| `videoAssemblyService` | Automated video production pipeline: brief → clips + Pexels b-roll + TTS voiceover → Shotstack multi-track render → S3 |
| `pexelsService` | Stock video search via Pexels API (free, 135K+ videos). Keyword search, HD download URLs |
| `ttsService` | Text-to-speech voiceover via OpenAI TTS API (tts-1-hd). 9 voices, MP3 output to S3 |
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
| `websiteGenerationService` | Generates complete one-page websites via OpenAI (gpt-5.4-mini). Pulls all business data from DB (hours, services, staff, branding, booking), builds dynamic prompt, returns self-contained HTML with embedded CSS. 15+ vertical design presets. Customization overrides (accent color, font style, hero headline/subheadline, CTA texts, about text, footer message, section toggles) |
| `googleBusinessProfileService` | Full bi-directional GBP sync. OAuth via `calendarIntegrations` (provider='google-business-profile'). Business info pull/push with conflict detection. Review sync + auto-flag low ratings. Local post creation/publishing. SEO score calculation (100-point, 12 criteria). `runGbpSync()` for scheduler. GBP API v1 (business info) + v4 (reviews/posts) |

---

## API Route Files (server/routes/)

| File | Mount Point | Purpose |
|------|-------------|---------|
| `adminRoutes` | `/api/admin/*` | Platform admin CRUD, stats, blog posts, business controls, user management, alerts |
| `analyticsRoutes` | `/api/analytics/*` | Business analytics queries, AI ROI |
| `appointmentRoutes` | `/api/appointments/*` | Appointment CRUD |
| `automationRoutes` | `/api/automations/*` | Agent config, activity logs |
| `bookingRoutes` | `/api/booking/*` | Public booking, availability |
| `calendarRoutes` | `/api/calendar/*` | Calendar OAuth callbacks |
| `customerRoutes` | `/api/customers/*` | Customer CRUD |
| `cloverRoutes` | `/api/clover/*` | Clover POS OAuth, menu, orders |
| `squareRoutes` | `/api/square/*` | Square POS integration |
| `heartlandRoutes` | `/api/heartland/*` | Heartland POS integration |
| `socialMediaRoutes` | `/api/social-media/*` | Social posts, video gen, OAuth, publishing, engagement metrics, winners, generate-from-winners, video briefs, clip library CRUD, video rendering pipeline, TTS voices, pipeline status |
| `subscriptionRoutes` | `/api/subscriptions/*` | Plans, billing portal, promo codes |
| `stripeConnectRoutes` | `/api/stripe-connect/*` | Stripe Connect for payments |
| `phoneRoutes` | `/api/phone/*` | Twilio number provisioning |
| `marketingRoutes` | `/api/marketing/*` | Campaigns, drip emails |
| `quoteRoutes` | `/api/quotes/*` | Quote CRUD |
| `quickbooksRoutes` | `/api/quickbooks/*` | QuickBooks sync |
| `webhookRoutes` | `/api/webhooks/*` | Webhook management |
| `zapierRoutes` | `/api/zapier/*` | Zapier integration |
| `exportRoutes` | `/api/export/*` | CSV data export |
| `gbpRoutes` | `/api/gbp/*` | Google Business Profile: OAuth, sync, reviews, posts, SEO score, conflict resolution |
| `inventoryRoutes` | `/api/inventory/*` | Inventory management |
| `locationRoutes` | `/api/locations/*` | Multi-location |
| `recurring` | `/api/recurring/*` | Recurring schedules |
| `import` | `/api/import/*` | Data import |
| `embedRoutes` | `/api/embed/*` | Embedded booking widget |
| `expressSetupRoutes` | `/api/onboarding/*` | Express onboarding (2-minute setup with auto-provisioning) |
| `websiteBuilderRoutes` | `/api/website-builder/*`, `/sites/*` | Business scanner, OpenAI website generation, domain management, website serving, feature gates |

**Note:** Many routes are also defined inline in `server/routes.ts` (~6000 lines), especially auth, call logs, invoices, jobs, Twilio/Vapi webhooks.

**Intelligence & Insights API endpoints (inline in routes.ts):**
- `GET /api/call-intelligence/:callLogId` — Intelligence for a specific call
- `GET /api/call-intelligence/business/summary` — Aggregated call intelligence stats
- `GET /api/customers/:id/insights` — Customer insights profile
- `GET /api/customers/insights/high-risk` — High-risk customers for the business

**AI ROI endpoint (analyticsRoutes.ts):**
- `GET /api/analytics/ai-roi` — AI-attributed revenue funnel (calls → bookings → revenue, ROI, conversion rate)

**Admin business/user management endpoints (adminRoutes.ts):**
- `POST /api/admin/businesses/:id/provision` — Re-provision Twilio + Vapi for a business
- `POST /api/admin/businesses/:id/deprovision` — Release resources and mark business canceled
- `GET /api/admin/businesses/:id/detail` — Detailed business view (services, staff, hours, customers, calls, revenue, config)
- `POST /api/admin/users/:id/disable` — Disable a user account
- `POST /api/admin/users/:id/enable` — Enable a disabled user account
- `POST /api/admin/users/:id/reset-password` — Admin password reset
- `PATCH /api/admin/users/:id/role` — Change user role (user/staff/admin)
- `GET /api/admin/alerts` — Platform alerts with quick-action buttons (failed payments, grace period, provisioning failures)
- `POST /api/admin/businesses/:id/extend-trial` — Extend trial by 14 days, restore trialing status
- `GET /api/admin/audit-logs` — Paginated, filterable admin audit log
- `POST /api/admin/impersonate/:businessId` — Start impersonating a business (session-based)
- `POST /api/admin/stop-impersonation` — Stop impersonating, restore admin context

**Express onboarding endpoint (expressSetupRoutes.ts):**
- `POST /api/onboarding/express-setup` — One-step business setup (create business, services, hours, provision Twilio+Vapi)

**Website Builder endpoints (websiteBuilderRoutes.ts):**
- `POST /api/website-builder/generate` — Generate website from DB data via OpenAI (gpt-5.4-mini). Accepts optional `{ customizations }`. Returns `{ html, generated_at, preview_url }`
- `PUT /api/website-builder/customizations` — Save customization preferences without regenerating
- `GET /api/website-builder/domain` — Get current domain info + feature gates + customizations for UI
- `POST /api/website-builder/set-custom-domain` — Set custom domain, return CNAME instructions (Professional+ plan)
- `POST /api/website-builder/verify-domain` — DNS CNAME lookup to verify custom domain
- `POST /api/website-builder/purchase-domain` — Stub (returns "coming soon")
- `GET /api/website-builder/site` — Get website record for authenticated business
- `PUT /api/website-builder/site` — Save HTML content
- `POST /api/website-builder/request-setup` — Elite plan: flag managed setup requested
- `GET /api/website-builder/features` — Feature flags for current plan
- `GET /sites/:subdomain` — Public: serve HTML for subdomain

**Google Business Profile endpoints (gbpRoutes.ts):**
- `POST /api/gbp/sync/:businessId` — Full sync from GBP (business info + reviews)
- `GET /api/gbp/business-info/:businessId` — Get cached/fresh business info
- `POST /api/gbp/push/:businessId` — Push specified fields to GBP (requires `{ fields: [...] }`)
- `POST /api/gbp/resolve-conflict/:businessId` — Resolve a field conflict (keep_local or keep_gbp)
- `POST /api/gbp/reviews/sync/:businessId` — Batch review sync from GBP
- `GET /api/gbp/reviews/:businessId` — List local reviews (supports ?flagged, ?page, ?limit)
- `POST /api/gbp/reviews/:reviewId/reply` — Reply to a review on GBP
- `POST /api/gbp/reviews/:reviewId/suggest-reply` — AI reply suggestion via OpenAI
- `POST /api/gbp/posts/generate/:businessId` — AI-generate a GBP post draft
- `POST /api/gbp/posts/publish/:businessId` — Publish draft to GBP
- `GET /api/gbp/posts/:businessId` — List posts (drafts + published)
- `GET /api/gbp/seo-score/:businessId` — Calculate SEO score (100-point, 12 criteria)
- `GET /api/gbp/debug/:businessId` — Full diagnostic JSON (connection status, stored data, accounts, locations, scheduler pool)
- `POST /api/gbp/select-location/:businessId` — Select account+location without requiring booking enabled

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
| `PEXELS_API_KEY` | Pexels stock video search (free API, optional — videos render without b-roll if missing) |

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
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for admin alerts (optional) |
| `ADMIN_TIMEZONE` | Timezone for admin digest email, default `America/New_York` (optional) |

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
  - **Admin digest** (hourly check, sends at 8am in ADMIN_TIMEZONE)
  - **GBP sync** (24h interval, syncs business info + reviews for all connected businesses)

---

## Recent Work (Commits)

| Commit | Change |
|--------|--------|
| `d37ba5b` | Add logout button to mobile bottom nav |
| `87e86d4` | 4x faster recognizeCaller: single parallel batch (~150ms vs ~600ms) |
| `c3665e4` | Add platform messages to admin + scope business messages to customers only |
| `367b565` | Add message log to AI Agents: full SMS visibility for business owners |
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
| `bd1d547` | Update claude.md with Vapi performance improvements |
| `86cc744` | Upgrade Vapi AI model from gpt-4o-mini to gpt-5-mini |
| `205d213` | Fix Vapi saying IDs aloud, wrong dates, and reduce latency |
| `07597a2` | Redesign Vapi call flow for smooth, cohesive conversations |
| `5ef1561` | Fix Mike G. name display and reschedule SMS not sending |
| `478be29` | Fix premature hang-up: separate "anything else?" from farewell |
| `bb62246` | Tighten call ending: immediate farewell when caller says bye |
| `4f24d4c` | Optimize Vapi: voice settings, transcriber, latency, log cleanup |
| `c815a65` | Add vertical-specific terminology dictionaries to all 15 industry prompts |
| `c4da52d` | Optimize Vapi latency: startSpeakingPlan, maxTokens, batch queries |
| `9ca3666` | Fix services hallucination + strengthen caller recognition |
| `1048657` | Fix call not hanging up: broaden endCallPhrases to catch common farewells |
| `73c5d38` | Optimize Vapi for saving minutes: efficiency prompting + shorter silence timeout |
| `13dba13` | Add staff time-off/vacation blocking with Vapi AI integration |
| `f5c7332` | Fix Stripe subscription lifecycle bugs + improve onboarding completion |
| `f55c94d` | Fix trial expiration scheduler deprovisioning admin/founder businesses |
| `16c14cc` | Change trial expiration to 30-day grace period model (keep number, disable AI only) |
| `5b4ea21` | Fix deprovision failing on already-released Twilio numbers (stale SID) |
| `7a7b601` | Fix admin provisioning: full Twilio+Vapi+phone in one step, protect from scheduler |
| `91aafb9` | Fix Refresh Assistant: always connect phone to Vapi after updating |
| `c22f866` | Fix immediate hang-up: endCallPhrases matched the greeting |
| `e5de90f` | Fix AI telling callers to be brief + increase maxTokens to 350 |
| `1319c19` | Fix prompt leakage: remove all sentence-length instructions from system prompt |
| `e371f7d` | Fix create/update drift: endCallPhrases and maxTokens in update path |
| `aedce79` | Add real-time open/closed status to every call via recognizeCaller |
| `e388caf` | Fix duplicate appointment reminders on every deploy/restart |
| `643ae0b` | SMS compliance: add CONFIRM handler + TCPA opt-out to all customer SMS |
| `8ed6485` | TCPA compliance: opt-in welcome SMS + proper footer strategy |
| `9163e10` | Fix STOP handler + Vapi call quality: STOP only opts out of marketing, switch Deepgram to English-only |
| `d5e43ab` | Fix Vapi confirmAppointment tool registration |
| `73eca02` | SMS CANCEL + RESCHEDULE keywords for appointment self-service |
| `06a84db` | Fix AI saying "9:30 AM 7 PM" instead of "9:30 AM to 7 PM" |
| `df0340b` | Fix AI saying "Monday Friday" instead of "Monday through Friday" |
| `a9c34ec` | Fix custom greeting being replaced instead of preserved |
| `6a51f23` | Tie recording disclosure to Call Recording toggle, fix AI Insights gate |
| `bedaaab` | Add unsaved changes warning to receptionist config form |
| `ecc66d7` | Warn before navigating away with unsaved receptionist config changes |
| `3d5a661` | Fix require('crypto') crash in ESM build (breaks drip emails, quotes, social) |
| `ae9117c` | Add error boundaries, AI ROI card, help tooltips, and context help |
| `cc061cb` | Add express onboarding: 2-minute setup with auto-provisioning |
| `cf664cf` | Enhance admin dashboard: business controls, user management, live monitoring |

### Recent changes (uncommitted):

#### SMS Reliability Fixes — 5 Bugs + Agent Audit
- **Goal**: Fix multiple SMS issues: wrong appointment times in reminders, missing confirmation texts, "Cancel" keyword intercepted by Twilio, AI reasoning leaking into customer messages. Plus full audit and fix of all SMS agent services.

##### 1. Reminder SMS Timezone Bug (CRITICAL)
- `server/services/reminderService.ts` — `sendAppointmentReminder()` was formatting appointment times without the business timezone. On Railway (UTC server), a 5:30 PM ET appointment would display as "9:30 PM" or "10:30 PM". Fixed: now reads `business.timezone` and passes it to `toLocaleDateString()`/`toLocaleTimeString()` options.

##### 2. CONFIRM Handler Timezone Bug
- `server/routes.ts` — The CONFIRM keyword SMS handler (line ~4752) had the same timezone bug as the reminder service. Fixed: now fetches business timezone and uses it for date/time formatting, matching the CANCEL and RESCHEDULE handlers which already had the fix.

##### 3. "Cancel" Keyword Intercepted by Twilio
- **Root cause**: Twilio Messaging Service treats "CANCEL" as a reserved opt-out keyword and auto-replies with an unsubscribe message BEFORE the app webhook fires. Customers texting "Cancel" get unsubscribed instead of having their appointment cancelled.
- All SMS templates (`reminderService.ts`, `notificationService.ts`, `routes.ts`) changed from "CANCEL APPT" to "C" — a single letter that Twilio will never intercept. Keyword handler in `routes.ts` updated to accept "C" as a cancel request (still accepts "CANCEL"/"CANCEL APPT" as fallbacks).
- `server/services/notificationService.ts` — Changed welcome SMS wording from "STOP to cancel" to "STOP to unsubscribe" to avoid customers texting "CANCEL" when they mean to stop messages.

##### 4. AI Reasoning Leaking into Customer SMS
- **Root cause**: AI-generated parenthetical notes like "(Note: The assistant must follow call flow...)" were reaching customers in SMS messages.
- `server/services/twilioService.ts` — Added `sanitizeSmsBody()` function that strips AI reasoning patterns: `(Note: ...)`, `(Internal: ...)`, `(System: ...)`, `[Debug: ...]`, etc. Applied to ALL outgoing SMS via the `sendSms()` chokepoint.
- `server/routes.ts` — Added inline sanitization to the SMS agent conversation reply path (TwiML responses bypass `sendSms()`).

##### 5. Missing Confirmation SMS After Phone Booking (CRITICAL)
- **Root cause**: `recognizeCaller()` creates a placeholder customer record early in the call without `smsOptIn: true`. When `bookAppointment()` later finds this existing customer, it skips customer creation (where `smsOptIn: true` was set). Result: customer never has `smsOptIn`, so `canSendSms()` returns false and confirmation/reminder SMS are silently skipped.
- `server/services/vapiWebhookHandler.ts` — `recognizeCaller()` now sets `smsOptIn: true` when creating placeholder customer records (caller provided phone by calling = consent to transactional SMS).
- `server/services/vapiWebhookHandler.ts` — `bookAppointment()` now checks if existing customer has `smsOptIn` set, and if not, sets it and sends the TCPA opt-in welcome message. This catches customers created before this fix.

##### 6. SMS Agent Audit Fixes
- `server/services/noShowAgentService.ts` — **Timezone bug**: Appointment time in no-show SMS was formatted in server timezone (UTC on Railway). Fixed to use `business.timezone`.
- `server/services/conversationalBookingService.ts` — **Engagement lock leak**: When SMS booking completed (or failed with duplicate/error), conversation was resolved but engagement lock was never released. Other agents couldn't contact the customer until the lock expired. Fixed: all resolved paths now fire `conversation.resolved` event.
- `server/services/smsConversationRouter.ts` — **STOP handler lock leak**: Central STOP interceptor resolved conversations but didn't release engagement locks. Fixed. Also added centralized post-handler lock release check for the booking flow.
- `server/services/reviewService.ts` — **Bypassed TCPA protections**: Was creating its own Twilio client directly, bypassing the centralized `twilioService.sendSms()` which includes suppression list checks, sanitization, and business-specific from-number resolution. Also missing STOP opt-out footer on review request SMS (marketing message). Fixed: now uses centralized `sendSms()` with TCPA footer.

#### Google Business Profile Integration — Full Bi-Directional Sync
- **Goal**: Expand existing GBP integration (OAuth, booking links, phone management) into full bi-directional sync with business info pull/push, conflict detection, review management, local posts, SEO scoring, and website builder integration.

##### Schema + Migrations
- `shared/schema.ts` — Added `gbpLastSyncedAt` timestamp column to `businesses` table. Created `gbpReviews` table (id, businessId, gbpReviewId unique, reviewerName, reviewerPhotoUrl, rating 1-5, reviewText, reviewDate, replyText, replyDate, flagged, createdAt, updatedAt). Created `gbpPosts` table (id, businessId, content, callToAction, callToActionUrl, status draft/published/failed, gbpPostId, publishedAt, createdAt, updatedAt). Added insert schemas and types for both.
- `server/migrations/runMigrations.ts` — Added migrations: ALTER TABLE businesses ADD COLUMN gbp_last_synced_at, CREATE TABLE gbp_reviews with unique index on gbp_review_id, CREATE TABLE gbp_posts with index on business_id.

##### Storage Layer
- `server/storage.ts` — Added 8 new methods to IStorage + DatabaseStorage: `getGbpReviews(businessId, filters?)`, `getGbpReviewByGbpId(gbpReviewId)`, `upsertGbpReview(entry)`, `updateGbpReview(id, data)`, `countGbpReviews(businessId, filters?)`, `getGbpPosts(businessId, filters?)`, `createGbpPost(entry)`, `updateGbpPost(id, data)`. Reviews support filters: flagged, minRating, maxRating, hasReply, limit, offset.

##### Service Layer Expansion
- `server/services/googleBusinessProfileService.ts` — Extended `GBPStoredData` interface with `cachedBusinessInfo`, `conflicts`, `syncMetadata`. Added `GBPBusinessInfo` and `GBPFieldConflict` interfaces. 8 new methods: `getBusinessInfo()` (GBP v1 API readMask), `updateBusinessInfo()` (locations.patch with computed updateMask), `syncBusinessData()` (pull→compare→conflict detect→cache→update gbpLastSyncedAt), `syncReviews()` (batch fetch→upsert→auto-flag rating≤2), `createLocalPost()` (GBP v4 localPosts), `listLocalPosts()`, `calculateSeoScore()` (100-point, 12 criteria), `getConnectedBusinessIds()`. Exported `runGbpSync()` function for scheduler.

##### New Routes (12 endpoints)
- `server/routes/gbpRoutes.ts` — 12 new endpoints: POST `/sync/:businessId`, GET `/business-info/:businessId`, POST `/push/:businessId`, POST `/resolve-conflict/:businessId`, POST `/reviews/sync/:businessId`, GET `/reviews/:businessId`, POST `/reviews/:reviewId/reply`, POST `/reviews/:reviewId/suggest-reply` (AI via OpenAI), POST `/posts/generate/:businessId` (AI draft), POST `/posts/publish/:businessId`, GET `/posts/:businessId`, GET `/seo-score/:businessId`.

##### Post-Save Hooks
- `server/routes.ts` — After business profile update (PUT /api/business/:id) and hours update (PUT /api/business-hours/:id): fire-and-forget `syncBusinessData` to detect conflicts (does NOT auto-push to GBP).

##### Scheduler
- `server/services/schedulerService.ts` — Added `startGbpSyncScheduler()`: 24h interval, `withReentryGuard('gbp-sync')` + `withAdvisoryLock('gbp-sync')`, calls `runGbpSync()` (iterates all connected businesses with 2s pause). Registered in `startAllSchedulers()`.

##### Frontend — GBP Dashboard Page
- `client/src/pages/google-business-profile.tsx` — **NEW** (~700 lines). 5-tab layout: Overview (connection status, stats, sync now, conflicts banner), Business Info (field-by-field local vs GBP comparison, per-field push/resolve), Reviews (summary bar, filters, review cards with AI suggest reply, pagination), Posts (AI generate, draft edit/publish, published history), SEO Score (circular progress, categorized checklist, actionable suggestions). OAuth popup flow with postMessage listener.
- `client/src/App.tsx` — Registered route at `/google-business-profile` with lazy loading.
- `client/src/components/layout/Sidebar.tsx` — Added nav item: `{ path: "/google-business-profile", label: "Google", icon: MapPin, hideForRoles: ['staff'] }`.

##### GBP Debugging & Robustness (commits de6c794, 5ede2f7, 651ec6b, 20a3691)
- `server/services/googleBusinessProfileService.ts` — **Wildcard location fallback**: When `accounts.list` returns empty, falls back to `accounts/-/locations` via mybusinessbusinessinformation API to find locations regardless of account hierarchy. Extracts account names from location resource names, or creates synthetic `accounts/-` entry. **Raw HTTP requests**: Switched `listAccounts()` from googleapis discovery client to `oauth2Client.request()` with raw URLs — eliminates silent failures from discovery client. **Forced token refresh**: `getAuthenticatedClient()` now detects expired tokens and forces `oauth2Client.refreshAccessToken()` before returning, with `invalid_grant` handling (returns null so user is prompted to reconnect). **Empty cache fix**: Only caches non-empty results — prevents empty accounts/locations from being cached for 24 hours. **Cache invalidation on reconnect**: `handleCallback()` calls `invalidateCache(businessId)` after saving tokens. **Step-by-step diagnostic logging**: Every stage of OAuth callback and account fetch uses `[GBP]` prefix with numbered steps. `handleCallback` logs: token exchange, result (hasAccessToken, hasRefreshToken, expiry, scope), DB path (insert vs update), SUCCESS/FAIL. Fire-and-forget auto-select logs steps 1-4 (storedData check, listAccounts, listLocations, syncBusinessData). Error paths include first 3 stack trace lines.
- `server/routes/gbpRoutes.ts` — **Debug endpoint**: `GET /api/gbp/debug/:businessId` returns full diagnostic JSON: connection status, stored data summary, accounts list, locations list, scheduler pool membership. **Location selector route**: `POST /api/gbp/select-location/:businessId` allows selecting account+location without requiring booking to be enabled. Fire-and-forget sync after selection.
- `client/src/pages/google-business-profile.tsx` — **LocationSelector component**: Inline in OverviewTab when connected but no location selected. Fetches accounts, auto-selects if only one, fetches locations for selected account, auto-selects if only one. Submit calls `/api/gbp/select-location/:businessId`. Does NOT block other tabs.

##### Settings + Website Builder Integration
- `client/src/components/settings/GoogleBusinessProfile.tsx` — Added "Dashboard" link button when connected.
- `client/src/pages/website-builder.tsx` — After website generation: if GBP connected, shows "Push site URL to Google?" banner with confirm. Calls POST `/api/gbp/push/:businessId` with `{ fields: ['website'] }`.

#### Website Builder Overhaul — Remove Stitch, Replace with OpenAI Generation
- **Goal**: Rip out all Google Stitch dependencies and replace with direct OpenAI (gpt-5.4-mini) website generation. Scanner now generates sites immediately instead of producing a copyable prompt. Full customization panel added.

##### Stitch Removal
- `server/services/stitchService.ts` — **DELETED**: Entire file removed.
- `@google/stitch-sdk` — **UNINSTALLED**: npm dependency removed.
- `STITCH_API_KEY` — **REMOVED**: No longer needed.
- All Stitch prompt generation, Stitch API calls, MCP parsing, and fallback instructions removed from scanner, routes, and frontend.
- `shared/schema.ts` — `stitchPrompt` column removed from `websites` table.
- `server/migrations/runMigrations.ts` — Migration added to `DROP COLUMN IF EXISTS stitch_prompt`.

##### New: OpenAI Website Generation Service
- `server/services/websiteGenerationService.ts` — **NEW**: Generates complete one-page websites via OpenAI (gpt-5.4-mini). Pulls all business data from DB in parallel (business, hours, services, staff). Builds dynamic user message with every available field. System prompt with 15+ vertical design presets (barbershop, salon, HVAC, plumbing, landscaping, restaurant, dental, medical, automotive, electrical, cleaning, construction, fitness, veterinary). Supports customization overrides (accent_color, font_style, hero_headline, hero_image_url, show_staff, show_reviews, show_hours). Booking widget embedding (iframe) when booking_enabled. Returns self-contained HTML with embedded CSS. Validates output is actual HTML.

##### Updated: Business Scanner
- `server/services/businessScannerService.ts` — **REWRITTEN**: Removed `generateStitchPrompt()` function, `ScanResult.stitchPrompt` field, and vertical design presets (moved to generation service). Scanner now returns only `{ businessData }`. Model updated to gpt-5.4-mini primary with gpt-4o-mini fallback.

##### Updated: Website Builder Routes
- `server/routes/websiteBuilderRoutes.ts` — **REWRITTEN**:
  - `POST /api/website-builder/scan` — Now scans AND generates in one step. Saves scan data, calls `generateWebsite()`, saves HTML, returns `{ website_id, preview_url, html }`.
  - `POST /api/website-builder/generate` — New endpoint. Pulls all data from DB, accepts optional `{ customizations }`, generates via OpenAI, saves HTML + timestamp. Returns `{ html, generated_at, preview_url }`.
  - `PUT /api/website-builder/customizations` — **NEW**: Save customization preferences without regenerating.
  - `GET /api/website-builder/domain` — Now returns `generatedAt` and `customizations` fields.
  - **REMOVED**: `GET /api/website-builder/stitch-status` (no longer needed).
  - Added `customizationsSchema` Zod validation.

##### Updated: Website Builder UI
- `client/src/pages/website-builder.tsx` — **REWRITTEN**:
  - **Site Preview**: iframe showing live generated site at top. Empty state with "Generate Your Site" CTA. "Regenerate" button with confirmation dialog. "Last generated: [timestamp]" label. "View Live Site" link.
  - **Scanner**: Button renamed to "Scan & Generate Site". Calls scan endpoint which generates immediately.
  - **Customization Panel**: Accent color picker (color input + hex text), Font style toggle (Classic/Modern/Bold), Hero headline input, Hero image URL input, Section toggles (Show staff/Show reviews/Show hours) via Switch components. "Save & Regenerate" button.
  - **Incomplete Profile Nudges**: Inline warnings with links when services/hours/staff/booking not set.
  - **Removed**: Stitch prompt textarea, Copy button, stitch-status query, manual Stitch instructions, Google Stitch references.

##### Updated: Database Schema
- `shared/schema.ts` — `websites` table: removed `stitchPrompt`, added `customizations` (jsonb) and `generatedAt` (timestamp).
- `server/migrations/runMigrations.ts` — Added migration to drop `stitch_prompt`, add `customizations` and `generated_at` columns to existing `websites` tables.

#### Website Builder Fixes — Booking iframe, Hours Nudge, Visual Customization
- **Goal**: Fix booking page not loading in generated sites, fix false "Add Hours" nudge when hours already exist, replace raw HTML editor with user-friendly visual content fields.
- `server/services/websiteGenerationService.ts` — **Booking iframe URL fix**: System prompt updated to use `{booking_url}` placeholder instead of hardcoded `https://smallbizagent.ai/book/{slug}`. User message now passes full `Booking URL` using `APP_URL` env var dynamically, so booking iframe works in both dev and production.
- `server/index.ts` — **CSP fix**: Added `/sites` route middleware to remove `X-Frame-Options` and set `frame-ancestors 'self' https: http://localhost:*`. Generated websites served from `/sites/:subdomain` were blocked from being embedded in the dashboard preview iframe by Helmet's default CSP.
- `client/src/pages/website-builder.tsx` — **Hours nudge fix**: Changed business hours query from non-existent `/api/business-hours` to correct endpoint `/api/business/${businessId}/hours`. Added `enabled: !!businessId` guard. Updated all nudge checks to only show after data is loaded (check `!== undefined` instead of falsy, preventing flash on initial load).
- `server/services/websiteGenerationService.ts` — **5 new customization fields**: Added `hero_subheadline`, `cta_primary_text`, `cta_secondary_text`, `about_text`, `footer_message` to `WebsiteCustomizations` interface. Updated system prompt with NON-NEGOTIABLE override rules for each. Updated `buildUserMessage()` to include all new fields in the customization block sent to OpenAI.
- `server/routes/websiteBuilderRoutes.ts` — **Zod schema expanded**: Added 5 new optional string fields to `customizationsSchema` validation.
- `client/src/pages/website-builder.tsx` — **HTML editor removed**: Deleted collapsible "Edit HTML" card, `showHtmlEditor`/`htmlContent`/`htmlLoaded` state, `saveHtmlMutation`, `Code`/`Save`/`RotateCcw` icon imports. Business owners don't know HTML.
- `client/src/pages/website-builder.tsx` — **Visual content fields added**: Customization panel reorganized into labeled sections (Branding, Hero Section, Call-to-Action Buttons, Content, Sections). New inputs: Hero Subheadline, Primary CTA Button Text, Booking Button Text, About Your Business (textarea), Custom Footer Message. Each with helpful placeholder text and descriptions. `buildCustomizations()` helper centralizes building the customizations object for generate/save mutations.

#### Vapi AI Optimization — Restore Call Quality After Prompt Rewrite
- **Goal**: Fix degraded AI behavior after commit `271306a` stripped the structured 5-beat call flow and key rules from the system prompt. The AI still received rich data (knowledge base, customer insights, Mem0 memory, upcoming appointments) but no longer had instructions on how to use it properly.
- `server/services/vapiService.ts` — **System prompt restored** from ~10 compressed lines back to structured 5-beat call flow (GREET → UNDERSTAND → CHECK → BOOK → CLOSE) with KEY RULES sections (DATES, NAMES, STAFF, AFTER HOURS, WHILE TOOLS RUN, CONVERSATION STYLE, MULTILINGUAL). Kept leakage prevention: no sentence-length instructions that sound like commands when spoken aloud.
- `server/services/vapiService.ts` — **GREET beat** now explicitly instructs AI to "Use the summary and context from recognizeCaller to personalize — reference their upcoming appointment, preferences, or past visits naturally." This restores the AI's ability to leverage Mem0 memory, customer insights, and intelligence data.
- `server/services/vapiService.ts` — **endCallPhrases**: Removed bare "Goodbye", "Bye bye", "Take care", "Adiós" that caused premature hang-ups mid-sentence. Replaced with full farewell phrases only: "Take care, goodbye", "Sounds great, have a great day", "You're all set, take care", "Cuídese mucho", etc. Applied to BOTH create and update paths.
- `server/services/vapiService.ts` — **Missing tool definitions added**: `getEstimate` (price quotes), `checkWaitTime` (current wait/next slot), `getServiceDetails` (service info lookup) were listed in AVAILABLE TOOLS and implemented in webhook handler but never registered with Vapi. AI was trying to call them and getting errors. Now properly defined in `getAssistantFunctions()`.
- `server/services/vapiService.ts` — **numWordsToInterruptAssistant**: 2 → 4. Two words was too aggressive — filler words like "uh huh", "oh yeah", "okay sure" were interrupting the AI mid-sentence while reading availability slots or confirming booking details.
- `server/services/vapiService.ts` — **startSpeakingPlan timing tuned** (both create and update paths):
  - `waitSeconds`: 0.4 → 0.5 (more natural conversational pause)
  - `onPunctuationSeconds`: 0.1 → 0.3 (prevents AI jumping in on mid-sentence pauses like "I need... a haircut")
  - `onNoPunctuationSeconds`: 0.5 → 0.6 (balanced: responsive but lets callers finish thoughts)
  - `onNumberSeconds`: 0.4 → 0.5 (lets callers finish full phone numbers/dates)
- `server/services/vapiService.ts` — **Stale date warning**: System prompt date header changed from "TODAY:" to "TODAY (at assistant build time):" with explicit note that recognizeCaller's `currentStatus` has the real-time date and should always be preferred.
- `server/services/vapiService.ts` — **AVAILABLE TOOLS list** reordered to group related tools logically (booking tools → info tools → customer tools → utility tools).

#### Admin Power Tools — 6 Features
- **Goal**: Give the platform admin full control with proactive alerting, impersonation, audit trail, revenue forecasting, and quick-action workflows.

##### 1. Admin Audit Log
- `server/services/auditService.ts` — Extended `AuditAction` type with 10 new admin actions: `admin_provision`, `admin_deprovision`, `admin_disable_user`, `admin_enable_user`, `admin_reset_password`, `admin_change_role`, `admin_change_subscription`, `admin_extend_trial`, `admin_impersonate`, `admin_stop_impersonation`.
- `server/routes/adminRoutes.ts` — Added `logAudit()` + `getRequestContext()` calls to all 8 existing admin mutation endpoints (provision, deprovision, disable, enable, reset-password, change-role, change-subscription, extend-trial).
- `server/routes/adminRoutes.ts` — **NEW**: `GET /api/admin/audit-logs?page=&limit=&action=&startDate=&endDate=` — paginated, filterable audit log query with username enrichment.
- `client/src/pages/admin/index.tsx` — **NEW**: Audit Log tab (10th tab) with filterable table, action type dropdown, pagination, color-coded action badges.

##### 2. Slack/Email Alerts for Critical Events
- `server/services/adminAlertService.ts` — **NEW**: `sendAdminAlert(type, severity, title, details)` sends real-time alerts via email (to `ADMIN_NOTIFICATION_EMAIL`) and optionally Slack (via `SLACK_WEBHOOK_URL` incoming webhook). Never throws. Supports 4 alert types: `payment_failed`, `trial_expired`, `provisioning_failed`, `churn_risk_high`.
- `server/services/subscriptionService.ts` — Hooked `sendAdminAlert('payment_failed')` into `handleInvoicePaymentFailedWithDunning()`.
- `server/services/schedulerService.ts` — Hooked `sendAdminAlert('trial_expired')` into `runTrialExpirationCheck()` when a business transitions to grace_period.
- `server/services/businessProvisioningService.ts` — Hooked `sendAdminAlert('provisioning_failed')` into `provisionBusiness()` when result.success is false.
- `server/services/platformAgents/churnPredictionAgent.ts` — Hooked `sendAdminAlert('churn_risk_high')` when a business scores >= 70 churn risk.

##### 3. Quick Actions from Alerts
- `server/routes/adminRoutes.ts` — Alert data shape extended with `actions[]` array per alert: `payment_failed` → Contact Owner + View Details, `provisioning_failed` → Re-provision, `grace_period` → Extend Trial + Contact Owner, `notification_failures` → View Messages.
- `server/routes/adminRoutes.ts` — **NEW**: `POST /api/admin/businesses/:id/extend-trial` — extends trial by 14 days, sets status to `trialing`, re-enables receptionist. Audit logged.
- `client/src/pages/admin/index.tsx` — **NEW**: `AlertActionButton` component renders inline action buttons on each alert. "Re-provision" calls provision endpoint, "Contact Owner" opens mailto, "Extend Trial" calls extend-trial endpoint, "View Messages" switches tab.

##### 4. Daily Admin Digest Email
- `server/services/adminDigestService.ts` — **NEW**: Daily platform summary email sent at 8am in admin timezone. Gathers: new signups, expired trials, total calls, revenue collected, failed payments, high churn risk businesses, agent activity summary. HTML + plain text format with "Action Needed" section. Skips if zero activity.
- `server/services/schedulerService.ts` — **NEW**: `startAdminDigestScheduler()` runs hourly, sends at 8am in `ADMIN_TIMEZONE` (default: America/New_York). Uses `withReentryGuard()` + `withAdvisoryLock()`.

##### 5. Business Impersonation ("View as")
- `server/routes/adminRoutes.ts` — **NEW**: `POST /api/admin/impersonate/:businessId` — stores impersonation in session (`req.session.impersonating`). `POST /api/admin/stop-impersonation` — clears session. Both audit logged.
- `server/auth.ts` — **NEW**: Impersonation middleware after passport session. If `req.session.impersonating` and user is admin, overrides `req.user.businessId` for the request. All existing routes automatically scope to the impersonated business.
- `server/auth.ts` — `GET /api/user` response includes `impersonating: { businessId, businessName, originalBusinessId }` when active, and overrides `businessId` in the response.
- `client/src/App.tsx` — **NEW**: `ImpersonationBanner` component. Fixed amber banner at top: "Viewing as: [Business Name] — Exit". Calls stop-impersonation on exit, redirects to `/admin`.
- `client/src/pages/admin/index.tsx` — "View as Business" menu item added to business dropdown. Calls impersonate endpoint, navigates to `/dashboard`.

##### 6. Revenue Forecasting
- `server/services/adminService.ts` — Extended `RevenueData` type with `forecast: MrrForecast | null`. Added `computeMrrForecast()` using linear regression on mrrTrend data. Projects 3 months forward with optimistic (+20%) and pessimistic (-20%) scenarios. Returns null if insufficient data.
- `client/src/pages/admin/index.tsx` — **NEW**: MRR Forecast card in Revenue tab. Table showing month, pessimistic, projected, optimistic columns. Shows monthly growth rate % and methodology. Placed between MRR trend and Plan Distribution.

#### Social Media Performance Engine — Metrics, Winners, AI Generation, Video Briefs
- **Goal**: Add performance tracking, winner-based AI content generation, video ad brief generation, and ad targeting reference to the admin social media dashboard. Replaces ideas from a standalone SocialMediaEngine.jsx (rejected for security/architecture reasons) with proper integration into the existing system.

##### Schema + Migrations
- `shared/schema.ts` — Added 7 engagement columns to `socialMediaPosts` table: `likes`, `comments`, `shares`, `saves`, `reach` (all integer, default 0), `engagementScore` (real, default 0), `isWinner` (boolean, default false). Created `videoBriefs` table (id, vertical, platform, pillar, briefData jsonb, sourceWinnerIds jsonb, createdAt). Added insert schema and types.
- `server/migrations/runMigrations.ts` — Added 7 `addColumnIfNotExists` calls for engagement columns on `social_media_posts`. Added `CREATE TABLE IF NOT EXISTS video_briefs`.

##### Backend Routes (`server/routes/socialMediaRoutes.ts`)
- `GET /posts/winners` — List winner posts with optional platform/industry filters. Registered BEFORE `/:platform/auth-url` to avoid route conflict.
- `PUT /posts/:id/metrics` — Save engagement metrics (likes, comments, shares, saves, reach). Computes `engagementScore` server-side: `(saves×3 + shares×2 + comments×1.5 + likes) / max(reach, 1)`. Validates post is published.
- `POST /posts/:id/winner` — Toggle `isWinner` on a published post.
- `POST /generate-from-winners` — Body: `{ vertical, platform, count? }`. Fetches winners, builds OpenAI prompt with winner examples as few-shot training, generates `count` posts (default 5), inserts as drafts with `details.generatedVia: 'winner_training'`. Returns `{ draftsGenerated, sourceWinners }`.
- `POST /video-brief` — Body: `{ vertical, platform, pillar?, useWinners? }`. Generates structured video ad brief (hook, voiceover, screen sequence, b-roll, CTA, caption, hashtags, boost targeting, stock search terms) via OpenAI. Saves to `video_briefs` table. Returns the brief.
- `GET /video-briefs` — List briefs with optional vertical/platform filters.
- `GET /video-briefs/:id` — Get single brief.
- `DELETE /video-briefs/:id` — Delete a brief.
- **Fix**: Auth-url endpoint now returns 501 with descriptive error when OAuth credentials are missing (previously returned empty URL causing blank popup window).

##### Social Media Agent Enhancement (`server/services/platformAgents/socialMediaAgent.ts`)
- `generateWithOpenAI()` enhanced: queries up to 3 winner posts matching current platform (ordered by `engagementScore` desc). If winners exist, appends to system prompt as few-shot training examples. Backward compatible — prompt unchanged when no winners exist. Wrapped in try/catch so winner training is a bonus, not a requirement.

##### Frontend (`client/src/pages/admin/social-media.tsx`)
- **SocialPost interface** updated with 7 new engagement fields.
- **Published tab**: Engagement score badge per post. BarChart3 icon → "Enter Metrics" dialog (5 number inputs: Likes, Comments, Shares, Saves, Reach with live score preview). Star icon → toggle winner (gold fill when active).
- **"Generate from Winners" button** in PostManagementSection header. Opens dialog with vertical dropdown (16 industries), platform dropdown (4 platforms), count slider (1-10). Disabled with message when no winners exist. Shows winner count badge.
- **VideoBriefSection**: Card with brief grid. "Generate Brief" dialog: vertical, platform, content pillar (Pain Amplification/Feature in Context/Social Proof/Education/Behind the Build), "use winner posts" checkbox. Brief cards show vertical, platform, pillar, date, hook preview. View dialog: structured display of all fields with "Copy Full Brief" button. Delete action per brief.
- **AdTargetingReference**: Collapsible card (starts collapsed). Meta ad targeting cheat sheet: interest tags, behavior tags, demographics, job titles, budget guidance. "Copy Full Targeting Sheet" button.
- New imports: Star, BarChart3, Copy, ChevronDown, ChevronUp, Clapperboard, Target (lucide-react); Input, Label (shadcn/ui).

#### Automated Video Production Pipeline
- **Goal**: Transform Video Briefs from text documents into actual rendered MP4 videos. Automated pipeline: screen recording clips (from S3 library) + Pexels stock b-roll + OpenAI TTS voiceover → multi-track Shotstack render → S3 storage.

##### Schema + Migrations
- `shared/schema.ts` — Added 8 render pipeline columns to `videoBriefs` table: `renderStatus` (none/rendering/done/failed), `renderId`, `videoUrl`, `thumbnailUrl`, `voiceoverUrl`, `aspectRatio`, `renderError`, `renderedAt`. Created `videoClips` table (id, name, description, category, s3Key, s3Url, durationSeconds, width, height, fileSize, mimeType, tags jsonb, sortOrder). Added insert schemas and types.
- `server/migrations/runMigrations.ts` — 8 `addColumnIfNotExists` calls for video_briefs render columns. `CREATE TABLE IF NOT EXISTS video_clips`.

##### New Services (3 files)
- `server/services/pexelsService.ts` — **NEW**: Pexels stock video search API. `searchVideos(query, options)` keyword search with orientation/duration filters. `findBRollForTerms(searchTerms)` batch search returning best HD match per term. Rate limit: 200 req/hr (free). Returns direct download URLs.
- `server/services/ttsService.ts` — **NEW**: OpenAI TTS voiceover generation. `generateVoiceover(text, options)` generates MP3 via tts-1-hd, uploads to S3, returns public URL. 9 voice options (nova, alloy, echo, fable, onyx, shimmer, coral, sage, ash). Cost: ~$0.01 per 30-second voiceover. `VOICE_OPTIONS` array for UI display.
- `server/services/videoAssemblyService.ts` — **NEW**: Video assembly engine. `renderVideoFromBrief(briefId, options)` orchestrates the full pipeline: loads brief → parallel fetch (clip matching + Pexels b-roll + TTS voiceover) → builds multi-track Shotstack timeline (text overlays + screen clips + stock b-roll + background gradient + voiceover soundtrack) → submits render → polls for completion → uploads to S3. Clip matching uses keyword scoring against library clips by category, name, description, and tags. Supports 9:16 (vertical) and 16:9 (landscape) output.

##### New Routes (7 endpoints in `server/routes/socialMediaRoutes.ts`)
- `GET /clips` — List all clips in library (sorted by sortOrder, createdAt)
- `POST /clips` — Upload clip via multipart form (multer, 100MB max, video/* only) → S3 → DB
- `PUT /clips/:id` — Update clip metadata (name, description, category, tags, sortOrder, dimensions)
- `DELETE /clips/:id` — Delete clip from DB (S3 object retained)
- `POST /video-briefs/:id/render` — Start background video render. Body: `{ aspectRatio?, voice? }`. Returns 202 immediately. Pipeline runs in background.
- `GET /video-briefs/:id/render-status` — Poll render progress (status, videoUrl, error)
- `GET /tts-voices` — List available TTS voices with descriptions
- `GET /pipeline-status` — Check which services are configured (shotstack, pexels, tts, s3, ready)

##### Frontend (`client/src/pages/admin/social-media.tsx`)
- **VideoBriefSection** enhanced: Pipeline status indicator dots (Shotstack, Pexels, TTS, S3). Brief cards show render status badges (Rendering.../Video Ready/Render Failed). Video thumbnail preview on rendered briefs with play overlay. Film icon → "Render Video" dialog. Download button for rendered videos. Auto-poll every 10s while rendering.
- **Render Video Dialog**: Aspect ratio picker (9:16 vertical vs 16:9 landscape) with visual buttons. Voiceover voice selector from TTS voices API. Pipeline status grid. Start Rendering button.
- **View Brief Dialog** enhanced: Embedded `<video>` player when rendered. Audio player for generated voiceover. Render/Re-render button. Render error display. Download button.
- **ClipLibrarySection**: Collapsible card. Recording instructions with Mac shortcuts (⌘+Shift+5). Category badges (dashboard/calls/calendar/sms/invoice/crm/agents/general). Clip list with category emoji, name, duration, file size. Upload dialog: file picker (video/*), name, category dropdown, description, tags. Preview and delete actions per clip. Empty state with upload CTA.
- New imports: Upload, Play, Film, Mic, Download, Monitor (lucide-react). multer dependency added.

##### New Environment Variable
- `PEXELS_API_KEY` — Free Pexels API key for stock video search (optional — renders work without it, just no b-roll)

##### Cost Estimate
- Shotstack: ~$0.10/video (30s, subscription rate) → ~$10/mo for 100 videos
- Pexels: $0 (free)
- OpenAI TTS HD: ~$0.01/voiceover → ~$1/mo for 100 videos
- **Total: ~$40/mo** (Shotstack subscription $39 + TTS ~$1)

### Recent changes (committed):

#### Logout Button on Mobile Bottom Nav
- **Goal**: Make logout easily accessible on mobile without navigating through the sidebar.
- `client/src/components/BottomNav.tsx` — Replaced the "More" tab (which opened the sidebar) with a "Logout" tab using `LogOut` icon. Tapping it calls the logout mutation, shows a spinner while processing, and redirects to `/auth`. The sidebar remains accessible from the hamburger icon in the top header.

#### 4x Faster recognizeCaller (~150ms vs ~600ms)
- **Goal**: Reduce Vapi call startup latency by batching all recognizeCaller DB queries into a single parallel `Promise.all`.
- `server/services/vapiWebhookHandler.ts` — Consolidated sequential DB lookups (customer, business, appointments, services, insights, intelligence, Mem0 memory) into a single `Promise.all` batch. Reduced recognizeCaller execution time from ~600ms to ~150ms. All data still returned in the same response shape.

#### Admin Dashboard: Business Controls, User Management, Live Monitoring
- **Goal**: Give the platform owner full control over businesses and users from the admin dashboard, plus real-time alerting for platform health.
- `client/src/pages/admin/index.tsx` — **Businesses tab**: Search/filter by name and subscription status. Dropdown menu per business: View Details, Re-provision, Deprovision, Change Subscription Status. Business detail dialog showing services, staff, hours, customers, calls, revenue, receptionist config, and provisioning status.
- `client/src/pages/admin/index.tsx` — **Users tab**: Dropdown menu per user: Disable/Enable Account, Reset Password, Change Role (user/staff/admin). Confirm dialogs for destructive actions. Safety: cannot disable own account or remove own admin role. Password reset with minimum length validation.
- `client/src/pages/admin/index.tsx` — **Overview tab**: Platform Alerts banner showing failed payments, grace period businesses, provisioning failures, notification delivery failures. Alerts sorted by severity (high/medium/low) with color coding. Expandable details with suggested actions. Auto-refresh every 30 seconds. "Last updated: Xs ago" indicator. Improved SubscriptionBadge to handle grace_period, expired, canceled statuses.
- `server/routes/adminRoutes.ts` — 8 new endpoints: `POST .../provision`, `POST .../deprovision`, `GET .../detail`, `POST .../disable`, `POST .../enable`, `POST .../reset-password`, `PATCH .../role`, `GET /api/admin/alerts`.

#### Express Onboarding: 2-Minute Setup with Auto-Provisioning
- **Goal**: Reduce onboarding friction — new users can go from signup to fully provisioned AI receptionist in 2 minutes.
- `client/src/pages/onboarding/steps/welcome.tsx` — Welcome step now shows two paths: "Quick Setup (2 minutes)" (recommended) and "Detailed Setup (5-10 minutes)" (existing 9-step wizard).
- `client/src/pages/onboarding/steps/express-setup.tsx` — **NEW**: Single-page form: business name, industry dropdown (19 options), phone, email, address. Shows provisioning progress animation. Redirects to dashboard with setup checklist for optional refinement.
- `server/routes/expressSetupRoutes.ts` — **NEW**: `POST /api/onboarding/express-setup` — atomic endpoint that: creates business + links to user + sets 14-day trial, maps industry to template (12 templates, 5-10 services each), bulk-creates services from matched template, creates default Mon-Fri 9am-5pm business hours, fires Twilio + Vapi provisioning in background, marks onboarding complete. Industry-to-template mapping covers all 19 industry options.
- `client/src/pages/onboarding/index.tsx` — Updated to handle express setup path selection from welcome step.
- `server/routes.ts` — Mounted `expressSetupRoutes` at `/api/onboarding`.

#### Error Boundaries, AI ROI Card, Help Tooltips, and Context Help
- **Goal**: Three features to improve reliability (no more white screens), prove AI value (ROI funnel), and reduce support (inline help).
- `client/src/components/ui/error-boundary.tsx` — **NEW**: ErrorBoundary class component with Sentry integration. Wraps entire App, public booking page, payment page, and portal invoice page. Shows "Something went wrong" with retry instead of white screens.
- `client/src/App.tsx` — Wrapped root with ErrorBoundary.
- `client/src/pages/book/[slug].tsx`, `client/src/pages/payment.tsx`, `client/src/pages/portal/invoice.tsx` — Wrapped with ErrorBoundary with customer-friendly fallback messages.
- `server/services/analyticsService.ts` — **NEW**: `getAiRoiMetrics()` traces calls → bookings → revenue using call_intelligence data. Calculates ROI, conversion rate, avg revenue per booking.
- `server/routes/analyticsRoutes.ts` — **NEW**: `GET /api/analytics/ai-roi` endpoint.
- `client/src/components/dashboard/AiRoiCard.tsx` — **NEW**: Visual funnel card on dashboard showing AI-attributed calls, bookings, revenue, conversion rate, and ROI. Empty state for businesses with no calls yet.
- `client/src/pages/dashboard.tsx` — Added AiRoiCard component.
- `client/src/components/ui/help-tooltip.tsx` — **NEW**: HelpTooltip component (info icon + hover tooltip).
- `client/src/components/ui/context-help.tsx` — **NEW**: ContextHelp with 4 new route entries (receptionist, agents, marketing, analytics).
- `client/src/components/receptionist/ReceptionistConfig.tsx` — Added HelpTooltip to 9 config fields (greeting, voice, etc.).
- `client/src/pages/automations/index.tsx` — Added FeatureTip to AI Agents page.

#### Fix require('crypto') Crash in ESM Build
- **Goal**: Fix production crash — `Dynamic require of 'crypto' is not supported` in ESM build. Broke all email drip campaigns, quote share links, social media OAuth PKCE, and email unsubscribe link verification.
- `server/routes.ts`, `server/routes/quoteRoutes.ts`, `server/services/emailDripService.ts`, `server/services/socialMediaService.ts` — Replaced `require('crypto')` with ESM `import { ... } from "crypto"` in all 4 files.

#### Unsaved Changes Warning for Receptionist Config
- **Goal**: Prevent businesses from toggling settings (Call Recording, Voicemail, AI Insights) and leaving the page without saving — thinking they were active when they weren't.
- `client/src/components/receptionist/ReceptionistConfig.tsx` — Added amber alert banner: "You have unsaved changes. Click Save Configuration to apply them." with inline "Save Now" shortcut button. Appears when any field is dirty.
- `client/src/components/receptionist/ReceptionistConfig.tsx` — Added `beforeunload` handler triggering the browser's native "Leave page?" dialog when form has unsaved changes.

#### Tie Recording Disclosure to Call Recording Toggle
- **Goal**: Recording disclosure ("this call may be recorded") was always injected into the greeting regardless of the Call Recording setting. If recording was OFF, callers were falsely told they were being recorded.
- `server/services/vapiService.ts` — `buildFirstMessage()` now takes `callRecordingEnabled` parameter — only injects recording disclosure when Call Recording is ON.
- `client/src/components/receptionist/ReceptionistConfig.tsx` — AI Insights gate changed from checking greeting text for keywords to checking if Call Recording is enabled.
- `client/src/components/receptionist/WeeklySuggestions.tsx` — Same gate update with backward compatibility.
- `client/src/pages/receptionist/index.tsx` — Updated to pass recording setting.

#### Fix Custom Greeting Replacement
- **Goal**: `buildFirstMessage()` was stripping the business's custom closing question and replacing it with a generic one.
- `server/services/vapiService.ts` — Now preserves the business's custom greeting text (e.g., "How may I help you today?") and only inserts the recording disclosure before the closing question without replacing it.

#### Fix AI Time Range & Day Formatting for Voice
- **Goal**: AI was saying "9:30 AM 7 PM" (dropping hyphen) and "Monday Friday" (listing all days individually).
- `server/services/vapiService.ts`, `server/services/vapiWebhookHandler.ts` — Changed all time range formatting from `" - "` (hyphen) to `" to "` in 6 locations: `formatBusinessHoursFromDB()`, `isBusinessOpenNow()`, `getStaffSchedule()`, `getCurrentBusinessStatus()`.
- `server/services/vapiService.ts` — Added `groupConsecutiveDays()` helper. Now groups consecutive days with same schedule: "Monday through Friday: 9:30 AM to 7 PM" instead of listing all 7 days individually.
- `server/services/vapiWebhookHandler.ts` — Applied day grouping to `getBusinessHours()` and `getStaffSchedule()` responses. Staff time-off date ranges now use "through" instead of hyphens.

#### Utility Scripts
- `scripts/connect-phone-to-vapi.ts` — One-time script to connect an existing Twilio phone number to a Vapi assistant. Imports the phone to Vapi, updates `business_phone_numbers` and `businesses` tables.
- `scripts/run-migrations-local.cjs` — CommonJS migration script for running column additions and table creation locally. Adds missing columns to `users` and `businesses` tables, creates `staff_time_off` table with indexes.
- `scripts/reprovision-business.ts` — Updated: re-provisions admin's business with a specific Twilio phone number, creates Vapi assistant, re-enables receptionist.

#### New Caller Name Capture
- **Goal**: Fix new callers showing up as "Caller 9926" / "Caller 1808" in CRM instead of their actual names. The AI asks for the name but had no mechanism to save it.
- `server/services/vapiWebhookHandler.ts` — **recognizeCaller** now creates a placeholder customer record immediately for new callers (moved from end-of-call). Returns `customerId` so `updateCustomerInfo` can save the name mid-call.
- `server/services/vapiWebhookHandler.ts` — **NEW**: `extractCallerNameFromTranscript()` helper function. Regex-based name extraction from transcript as a fallback when the AI didn't call `updateCustomerInfo`. Matches patterns like "My name is John Smith", "This is Tony", "I'm Sarah Jones". Filters common non-name words. Runs at end-of-call if customer still has placeholder name.
- `server/services/vapiWebhookHandler.ts` — **handleEndOfCall** now checks if existing customer has placeholder name ("Caller") and attempts transcript extraction to update it. Still creates customer if none exists (edge case for very short calls).
- `server/services/vapiService.ts` — **System prompt** strengthened: AI told to ask "May I get your name?" within first 2 responses for new callers, then IMMEDIATELY call `updateCustomerInfo` with the name and customerId from recognizeCaller.
- `server/services/vapiService.ts` — **updateCustomerInfo tool description** updated to clarify it works for new callers (not just corrections).
- `server/services/smsReplyParser.test.ts` — Removed CANCEL from STOP keyword test (CANCEL is now an appointment action, not opt-out).
- `server/services/noShowAgentService.test.ts` — Added missing `createNotificationLog` mock that was causing test failure.

#### Vapi confirmAppointment Tool Fix
- **Goal**: Fix AI asking clarifying questions instead of confirming appointments when callers say "confirm"
- `server/services/vapiService.ts` — Added `confirmAppointment` tool definition to `getAssistantFunctions()` (existed in webhook handler dispatch but was never registered with Vapi).

#### SMS Appointment Self-Service (CANCEL + RESCHEDULE)
- **Goal**: Let customers cancel or reschedule appointments by replying to SMS
- `server/routes.ts` — Added CANCEL keyword handler (finds next appointment, marks cancelled, notifies orchestrator). Added RESCHEDULE handler (sends manage link or booking page URL). Removed CANCEL from STOP keywords.
- `server/services/smsReplyParser.ts` — Removed 'cancel' from STOP_WORDS.
- `server/services/notificationService.ts` — Updated all SMS templates to include CONFIRM/RESCHEDULE/CANCEL reply options.
- `server/services/reminderService.ts` — Updated reminder SMS template with reply keywords.

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
- `server/services/vapiService.ts` — **maxTokens: 350** added to LLM config in both create and update paths. Caps AI response length for voice — prevents rambling, faster TTS generation. (Initially 250, increased to 350 for more natural responses.)
- `server/services/vapiService.ts` — **Update path transcriber fix**: `model: 'nova-2'` was missing from the update path transcriber config (another create/update drift bug). Also added `temperature: 0.6` to update path model config for consistency.
- `server/services/vapiWebhookHandler.ts` — **Batch staff-service queries**: Added `getCachedStaffServiceMap()` helper that fetches all staff-service mappings for a business in parallel (one `Promise.all`) and caches the result. Replaces the N+1 sequential `getStaffServices(s.id)` pattern in `checkAvailability` and `bookAppointment`. Saves 50-150ms when checking staff-service compatibility for 3+ staff members.
- `server/services/vapiWebhookHandler.ts` — **Batch service lookups in recognizeCaller**: Service name lookup for upcoming appointments now uses `getCachedServices()` (fetched in parallel with appointments + business) instead of individual `storage.getService()` calls per appointment. Eliminates per-appointment DB queries.
- `server/routes.ts` — Cache invalidation for `staffServiceMap` added to `setStaffServices` endpoint.

#### Vapi Prompt Leakage & Hang-up Fixes
- **Goal**: Fix AI telling callers to "keep responses to 1-2 sentences" and fix repeated hang-up-after-greeting bugs
- `server/services/vapiService.ts` — Removed all sentence-length instructions that could leak (personality line, "SAVING MINUTES" section, farewell length instruction). Replaced with behavioral prompts that don't sound like instructions when spoken.
- `server/services/vapiService.ts` — **endCallPhrases create/update drift fix**: Earlier commit c22f866 only fixed the CREATE path. The UPDATE path (used by Refresh Assistant) still had bare "Thanks for calling" which matched the greeting and caused immediate hang-up. Fixed both paths to use full farewell phrases only.
- `server/services/vapiService.ts` — **maxTokens create/update drift fix**: CREATE had 350, UPDATE had 250. Fixed UPDATE to 350.

#### Real-time Open/Closed Status
- **Goal**: Fix AI saying "we're open until 7pm" when it's 8pm — the status was baked stale into the system prompt at assistant creation time
- `server/services/vapiWebhookHandler.ts` — Added `getCurrentBusinessStatus()` function that computes real-time open/closed per call by comparing current time in business timezone against today's hours.
- `server/services/vapiWebhookHandler.ts` — Added `currentStatus` field to ALL three `recognizeCaller` return paths (no phone, new caller, recognized). AI now uses this live data instead of stale prompt.
- `server/services/vapiService.ts` — System prompt updated: STATUS line replaced with note to use `currentStatus` from `recognizeCaller`. AFTER HOURS instruction updated to tell callers business is closed but can still book.

#### Duplicate Appointment Reminder Fix
- **Goal**: Fix appointment reminders being sent on every Railway deploy/restart
- `server/services/schedulerService.ts` — Removed immediate-run-on-start from `startReminderScheduler`. First run now happens ~1 hour after deploy.
- `server/services/reminderService.ts` — Added 20-hour deduplication check against `notification_log` table before sending. Logs successful sends for idempotency.

#### SMS TCPA Compliance Overhaul
- **Goal**: Proper TCPA compliance with welcome SMS, correct footer strategy, CONFIRM handler, and proper STOP behavior
- `server/routes.ts` — Added CONFIRM keyword handler: finds next upcoming appointment, marks as confirmed, sends confirmation reply.
- `server/services/notificationService.ts` — Added `sendSmsOptInWelcome()` function (one-time welcome SMS with full TCPA disclosure). Added `getSmsFooter()` that returns empty for transactional, footer for marketing.
- `server/services/vapiWebhookHandler.ts` — AI receptionist now sets `smsOptIn: true` on customer creation and triggers welcome SMS.
- `server/routes/bookingRoutes.ts` — Booking routes trigger welcome SMS on new customer opt-in.
- Agent services (noShow, followUp, rebooking, estimateFollowUp) — Added "Reply STOP to unsubscribe" footer to marketing SMS only.

#### STOP Handler Fix (Marketing vs Transactional)
- **Goal**: STOP should only opt out of marketing messages, NOT block appointment reminders/confirmations
- **Previous behavior**: STOP set `smsOptIn: false` + `marketingOptIn: false` + added to suppression list → blocked ALL messages including transactional
- **New behavior**: STOP only sets `marketingOptIn: false` → marketing agents stop, but reminders/confirmations still go through
- `server/routes.ts` — Main STOP handler: only sets `marketingOptIn: false`, removed suppression list insertion. Updated reply message to tell customer they'll still get reminders.
- `server/services/smsConversationRouter.ts` — Central conversation STOP interceptor updated.
- `server/services/noShowAgentService.ts` — STOP handler + opt-in check switched to `marketingOptIn`.
- `server/services/rebookingAgentService.ts` — STOP handler + eligibility filter + re-check switched to `marketingOptIn`.
- `server/services/conversationalBookingService.ts` — Both STOP handlers (quick decline + reply intent) switched to `marketingOptIn`.
- `server/services/followUpAgentService.ts` — Trigger check + thank-you + upsell re-checks switched to `marketingOptIn`.
- `server/services/estimateFollowUpAgentService.ts` — Opt-in check switched to `marketingOptIn`.
- `server/services/reviewService.ts` — Review request SMS check + auto-send channel selection switched to `marketingOptIn` (reviews are promotional).
- Test files updated: noShowAgentService.test.ts, rebookingAgentService.test.ts, followUpAgentService.test.ts — fixtures and assertions updated.

#### Vapi Call Quality Improvements
- **Goal**: Fix AI not hearing caller after barge-in (Deepgram multilingual STT dropping audio stream)
- `server/services/vapiService.ts` — **Transcriber language**: `multi` → `en` (English-only). Multilingual model is slower and less reliable for barge-in recovery. English-only is faster and more accurate for single-language calls. Applied to both create and update paths.
- `server/services/vapiService.ts` — **Background denoising**: Enabled `backgroundDenoisingEnabled: true` in both paths. Helps Deepgram filter noise and focus on voice.
- `server/services/vapiService.ts` — **Silence timeout**: 20s → 30s in both paths. More buffer if STT briefly drops — prevents premature hang-ups.
- `server/services/vapiService.ts` — **ElevenLabs latency optimization**: `optimizeStreamingLatency` 4 → 3 in both paths. Level 4 was clipping the first word of responses ("I help you today?" instead of "How can I help you today?").

### Prior changes (Security Audit & Bug Fixes):

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
| Video assembly pipeline | `server/services/videoAssemblyService.ts` |
| Pexels stock footage | `server/services/pexelsService.ts` |
| TTS voiceover service | `server/services/ttsService.ts` |
| Vapi AI receptionist | `server/services/vapiService.ts` |
| Subscription billing | `server/services/subscriptionService.ts` |
| Post-call intelligence | `server/services/callIntelligenceService.ts` |
| Customer insights/memory | `server/services/customerInsightsService.ts` |
| Agent orchestration | `server/services/orchestrationService.ts` |
| Morning brief email | `server/services/morningBriefService.ts` |
| Mem0 persistent memory | `server/services/mem0Service.ts` |
| LangGraph agent graph | `server/services/agentGraph.ts` |
| Express onboarding | `server/routes/expressSetupRoutes.ts` |
| Express setup UI | `client/src/pages/onboarding/steps/express-setup.tsx` |
| Error boundary | `client/src/components/ui/error-boundary.tsx` |
| Help tooltips | `client/src/components/ui/help-tooltip.tsx` |
| Context help | `client/src/components/ui/context-help.tsx` |
| AI ROI card | `client/src/components/dashboard/AiRoiCard.tsx` |
| Admin alert service | `server/services/adminAlertService.ts` |
| Admin digest service | `server/services/adminDigestService.ts` |
| Website generation service | `server/services/websiteGenerationService.ts` |
| Website builder routes | `server/routes/websiteBuilderRoutes.ts` |
| Website builder UI | `client/src/pages/website-builder.tsx` |
| GBP service | `server/services/googleBusinessProfileService.ts` |
| GBP routes | `server/routes/gbpRoutes.ts` |
| GBP dashboard UI | `client/src/pages/google-business-profile.tsx` |
| GBP settings card | `client/src/components/settings/GoogleBusinessProfile.tsx` |
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

*Last updated: March 23, 2026. 345 tests passing (227 unit + 118 E2E). Zero TypeScript errors. 66 tables. SMS Reliability Fixes (uncommitted): 5 bugs — reminder timezone, CONFIRM timezone, CANCEL keyword interception, AI reasoning leak sanitization, missing confirmation SMS (smsOptIn not set on phone-created customers). Social Media Performance Engine (uncommitted): Engagement metrics + scoring + winner marking. Generate-from-winners. Video briefs + automated video production pipeline. Ad targeting cheat sheet. Social media agent enhanced with winner training. Video Production Pipeline (uncommitted): Brief → clips + Pexels b-roll + OpenAI TTS voiceover → Shotstack multi-track render → S3. 3 new services (pexelsService, ttsService, videoAssemblyService). Clip library with upload/manage UI. 7 new API endpoints. `videoClips` table + 8 render columns on `videoBriefs`. ~$40/mo for 100 videos. Google Business Profile (uncommitted): Full bi-directional sync with 14 endpoints, 5-tab dashboard, review management, local posts, SEO scoring. Website Builder (uncommitted): OpenAI generation with customizations, domain management, feature gates. Vapi Model Upgrade (uncommitted): Upgraded Vapi AI receptionist from gpt-4.1-mini to gpt-5-mini in both create and update paths.*
