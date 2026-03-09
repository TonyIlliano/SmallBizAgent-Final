import { pgTable, text, serial, timestamp, integer, boolean, jsonb, real, date, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  role: text("role").default("user"), // admin, user, staff
  businessId: integer("business_id"),
  active: boolean("active").default(true),
  // Email verification
  emailVerified: boolean("email_verified").default(false),
  emailVerificationCode: text("email_verification_code"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  // Two-Factor Authentication
  twoFactorSecret: text("two_factor_secret"), // Encrypted TOTP secret
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorBackupCodes: text("two_factor_backup_codes"), // JSON array of hashed backup codes
  onboardingComplete: boolean("onboarding_complete").default(false),
  setupChecklistDismissed: boolean("setup_checklist_dismissed").default(false),
  dismissedTips: text("dismissed_tips"), // JSON array of dismissed tip IDs
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    emailIdx: unique("email_idx").on(table.email),
    usernameIdx: unique("username_idx").on(table.username),
  }
});

// Business Profile
export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  phone: text("phone"),
  ownerPhone: text("owner_phone"), // Owner's personal cell for notifications (payment failures, alerts)
  email: text("email").notNull(),
  website: text("website"),
  logoUrl: text("logo_url"),
  // White-label branding for public booking pages
  brandColor: text("brand_color"),   // Hex color e.g. "#2563eb"
  accentColor: text("accent_color"), // Hex color e.g. "#f59e0b"
  // Business type and timezone for virtual receptionist
  type: text("type").default("general"), // plumbing, electrical, medical, etc.
  timezone: text("timezone").default("America/New_York"), // IANA timezone
  // Online booking configuration
  bookingSlug: text("booking_slug"), // Unique URL slug for public booking page (e.g., "joes-plumbing")
  bookingEnabled: boolean("booking_enabled").default(false), // Toggle to enable/disable online booking
  bookingLeadTimeHours: integer("booking_lead_time_hours").default(24), // Minimum hours notice required
  bookingBufferMinutes: integer("booking_buffer_minutes").default(15), // Buffer time between appointments
  bookingSlotIntervalMinutes: integer("booking_slot_interval_minutes").default(30), // Slot interval (15, 30, 60 min etc.)
  // Business description (for booking page, SEO, etc.)
  description: text("description"),
  // Industry type for AI receptionist context
  industry: text("industry"),
  businessHours: text("business_hours"), // JSON string or simple text
  // Twilio phone number information
  twilioPhoneNumber: text("twilio_phone_number"),
  twilioPhoneNumberSid: text("twilio_phone_number_sid"),
  twilioPhoneNumberStatus: text("twilio_phone_number_status"),
  twilioDateProvisioned: timestamp("twilio_date_provisioned"),
  // Call forwarding tracking (whether owner set up *72 forwarding to the Twilio number)
  callForwardingEnabled: boolean("call_forwarding_enabled").default(false),
  // Vapi.ai AI receptionist
  vapiAssistantId: text("vapi_assistant_id"),
  vapiPhoneNumberId: text("vapi_phone_number_id"),
  receptionistEnabled: boolean("receptionist_enabled").default(true), // Toggle to enable/disable AI receptionist
  // Provisioning status tracking
  provisioningStatus: text("provisioning_status").default("pending"), // pending, in_progress, completed, failed
  provisioningResult: text("provisioning_result"), // JSON string with detailed provisioning results
  provisioningCompletedAt: timestamp("provisioning_completed_at"),
  // QuickBooks integration information
  quickbooksRealmId: text("quickbooks_realm_id"),
  quickbooksAccessToken: text("quickbooks_access_token"),
  quickbooksRefreshToken: text("quickbooks_refresh_token"),
  quickbooksTokenExpiry: timestamp("quickbooks_token_expiry"),
  // Clover POS integration
  cloverMerchantId: text("clover_merchant_id"),
  cloverAccessToken: text("clover_access_token"),
  cloverRefreshToken: text("clover_refresh_token"),
  cloverTokenExpiry: timestamp("clover_token_expiry"),
  cloverEnvironment: text("clover_environment"), // 'sandbox' or 'production'
  // Square POS integration
  squareMerchantId: text("square_merchant_id"),
  squareAccessToken: text("square_access_token"),
  squareRefreshToken: text("square_refresh_token"),
  squareTokenExpiry: timestamp("square_token_expiry"),
  squareLocationId: text("square_location_id"),
  squareEnvironment: text("square_environment"), // 'sandbox' or 'production'
  // Heartland/Genius POS integration
  heartlandApiKey: text("heartland_api_key"), // Restaurant's location-specific API key
  heartlandLocationName: text("heartland_location_name"), // Human-readable location name
  heartlandEnvironment: text("heartland_environment"), // 'production'
  // Restaurant order type settings
  restaurantPickupEnabled: boolean("restaurant_pickup_enabled").default(true),
  restaurantDeliveryEnabled: boolean("restaurant_delivery_enabled").default(false),
  // Restaurant reservation configuration
  reservationEnabled: boolean("reservation_enabled").default(false),
  reservationMaxPartySize: integer("reservation_max_party_size").default(10),
  reservationSlotDurationMinutes: integer("reservation_slot_duration_minutes").default(90),
  reservationMaxCapacityPerSlot: integer("reservation_max_capacity_per_slot").default(40),
  reservationLeadTimeHours: integer("reservation_lead_time_hours").default(2),
  reservationMaxDaysAhead: integer("reservation_max_days_ahead").default(30),
  // Birthday campaign settings
  birthdayCampaignEnabled: boolean("birthday_campaign_enabled").default(false),
  birthdayDiscountPercent: integer("birthday_discount_percent").default(15),
  birthdayCouponValidDays: integer("birthday_coupon_valid_days").default(7),
  birthdayCampaignChannel: text("birthday_campaign_channel").default("both"), // sms, email, both
  // Inventory alert settings (restaurant POS integration)
  inventoryAlertsEnabled: boolean("inventory_alerts_enabled").default(false),
  inventoryAlertChannel: text("inventory_alert_channel").default("both"), // sms, email, both
  inventoryDefaultThreshold: integer("inventory_default_threshold").default(10), // Default low-stock threshold
  birthdayCampaignMessage: text("birthday_campaign_message"), // Custom template, null = use default
  // Multi-location tracking
  numberOfLocations: integer("number_of_locations").default(1),
  businessGroupId: integer("business_group_id"), // FK -> business_groups.id (null for standalone single-location)
  locationLabel: text("location_label"), // "Downtown", "North Side", etc.
  isActive: boolean("is_active").default(true), // Soft-disable a location
  // Data retention settings
  dataRetentionDays: integer("data_retention_days").default(365), // How long to keep transcripts (days)
  callRecordingRetentionDays: integer("call_recording_retention_days").default(90), // How long to keep call recordings
  // Subscription information
  subscriptionStatus: text("subscription_status").default("inactive"),
  subscriptionPlanId: text("subscription_plan_id"),
  stripePlanId: integer("stripe_plan_id"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // Stripe Connect (for receiving customer payments)
  stripeConnectAccountId: text("stripe_connect_account_id"),
  stripeConnectStatus: text("stripe_connect_status").default("not_connected"),
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionPeriodEnd: timestamp("subscription_period_end"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Business Hours
export const businessHours = pgTable("business_hours", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  day: text("day").notNull(), // monday, tuesday, etc.
  open: text("open"), // HH:MM format
  close: text("close"), // HH:MM format
  isClosed: boolean("is_closed").default(false),
});

// Services offered by business
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price"),
  duration: integer("duration"), // in minutes
  active: boolean("active").default(true),
});

// Customers
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  birthday: text("birthday"), // MM-DD format for annual birthday campaigns
  // SMS consent fields (TCPA compliance)
  smsOptIn: boolean("sms_opt_in").default(false),
  smsOptInDate: timestamp("sms_opt_in_date"),
  smsOptInMethod: text("sms_opt_in_method"), // 'booking_form', 'manual', 'phone', 'import'
  marketingOptIn: boolean("marketing_opt_in").default(false),
  marketingOptInDate: timestamp("marketing_opt_in_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Staff/Technicians
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  userId: integer("user_id"), // Links to users table when staff member has an account
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(), // Required to distinguish staff (e.g., two "Mikes")
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  specialty: text("specialty"), // e.g., "Senior Barber", "Colorist", "Master Stylist"
  bio: text("bio"), // Short description for customers
  photoUrl: text("photo_url"), // Staff photo URL for booking page
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Staff Invites (owner invites staff to create accounts)
export const staffInvites = pgTable("staff_invites", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  staffId: integer("staff_id").notNull(), // Links to the staff record
  email: text("email").notNull(), // Email to send invite to
  inviteCode: text("invite_code").notNull(), // Unique code for accepting
  status: text("status").default("pending"), // pending, accepted, expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Staff Working Hours (individual schedules for each staff member)
export const staffHours = pgTable("staff_hours", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  day: text("day").notNull(), // monday, tuesday, etc.
  startTime: text("start_time"), // HH:MM format (e.g., "09:00")
  endTime: text("end_time"), // HH:MM format (e.g., "17:00")
  isOff: boolean("is_off").default(false), // true = day off
});

// Staff-Service Assignments (which services each staff member can perform)
export const staffServices = pgTable("staff_services", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  serviceId: integer("service_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  staffServiceUnique: unique("staff_service_unique").on(table.staffId, table.serviceId),
}));

// Appointments
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id").notNull(),
  staffId: integer("staff_id"),
  serviceId: integer("service_id"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").default("scheduled"), // scheduled, confirmed, completed, cancelled
  notes: text("notes"),
  // Self-service manage token (for customer cancel/reschedule links)
  manageToken: text("manage_token"),
  // Calendar integration fields
  googleCalendarEventId: text("google_calendar_event_id"),
  microsoftCalendarEventId: text("microsoft_calendar_event_id"),
  appleCalendarEventId: text("apple_calendar_event_id"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Jobs
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id").notNull(),
  appointmentId: integer("appointment_id"),
  staffId: integer("staff_id"),
  title: text("title").notNull(),
  description: text("description"),
  scheduledDate: date("scheduled_date"),
  status: text("status").default("pending"), // pending, in_progress, waiting_parts, completed, cancelled
  estimatedCompletion: timestamp("estimated_completion"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Job Line Items (labor, parts, materials for a job)
export const jobLineItems = pgTable("job_line_items", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  type: text("type").notNull(), // labor, parts, materials, service
  description: text("description").notNull(),
  quantity: real("quantity").default(1),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(), // quantity * unitPrice
  taxable: boolean("taxable").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Invoices
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id").notNull(),
  jobId: integer("job_id"),
  invoiceNumber: text("invoice_number").notNull(),
  amount: real("amount").notNull(),
  tax: real("tax"),
  total: real("total").notNull(),
  dueDate: date("due_date"),
  status: text("status").default("pending"), // pending, paid, overdue
  notes: text("notes"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  // Public access token for customer portal
  accessToken: text("access_token"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice items
export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
});

// Virtual Receptionist Configuration
export const receptionistConfig = pgTable("receptionist_config", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  greeting: text("greeting"),
  afterHoursMessage: text("after_hours_message"),
  emergencyKeywords: jsonb("emergency_keywords"),
  voicemailEnabled: boolean("voicemail_enabled").default(true),
  callRecordingEnabled: boolean("call_recording_enabled").default(false),
  transcriptionEnabled: boolean("transcription_enabled").default(true),
  maxCallLengthMinutes: integer("max_call_length_minutes").default(15),
  transferPhoneNumbers: jsonb("transfer_phone_numbers"),
  voiceId: text("voice_id").default("paula"),           // ElevenLabs voice ID
  assistantName: text("assistant_name").default("Alex"), // Name the AI introduces itself as
  customInstructions: text("custom_instructions"),       // Free-form instructions injected into the AI prompt
  aiInsightsEnabled: boolean("ai_insights_enabled").default(false), // Auto-refine pipeline toggle
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Call Logs
export const callLogs = pgTable("call_logs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  callerId: text("caller_id"),
  callerName: text("caller_name"),
  transcript: text("transcript"),
  intentDetected: text("intent_detected"),
  isEmergency: boolean("is_emergency").default(false),
  callDuration: integer("call_duration"), // in seconds
  recordingUrl: text("recording_url"),
  status: text("status"), // answered, missed, voicemail
  phoneNumberId: integer("phone_number_id"), // FK -> business_phone_numbers.id (which line received the call)
  phoneNumberUsed: text("phone_number_used"), // Denormalized: the actual phone number string
  callTime: timestamp("call_time").defaultNow(),
});

// Calendar Integrations
export const calendarIntegrations = pgTable("calendar_integrations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  provider: text("provider").notNull(), // google, microsoft, apple
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  data: text("data"), // Additional provider-specific data as JSON
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    businessProviderUnique: unique("business_provider_unique").on(table.businessId, table.provider),
  }
});

// Quotes
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id").notNull(),
  jobId: integer("job_id"),
  quoteNumber: text("quote_number").notNull(),
  amount: real("amount").notNull(),
  tax: real("tax"),
  total: real("total").notNull(),
  validUntil: text("valid_until"), // Store date as string in YYYY-MM-DD format
  status: text("status").default("pending"), // pending, accepted, declined, expired, converted
  notes: text("notes"),
  convertedToInvoiceId: integer("converted_to_invoice_id"), // Reference to the invoice if this quote was converted
  accessToken: text("access_token"), // Token for customer portal access
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quote items
export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
});

// Review Settings (business review link configuration)
export const reviewSettings = pgTable("review_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  googleReviewUrl: text("google_review_url"),
  yelpReviewUrl: text("yelp_review_url"),
  facebookReviewUrl: text("facebook_review_url"),
  customReviewUrl: text("custom_review_url"),
  reviewRequestEnabled: boolean("review_request_enabled").default(true),
  autoSendAfterJobCompletion: boolean("auto_send_after_job_completion").default(true),
  delayHoursAfterCompletion: integer("delay_hours_after_completion").default(2), // Wait before sending
  reviewCooldownDays: integer("review_cooldown_days").default(90), // Min days between review requests per customer (prevents spam for repeat customers like restaurants)
  smsTemplate: text("sms_template").default("Hi {customerName}! Thank you for choosing {businessName}. We'd love to hear about your experience. Please leave us a review: {reviewLink}"),
  emailSubject: text("email_subject").default("How was your experience with {businessName}?"),
  emailTemplate: text("email_template"),
  preferredPlatform: text("preferred_platform").default("google"), // google, yelp, facebook, custom
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Review Requests (tracking sent review requests)
export const reviewRequests = pgTable("review_requests", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id").notNull(),
  jobId: integer("job_id"),
  sentVia: text("sent_via").notNull(), // sms, email
  sentAt: timestamp("sent_at").defaultNow(),
  platform: text("platform"), // google, yelp, facebook, custom
  reviewLink: text("review_link"),
  status: text("status").default("sent"), // sent, clicked, reviewed
  clickedAt: timestamp("clicked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Recurring Schedules (for recurring jobs and invoices)
export const recurringSchedules = pgTable("recurring_schedules", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id").notNull(),
  serviceId: integer("service_id"),
  staffId: integer("staff_id"),
  // Schedule configuration
  name: text("name").notNull(), // e.g., "Monthly Pool Cleaning for Smith"
  frequency: text("frequency").notNull(), // daily, weekly, biweekly, monthly, quarterly, yearly
  interval: integer("interval").default(1), // Every X days/weeks/months
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly schedules (0 = Sunday)
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly schedules
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // null = no end date
  nextRunDate: date("next_run_date"),
  // Job template
  jobTitle: text("job_title").notNull(),
  jobDescription: text("job_description"),
  estimatedDuration: integer("estimated_duration"), // in minutes
  // Invoice configuration
  autoCreateInvoice: boolean("auto_create_invoice").default(true),
  invoiceAmount: real("invoice_amount"),
  invoiceTax: real("invoice_tax"),
  invoiceNotes: text("invoice_notes"),
  // Status
  status: text("status").default("active"), // active, paused, completed, cancelled
  lastRunDate: date("last_run_date"),
  totalJobsCreated: integer("total_jobs_created").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Recurring Schedule Line Items (template for invoice line items)
export const recurringScheduleItems = pgTable("recurring_schedule_items", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
});

// Recurring Job History (tracks generated jobs)
export const recurringJobHistory = pgTable("recurring_job_history", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").notNull(),
  jobId: integer("job_id").notNull(),
  invoiceId: integer("invoice_id"),
  scheduledFor: date("scheduled_for").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notification Settings (per-business preferences for email/SMS notifications)
export const notificationSettings = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  // Appointment notifications
  appointmentConfirmationEmail: boolean("appointment_confirmation_email").default(true),
  appointmentConfirmationSms: boolean("appointment_confirmation_sms").default(true),
  appointmentReminderEmail: boolean("appointment_reminder_email").default(true),
  appointmentReminderSms: boolean("appointment_reminder_sms").default(true),
  appointmentReminderHours: integer("appointment_reminder_hours").default(24), // hours before appointment
  // Invoice notifications
  invoiceCreatedEmail: boolean("invoice_created_email").default(true),
  invoiceCreatedSms: boolean("invoice_created_sms").default(false),
  invoiceReminderEmail: boolean("invoice_reminder_email").default(true),
  invoiceReminderSms: boolean("invoice_reminder_sms").default(true),
  invoicePaymentConfirmationEmail: boolean("invoice_payment_confirmation_email").default(true),
  // Job notifications
  jobCompletedEmail: boolean("job_completed_email").default(true),
  jobCompletedSms: boolean("job_completed_sms").default(true),
  // Weather alerts (field service businesses)
  weatherAlertsEnabled: boolean("weather_alerts_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notification Log (tracks all sent notifications)
export const notificationLog = pgTable("notification_log", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id"),
  type: text("type").notNull(), // appointment_confirmation, appointment_reminder, invoice_created, invoice_reminder, payment_confirmation, job_completed
  channel: text("channel").notNull(), // email, sms
  recipient: text("recipient").notNull(), // phone number or email
  subject: text("subject"),
  message: text("message"),
  status: text("status").default("sent"), // sent, failed, delivered
  referenceType: text("reference_type"), // appointment, invoice, job
  referenceId: integer("reference_id"),
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow(),
});

// Clover Menu Cache (synced from Clover POS — one row per business)
export const cloverMenuCache = pgTable("clover_menu_cache", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  menuData: jsonb("menu_data"), // Full menu JSON: categories, items, modifiers, prices
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Clover Order Log (records of orders placed via AI → Clover API)
export const cloverOrderLog = pgTable("clover_order_log", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  cloverOrderId: text("clover_order_id"), // Order ID returned by Clover
  callerPhone: text("caller_phone"),
  callerName: text("caller_name"),
  items: jsonb("items"), // Snapshot of what was ordered
  totalAmount: integer("total_amount"), // In cents (Clover convention)
  status: text("status").default("created"), // created, failed
  vapiCallId: text("vapi_call_id"), // Link to the VAPI call that triggered this
  orderType: text("order_type"), // pickup, delivery, dine_in
  errorMessage: text("error_message"), // If Clover API failed
  createdAt: timestamp("created_at").defaultNow(),
});

// Square Menu Cache (synced from Square POS — one row per business)
export const squareMenuCache = pgTable("square_menu_cache", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  menuData: jsonb("menu_data"), // Full menu JSON: categories, items, modifiers, prices
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Square Order Log (records of orders placed via AI → Square API)
export const squareOrderLog = pgTable("square_order_log", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  squareOrderId: text("square_order_id"), // Order ID returned by Square
  callerPhone: text("caller_phone"),
  callerName: text("caller_name"),
  items: jsonb("items"), // Snapshot of what was ordered
  totalAmount: integer("total_amount"), // In cents
  status: text("status").default("created"), // created, failed
  vapiCallId: text("vapi_call_id"), // Link to the VAPI call that triggered this
  orderType: text("order_type"), // pickup, delivery, dine_in
  errorMessage: text("error_message"), // If Square API failed
  createdAt: timestamp("created_at").defaultNow(),
});

// Heartland Menu Cache (synced from Heartland/Genius POS — one row per business)
export const heartlandMenuCache = pgTable("heartland_menu_cache", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  menuData: jsonb("menu_data"), // Full menu JSON: categories, items, modifiers, prices
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Heartland Order Log (records of orders placed via AI → Heartland API)
export const heartlandOrderLog = pgTable("heartland_order_log", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  heartlandOrderId: text("heartland_order_id"), // Order ID returned by Heartland
  callerPhone: text("caller_phone"),
  callerName: text("caller_name"),
  items: jsonb("items"), // Snapshot of what was ordered
  totalAmount: integer("total_amount"), // In cents
  status: text("status").default("created"), // created, failed
  vapiCallId: text("vapi_call_id"), // Link to the VAPI call that triggered this
  orderType: text("order_type"), // pickup, delivery, dine_in
  errorMessage: text("error_message"), // If Heartland API failed
  createdAt: timestamp("created_at").defaultNow(),
});

// Restaurant Reservations (capacity-based reservation system for restaurants)
export const restaurantReservations = pgTable("restaurant_reservations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id").notNull(),
  partySize: integer("party_size").notNull(),
  reservationDate: text("reservation_date").notNull(), // YYYY-MM-DD in business timezone
  reservationTime: text("reservation_time").notNull(), // HH:MM in business timezone
  startDate: timestamp("start_date").notNull(),        // UTC timestamp for slot start
  endDate: timestamp("end_date").notNull(),            // UTC timestamp for slot end
  status: text("status").default("confirmed"),          // confirmed, seated, completed, cancelled, no_show
  specialRequests: text("special_requests"),
  manageToken: text("manage_token"),                   // For customer self-service cancel/modify
  source: text("source").default("online"),            // online, phone, walk_in, manual
  vapiCallId: text("vapi_call_id"),                    // If booked via AI phone
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Inventory Items (POS stock tracking for restaurants — Clover/Square)
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  posItemId: text("pos_item_id").notNull(),       // Clover/Square item ID
  posSource: text("pos_source").notNull(),          // 'clover' or 'square'
  name: text("name").notNull(),
  sku: text("sku"),
  category: text("category"),
  quantity: real("quantity").default(0),            // Current stock level (supports decimals)
  lowStockThreshold: integer("low_stock_threshold").default(10), // Alert when below this
  unitCost: integer("unit_cost"),                   // Cost in cents
  price: integer("price"),                          // Sell price in cents
  trackStock: boolean("track_stock").default(true), // Whether to track this item
  lastAlertSentAt: timestamp("last_alert_sent_at"), // Prevent alert spam
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Password Reset Tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Knowledge Base - FAQ/knowledge entries for the virtual receptionist
export const businessKnowledge = pgTable("business_knowledge", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"), // policies, service_area, faq, pricing, about, general
  source: text("source").notNull(), // 'website', 'owner', 'unanswered_question'
  isApproved: boolean("is_approved").default(false),
  priority: integer("priority").default(0), // Higher = more important for prompt budget
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Unanswered Questions - detected from call transcripts for owner to answer
export const unansweredQuestions = pgTable("unanswered_questions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  callLogId: integer("call_log_id"),
  question: text("question").notNull(),
  context: text("context"), // Surrounding transcript context
  callerPhone: text("caller_phone"),
  status: text("status").default("pending"), // pending, answered, dismissed
  ownerAnswer: text("owner_answer"),
  answeredAt: timestamp("answered_at"),
  knowledgeEntryId: integer("knowledge_entry_id"), // Links to business_knowledge when promoted
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Suggestions - weekly auto-refine pipeline suggestions for receptionist improvements
export const aiSuggestions = pgTable("ai_suggestions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  weekStart: timestamp("week_start").notNull(),
  type: text("type").notNull(), // NEW_FAQ, UPDATE_GREETING, UPDATE_INSTRUCTIONS, UPDATE_AFTER_HOURS, ADD_EMERGENCY_KEYWORD, GENERAL_INSIGHT
  title: text("title").notNull(),
  description: text("description").notNull(),
  currentValue: text("current_value"),
  suggestedValue: text("suggested_value"),
  occurrenceCount: integer("occurrence_count").default(1),
  riskLevel: text("risk_level").default("low"), // low, high
  status: text("status").default("pending"), // pending, accepted, dismissed, edited
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Agent Settings - per-business, per-agent configuration for SMS automation agents
export const agentSettings = pgTable("agent_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  agentType: text("agent_type").notNull(), // follow_up, no_show, estimate_follow_up, rebooking, review_response
  enabled: boolean("enabled").default(false),
  config: jsonb("config"), // Agent-specific JSON config (templates, delays, thresholds)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  businessAgentUnique: unique("agent_settings_business_agent_unique").on(table.businessId, table.agentType),
}));

// SMS Conversations - multi-turn SMS thread tracking for conversational agents
export const smsConversations = pgTable("sms_conversations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  customerId: integer("customer_id"),
  customerPhone: text("customer_phone").notNull(),
  agentType: text("agent_type").notNull(), // Which agent owns this conversation
  referenceType: text("reference_type"), // appointment, quote, job, rebooking
  referenceId: integer("reference_id"), // The appointment/quote/job ID
  state: text("state").notNull().default("awaiting_reply"), // awaiting_reply, replied, resolved, expired, escalated
  context: jsonb("context"), // Agent-specific state data
  lastMessageSentAt: timestamp("last_message_sent_at"),
  lastReplyReceivedAt: timestamp("last_reply_received_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent Activity Log - audit trail of all agent actions
export const agentActivityLog = pgTable("agent_activity_log", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  agentType: text("agent_type").notNull(),
  action: text("action").notNull(), // sms_sent, reply_received, status_changed, escalated, review_drafted, review_posted
  customerId: integer("customer_id"),
  referenceType: text("reference_type"), // appointment, job, quote, customer, review
  referenceId: integer("reference_id"),
  details: jsonb("details"), // { message, fromPhone, response, etc. }
  createdAt: timestamp("created_at").defaultNow(),
});

// Quote Follow-ups - track SMS follow-up attempts on quotes
export const quoteFollowUps = pgTable("quote_follow_ups", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  businessId: integer("business_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(), // 1, 2, 3
  channel: text("channel").notNull(), // sms, email
  sentAt: timestamp("sent_at").defaultNow(),
  messageBody: text("message_body"),
});

// Review Responses - AI-drafted review responses (for Review Response Agent)
export const reviewResponses = pgTable("review_responses", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  reviewSource: text("review_source").notNull(), // google
  reviewId: text("review_id").notNull(), // External review ID
  reviewerName: text("reviewer_name"),
  reviewRating: integer("review_rating"),
  reviewText: text("review_text"),
  aiDraftResponse: text("ai_draft_response"),
  finalResponse: text("final_response"),
  status: text("status").default("pending"), // pending, approved, auto_posted, posted, dismissed
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Social Media Posts - platform-level AI-generated social media content
export const socialMediaPosts = pgTable("social_media_posts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(), // twitter, facebook, instagram, linkedin
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type").default("text"), // text, video, image
  thumbnailUrl: text("thumbnail_url"),
  status: text("status").default("draft"), // draft, approved, published, failed, rejected
  scheduledFor: timestamp("scheduled_for"),
  publishedAt: timestamp("published_at"),
  externalPostId: text("external_post_id"),
  agentType: text("agent_type").default("platform:social_media"),
  industry: text("industry"),
  details: jsonb("details"),
  rejectionReason: text("rejection_reason"),
  editedContent: text("edited_content"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Website Scrape Cache - cached results from business website scraping
export const websiteScrapeCache = pgTable("website_scrape_cache", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  url: text("url").notNull(),
  pagesScraped: integer("pages_scraped").default(0),
  rawContent: text("raw_content"),
  structuredKnowledge: jsonb("structured_knowledge"), // AI-summarized JSON
  status: text("status").default("pending"), // pending, scraping, completed, failed
  errorMessage: text("error_message"),
  lastScrapedAt: timestamp("last_scraped_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Subscription Plans
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  planTier: text("plan_tier"), // starter, professional, business, enterprise
  price: real("price").notNull(),
  interval: text("interval").notNull(), // monthly, yearly
  features: jsonb("features"), // Array of features included in this plan
  maxCallMinutes: integer("max_call_minutes"), // included AI call minutes per month
  overageRatePerMinute: real("overage_rate_per_minute"), // $/min after limit (in cents)
  maxStaff: integer("max_staff"), // max staff members
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  active: boolean("active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Overage Charges (tracks automatic overage billing per billing period)
export const overageCharges = pgTable("overage_charges", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  minutesUsed: integer("minutes_used").notNull(),
  minutesIncluded: integer("minutes_included").notNull(),
  overageMinutes: integer("overage_minutes").notNull(),
  overageRate: real("overage_rate").notNull(),
  overageAmount: real("overage_amount").notNull(),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripeInvoiceUrl: text("stripe_invoice_url"),
  status: text("status").default("pending"), // pending, invoiced, paid, failed, no_overage
  failureReason: text("failure_reason"),
  planName: text("plan_name"),
  planTier: text("plan_tier"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniquePeriod: unique("overage_charges_unique_period").on(table.businessId, table.periodStart),
}));

// Webhooks (for Zapier/external integrations)
export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  url: text("url").notNull(),
  events: jsonb("events").notNull(), // ["appointment.created", "invoice.paid", ...]
  secret: text("secret").notNull(), // HMAC signing secret
  active: boolean("active").default(true),
  description: text("description"),
  source: text("source").default("manual"), // 'manual' | 'zapier'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Webhook Delivery Log (audit trail for webhook deliveries)
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull(),
  businessId: integer("business_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  status: text("status").default("pending"), // pending, success, failed
  responseCode: integer("response_code"),
  responseBody: text("response_body"),
  attempts: integer("attempts").default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Marketing Campaigns (AI marketing tab)
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "win_back", "promotion", "review_boost", "custom"
  channel: text("channel").notNull(), // "sms", "email", "both"
  segment: text("segment"), // "inactive_90", "all", "new", "high_value", etc.
  template: text("template").notNull(), // message template with {variables}
  subject: text("subject"), // email subject (null for SMS)
  status: text("status").default("draft"), // draft, sending, sent, failed
  recipientCount: integer("recipient_count").default(0),
  sentCount: integer("sent_count").default(0),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// API Keys (for Zapier and external integrations)
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  name: text("name").notNull(), // "Zapier", "Make.com", etc.
  keyHash: text("key_hash").notNull(), // SHA-256 hash (never store plaintext)
  keyPrefix: text("key_prefix").notNull(), // "sbz_a1b2..." for identification
  lastUsedAt: timestamp("last_used_at"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Business Groups (organizations that own multiple locations)
export const businessGroups = pgTable("business_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g., "Joe's Pizza LLC"
  ownerUserId: integer("owner_user_id").notNull(), // FK -> users.id
  // Consolidated billing
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default("inactive"),
  billingEmail: text("billing_email"),
  // Multi-location discount
  multiLocationDiscountPercent: integer("multi_location_discount_percent").default(20),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Business Phone Numbers (multiple Twilio numbers per business)
export const businessPhoneNumbers = pgTable("business_phone_numbers", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(), // FK -> businesses.id
  twilioPhoneNumber: text("twilio_phone_number").notNull(), // E.164 format
  twilioPhoneNumberSid: text("twilio_phone_number_sid").notNull(),
  vapiPhoneNumberId: text("vapi_phone_number_id"), // Vapi phone number ID when connected
  label: text("label"), // "Main Line", "After Hours", "Emergency", etc.
  status: text("status").default("active"), // active, released, pending
  isPrimary: boolean("is_primary").default(false), // One primary per business
  dateProvisioned: timestamp("date_provisioned"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User-Business Access (many-to-many for multi-location support)
export const userBusinessAccess = pgTable("user_business_access", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // FK -> users.id
  businessId: integer("business_id").notNull(), // FK -> businesses.id
  role: text("role").default("owner"), // owner, manager, staff
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userBusinessUnique: unique("user_business_unique").on(table.userId, table.businessId),
}));

// Audit Logs (security event tracking)
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // null for system actions
  businessId: integer("business_id"), // null for non-business actions
  action: text("action").notNull(), // login, login_failed, 2fa_enabled, 2fa_disabled, password_change, data_export, data_delete, settings_change, api_key_created, etc.
  resource: text("resource"), // "user", "business", "call_log", etc.
  resourceId: integer("resource_id"), // ID of the affected resource
  details: jsonb("details"), // Additional context
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, lastLogin: true, createdAt: true, updatedAt: true, emailVerified: true, emailVerificationCode: true, emailVerificationExpiry: true, twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackupCodes: true });
export const insertBusinessSchema = createInsertSchema(businesses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBusinessHoursSchema = createInsertSchema(businessHours).omit({ id: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStaffSchema = createInsertSchema(staff).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStaffHoursSchema = createInsertSchema(staffHours).omit({ id: true });
export const insertStaffServiceSchema = createInsertSchema(staffServices).omit({ id: true, createdAt: true });
export const insertStaffInviteSchema = createInsertSchema(staffInvites).omit({ id: true, createdAt: true });

// Create appointment schema with date coercion to handle ISO strings from API
const baseInsertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppointmentSchema = baseInsertAppointmentSchema.extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// Restaurant reservation schema with date coercion
const baseInsertRestaurantReservationSchema = createInsertSchema(restaurantReservations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRestaurantReservationSchema = baseInsertRestaurantReservationSchema.extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobLineItemSchema = createInsertSchema(jobLineItems).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true });
export const insertReceptionistConfigSchema = createInsertSchema(receptionistConfig).omit({ id: true, updatedAt: true });
export const insertCallLogSchema = createInsertSchema(callLogs).omit({ id: true });
export const insertCalendarIntegrationSchema = createInsertSchema(calendarIntegrations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOverageChargeSchema = createInsertSchema(overageCharges).omit({ id: true, createdAt: true, updatedAt: true });
// Create and then modify the insert schema to handle the validUntil field properly
const baseInsertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true, updatedAt: true });

// Create a new schema with properly typed validUntil field
export const insertQuoteSchema = baseInsertQuoteSchema.extend({
  validUntil: z.string().nullable().optional(),
});
export const insertQuoteItemSchema = createInsertSchema(quoteItems).omit({ id: true });
export const insertReviewSettingsSchema = createInsertSchema(reviewSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReviewRequestSchema = createInsertSchema(reviewRequests).omit({ id: true, createdAt: true });
export const insertRecurringScheduleSchema = createInsertSchema(recurringSchedules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRecurringScheduleItemSchema = createInsertSchema(recurringScheduleItems).omit({ id: true });
export const insertRecurringJobHistorySchema = createInsertSchema(recurringJobHistory).omit({ id: true, createdAt: true });
export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotificationLogSchema = createInsertSchema(notificationLog).omit({ id: true, sentAt: true });
export const insertCloverMenuCacheSchema = createInsertSchema(cloverMenuCache).omit({ id: true, createdAt: true });
export const insertCloverOrderLogSchema = createInsertSchema(cloverOrderLog).omit({ id: true, createdAt: true });
export const insertSquareMenuCacheSchema = createInsertSchema(squareMenuCache).omit({ id: true, createdAt: true });
export const insertSquareOrderLogSchema = createInsertSchema(squareOrderLog).omit({ id: true, createdAt: true });
export const insertHeartlandMenuCacheSchema = createInsertSchema(heartlandMenuCache).omit({ id: true, createdAt: true });
export const insertHeartlandOrderLogSchema = createInsertSchema(heartlandOrderLog).omit({ id: true, createdAt: true });
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });
export const insertBusinessKnowledgeSchema = createInsertSchema(businessKnowledge).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUnansweredQuestionSchema = createInsertSchema(unansweredQuestions).omit({ id: true, createdAt: true });
export const insertAiSuggestionSchema = createInsertSchema(aiSuggestions).omit({ id: true, createdAt: true });
export const insertAgentSettingsSchema = createInsertSchema(agentSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSmsConversationSchema = createInsertSchema(smsConversations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAgentActivityLogSchema = createInsertSchema(agentActivityLog).omit({ id: true, createdAt: true });
export const insertQuoteFollowUpSchema = createInsertSchema(quoteFollowUps).omit({ id: true, sentAt: true });
export const insertReviewResponseSchema = createInsertSchema(reviewResponses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSocialMediaPostSchema = createInsertSchema(socialMediaPosts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWebsiteScrapeCacheSchema = createInsertSchema(websiteScrapeCache).omit({ id: true, createdAt: true });
export const insertWebhookSchema = createInsertSchema(webhooks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({ id: true, createdAt: true });
export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true });
export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBusinessGroupSchema = createInsertSchema(businessGroups).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBusinessPhoneNumberSchema = createInsertSchema(businessPhoneNumbers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserBusinessAccessSchema = createInsertSchema(userBusinessAccess).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// SMS Suppression List - global TCPA compliance suppression (checked before every SMS send)
export const smsSuppressionList = pgTable("sms_suppression_list", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  businessId: integer("business_id").notNull(),
  reason: text("reason").notNull(), // 'opt_out', 'carrier_block', 'invalid_number', 'manual', 'complaint'
  source: text("source"), // 'stop_keyword', 'admin', 'carrier_feedback', 'bounce'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => {
  return {
    phoneBusinessIdx: unique("sms_suppression_phone_business_idx").on(table.phoneNumber, table.businessId),
  };
});
export const insertSmsSuppressionSchema = createInsertSchema(smsSuppressionList).omit({ id: true, createdAt: true, updatedAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;

export type BusinessHours = typeof businessHours.$inferSelect;
export type InsertBusinessHours = z.infer<typeof insertBusinessHoursSchema>;

export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;

export type StaffHours = typeof staffHours.$inferSelect;
export type InsertStaffHours = z.infer<typeof insertStaffHoursSchema>;

export type StaffInvite = typeof staffInvites.$inferSelect;
export type InsertStaffInvite = z.infer<typeof insertStaffInviteSchema>;

export type StaffService = typeof staffServices.$inferSelect;
export type InsertStaffService = z.infer<typeof insertStaffServiceSchema>;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export type RestaurantReservation = typeof restaurantReservations.$inferSelect;
export type InsertRestaurantReservation = z.infer<typeof insertRestaurantReservationSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type JobLineItem = typeof jobLineItems.$inferSelect;
export type InsertJobLineItem = z.infer<typeof insertJobLineItemSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;

export type ReceptionistConfig = typeof receptionistConfig.$inferSelect;
export type InsertReceptionistConfig = z.infer<typeof insertReceptionistConfigSchema>;

export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = z.infer<typeof insertCallLogSchema>;

export type CalendarIntegration = typeof calendarIntegrations.$inferSelect;
export type InsertCalendarIntegration = z.infer<typeof insertCalendarIntegrationSchema>;

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;

export type OverageCharge = typeof overageCharges.$inferSelect;
export type InsertOverageCharge = z.infer<typeof insertOverageChargeSchema>;

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = z.infer<typeof insertQuoteItemSchema>;

export type ReviewSettings = typeof reviewSettings.$inferSelect;
export type InsertReviewSettings = z.infer<typeof insertReviewSettingsSchema>;

export type ReviewRequest = typeof reviewRequests.$inferSelect;
export type InsertReviewRequest = z.infer<typeof insertReviewRequestSchema>;

export type RecurringSchedule = typeof recurringSchedules.$inferSelect;
export type InsertRecurringSchedule = z.infer<typeof insertRecurringScheduleSchema>;

export type RecurringScheduleItem = typeof recurringScheduleItems.$inferSelect;
export type InsertRecurringScheduleItem = z.infer<typeof insertRecurringScheduleItemSchema>;

export type RecurringJobHistory = typeof recurringJobHistory.$inferSelect;
export type InsertRecurringJobHistory = z.infer<typeof insertRecurringJobHistorySchema>;

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;

export type NotificationLog = typeof notificationLog.$inferSelect;
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;

export type CloverMenuCache = typeof cloverMenuCache.$inferSelect;
export type InsertCloverMenuCache = z.infer<typeof insertCloverMenuCacheSchema>;

export type CloverOrderLog = typeof cloverOrderLog.$inferSelect;
export type InsertCloverOrderLog = z.infer<typeof insertCloverOrderLogSchema>;

export type SquareMenuCache = typeof squareMenuCache.$inferSelect;
export type InsertSquareMenuCache = z.infer<typeof insertSquareMenuCacheSchema>;

export type SquareOrderLog = typeof squareOrderLog.$inferSelect;
export type InsertSquareOrderLog = z.infer<typeof insertSquareOrderLogSchema>;

export type HeartlandMenuCache = typeof heartlandMenuCache.$inferSelect;
export type InsertHeartlandMenuCache = z.infer<typeof insertHeartlandMenuCacheSchema>;

export type HeartlandOrderLog = typeof heartlandOrderLog.$inferSelect;
export type InsertHeartlandOrderLog = z.infer<typeof insertHeartlandOrderLogSchema>;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

export type BusinessKnowledge = typeof businessKnowledge.$inferSelect;
export type InsertBusinessKnowledge = z.infer<typeof insertBusinessKnowledgeSchema>;

export type UnansweredQuestion = typeof unansweredQuestions.$inferSelect;
export type InsertUnansweredQuestion = z.infer<typeof insertUnansweredQuestionSchema>;

export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type InsertAiSuggestion = z.infer<typeof insertAiSuggestionSchema>;

export type WebsiteScrapeCache = typeof websiteScrapeCache.$inferSelect;
export type InsertWebsiteScrapeCache = z.infer<typeof insertWebsiteScrapeCacheSchema>;

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

export type BusinessGroup = typeof businessGroups.$inferSelect;
export type InsertBusinessGroup = z.infer<typeof insertBusinessGroupSchema>;

export type BusinessPhoneNumber = typeof businessPhoneNumbers.$inferSelect;
export type InsertBusinessPhoneNumber = z.infer<typeof insertBusinessPhoneNumberSchema>;

export type UserBusinessAccess = typeof userBusinessAccess.$inferSelect;
export type InsertUserBusinessAccess = z.infer<typeof insertUserBusinessAccessSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type AgentSettings = typeof agentSettings.$inferSelect;
export type InsertAgentSettings = z.infer<typeof insertAgentSettingsSchema>;

export type SmsConversation = typeof smsConversations.$inferSelect;
export type InsertSmsConversation = z.infer<typeof insertSmsConversationSchema>;

export type AgentActivityLog = typeof agentActivityLog.$inferSelect;
export type InsertAgentActivityLog = z.infer<typeof insertAgentActivityLogSchema>;

export type QuoteFollowUp = typeof quoteFollowUps.$inferSelect;
export type InsertQuoteFollowUp = z.infer<typeof insertQuoteFollowUpSchema>;

export type ReviewResponse = typeof reviewResponses.$inferSelect;
export type InsertReviewResponse = z.infer<typeof insertReviewResponseSchema>;

export type SocialMediaPost = typeof socialMediaPosts.$inferSelect;
export type InsertSocialMediaPost = z.infer<typeof insertSocialMediaPostSchema>;

export type SmsSuppression = typeof smsSuppressionList.$inferSelect;
export type InsertSmsSuppression = z.infer<typeof insertSmsSuppressionSchema>;
