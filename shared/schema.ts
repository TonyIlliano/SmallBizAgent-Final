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
  email: text("email").notNull(),
  website: text("website"),
  logoUrl: text("logo_url"),
  // Business type and timezone for virtual receptionist
  type: text("type").default("general"), // plumbing, electrical, medical, etc.
  timezone: text("timezone").default("America/New_York"), // IANA timezone
  // Online booking configuration
  bookingSlug: text("booking_slug"), // Unique URL slug for public booking page (e.g., "joes-plumbing")
  bookingEnabled: boolean("booking_enabled").default(false), // Toggle to enable/disable online booking
  bookingLeadTimeHours: integer("booking_lead_time_hours").default(24), // Minimum hours notice required
  bookingBufferMinutes: integer("booking_buffer_minutes").default(15), // Buffer time between appointments
  bookingSlotIntervalMinutes: integer("booking_slot_interval_minutes").default(30), // Slot interval (15, 30, 60 min etc.)
  // Industry type for AI receptionist context
  industry: text("industry"),
  businessHours: text("business_hours"), // JSON string or simple text
  // Twilio phone number information
  twilioPhoneNumber: text("twilio_phone_number"),
  twilioPhoneNumberSid: text("twilio_phone_number_sid"),
  twilioPhoneNumberStatus: text("twilio_phone_number_status"),
  twilioDateProvisioned: timestamp("twilio_date_provisioned"),
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
  // Restaurant order type settings
  restaurantPickupEnabled: boolean("restaurant_pickup_enabled").default(true),
  restaurantDeliveryEnabled: boolean("restaurant_delivery_enabled").default(false),
  // Multi-location tracking
  numberOfLocations: integer("number_of_locations").default(1),
  // Subscription information
  subscriptionStatus: text("subscription_status").default("inactive"),
  subscriptionPlanId: text("subscription_plan_id"),
  stripePlanId: integer("stripe_plan_id"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
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

// Password Reset Tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Subscription Plans
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  interval: text("interval").notNull(), // monthly, yearly
  features: jsonb("features"), // Array of features included in this plan
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  active: boolean("active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, lastLogin: true, createdAt: true, updatedAt: true, emailVerified: true, emailVerificationCode: true, emailVerificationExpiry: true });
export const insertBusinessSchema = createInsertSchema(businesses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBusinessHoursSchema = createInsertSchema(businessHours).omit({ id: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStaffSchema = createInsertSchema(staff).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStaffHoursSchema = createInsertSchema(staffHours).omit({ id: true });
export const insertStaffInviteSchema = createInsertSchema(staffInvites).omit({ id: true, createdAt: true });

// Create appointment schema with date coercion to handle ISO strings from API
const baseInsertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppointmentSchema = baseInsertAppointmentSchema.extend({
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
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });

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

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

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

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
