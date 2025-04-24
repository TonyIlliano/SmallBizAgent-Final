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
  // Twilio phone number information
  twilioPhoneNumber: text("twilio_phone_number"),
  twilioPhoneNumberSid: text("twilio_phone_number_sid"),
  twilioPhoneNumberStatus: text("twilio_phone_number_status"),
  twilioDateProvisioned: timestamp("twilio_date_provisioned"),
  // QuickBooks integration information
  quickbooksRealmId: text("quickbooks_realm_id"),
  quickbooksAccessToken: text("quickbooks_access_token"),
  quickbooksRefreshToken: text("quickbooks_refresh_token"),
  quickbooksTokenExpiry: timestamp("quickbooks_token_expiry"),
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
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  stripePaymentIntentId: text("stripe_payment_intent_id"),
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
export const insertUserSchema = createInsertSchema(users).omit({ id: true, lastLogin: true, createdAt: true, updatedAt: true });
export const insertBusinessSchema = createInsertSchema(businesses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBusinessHoursSchema = createInsertSchema(businessHours).omit({ id: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStaffSchema = createInsertSchema(staff).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true });
export const insertReceptionistConfigSchema = createInsertSchema(receptionistConfig).omit({ id: true, updatedAt: true });
export const insertCallLogSchema = createInsertSchema(callLogs).omit({ id: true });
export const insertCalendarIntegrationSchema = createInsertSchema(calendarIntegrations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuoteItemSchema = createInsertSchema(quoteItems).omit({ id: true });

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

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

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
