import {
  User, InsertUser, users,
  Business, InsertBusiness, businesses,
  BusinessHours, InsertBusinessHours, businessHours,
  Service, InsertService, services,
  Customer, InsertCustomer, customers,
  Staff, InsertStaff, staff,
  StaffHours, InsertStaffHours, staffHours,
  staffServices,
  Appointment, InsertAppointment, appointments,
  Job, InsertJob, jobs,
  JobLineItem, InsertJobLineItem, jobLineItems,
  Invoice, InsertInvoice, invoices,
  InvoiceItem, InsertInvoiceItem, invoiceItems,
  ReceptionistConfig, InsertReceptionistConfig, receptionistConfig,
  CallLog, InsertCallLog, callLogs,
  Quote, InsertQuote, quotes,
  QuoteItem, InsertQuoteItem, quoteItems,
  PasswordResetToken, InsertPasswordResetToken, passwordResetTokens,
  NotificationSettings, InsertNotificationSettings, notificationSettings,
  NotificationLog, InsertNotificationLog, notificationLog,
  CloverMenuCache, InsertCloverMenuCache, cloverMenuCache,
  CloverOrderLog, InsertCloverOrderLog, cloverOrderLog,
  SquareMenuCache, InsertSquareMenuCache, squareMenuCache,
  SquareOrderLog, InsertSquareOrderLog, squareOrderLog,
  HeartlandMenuCache, InsertHeartlandMenuCache, heartlandMenuCache,
  HeartlandOrderLog, InsertHeartlandOrderLog, heartlandOrderLog,
  StaffInvite, InsertStaffInvite, staffInvites,
  BusinessKnowledge, InsertBusinessKnowledge, businessKnowledge,
  UnansweredQuestion, InsertUnansweredQuestion, unansweredQuestions,
  AiSuggestion, InsertAiSuggestion, aiSuggestions,
  AgentSettings, InsertAgentSettings, agentSettings,
  SmsConversation, InsertSmsConversation, smsConversations,
  AgentActivityLog, InsertAgentActivityLog, agentActivityLog,
  QuoteFollowUp, InsertQuoteFollowUp, quoteFollowUps,
  ReviewResponse, InsertReviewResponse, reviewResponses,
  WebsiteScrapeCache, InsertWebsiteScrapeCache, websiteScrapeCache,
  RestaurantReservation, InsertRestaurantReservation, restaurantReservations,
  BusinessPhoneNumber, InsertBusinessPhoneNumber, businessPhoneNumbers,
  BusinessGroup, InsertBusinessGroup, businessGroups,
  UserBusinessAccess, InsertUserBusinessAccess, userBusinessAccess,
  CallIntelligence, InsertCallIntelligence, callIntelligence,
  CustomerInsightsRow, InsertCustomerInsights, customerInsights,
  CustomerEngagementLock, InsertCustomerEngagementLock, customerEngagementLock,
  StaffTimeOff, InsertStaffTimeOff, staffTimeOff,
  Website, InsertWebsite, websites,
  GbpReview, InsertGbpReview, gbpReviews,
  GbpPost, InsertGbpPost, gbpPosts,
  SmsBusinessProfile, InsertSmsBusinessProfile, smsBusinessProfiles,
  OutboundMessage, InsertOutboundMessage, outboundMessages,
  InboundMessage, InsertInboundMessage, inboundMessages,
  ConversationState, InsertConversationState, conversationStates,
  MarketingTrigger, InsertMarketingTrigger, marketingTriggers,
  SmsCampaign, InsertSmsCampaign, smsCampaigns,
  CampaignAnalyticsRow, InsertCampaignAnalytics, campaignAnalytics,
  SmsActivityFeedEntry, InsertSmsActivityFeed, smsActivityFeed,
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { eq, and, or, desc, ilike, sql, gte, lte, inArray, isNull } from "drizzle-orm";
import { db, pool } from "./db";
import { encryptField, decryptField } from "./utils/encryption";

// Fields in the businesses table that require encryption at rest
const BUSINESS_ENCRYPTED_FIELDS = [
  'quickbooksAccessToken',
  'quickbooksRefreshToken',
  'cloverAccessToken',
  'cloverRefreshToken',
  'squareAccessToken',
  'squareRefreshToken',
  'heartlandApiKey',
] as const;

/**
 * Normalize a phone number to digits-only for comparison.
 * Handles: +1(555)123-4567, (555) 123-4567, 5551234567, +15551234567, etc.
 * Returns just the last 10 digits (US number without country code).
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // If 11 digits starting with 1, strip the country code
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits;
}

// Storage interface for all operations
export interface IStorage {
  // Session store for authentication
  sessionStore: session.Store;
  
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getBusinessOwner(businessId: number): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User>;
  updateUserLastLogin(id: number): Promise<User>;
  
  // Business
  getAllBusinesses(): Promise<Business[]>;
  getBusiness(id: number): Promise<Business | undefined>;
  getBusinessByTwilioPhoneNumber(phoneNumber: string): Promise<Business | undefined>;
  getBusinessByBookingSlug(slug: string): Promise<Business | undefined>;
  createBusiness(business: InsertBusiness): Promise<Business>;
  updateBusiness(id: number, business: Partial<Business>): Promise<Business>;

  // Business Hours
  getBusinessHours(businessId: number): Promise<BusinessHours[]>;
  createBusinessHours(hours: InsertBusinessHours): Promise<BusinessHours>;
  updateBusinessHours(id: number, hours: Partial<BusinessHours>): Promise<BusinessHours>;
  
  // Services
  getServices(businessId: number): Promise<Service[]>;
  getService(id: number): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: number, service: Partial<Service>): Promise<Service>;
  deleteService(id: number, businessId: number): Promise<void>;
  
  // Customers
  getCustomers(businessId: number): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByPhone(phone: string, businessId: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: number, businessId: number): Promise<void>;
  
  // Staff
  getStaff(businessId: number): Promise<Staff[]>;
  getStaffMember(id: number): Promise<Staff | undefined>;
  getStaffMemberByUserId(userId: number): Promise<Staff | undefined>;
  createStaffMember(staff: InsertStaff): Promise<Staff>;
  updateStaffMember(id: number, staff: Partial<Staff>): Promise<Staff>;
  deleteStaffMember(id: number): Promise<void>;

  // Staff Invites
  createStaffInvite(invite: InsertStaffInvite): Promise<StaffInvite>;
  getStaffInviteByCode(code: string): Promise<StaffInvite | undefined>;
  getStaffInvitesByBusiness(businessId: number): Promise<StaffInvite[]>;
  updateStaffInvite(id: number, data: Partial<StaffInvite>): Promise<StaffInvite>;

  // Staff Hours
  getStaffHours(staffId: number): Promise<StaffHours[]>;
  getStaffHoursByDay(staffId: number, day: string): Promise<StaffHours | undefined>;
  setStaffHours(staffId: number, hours: InsertStaffHours[]): Promise<StaffHours[]>;
  updateStaffHoursForDay(staffId: number, day: string, hours: Partial<StaffHours>): Promise<StaffHours>;
  getAvailableStaffForSlot(businessId: number, date: Date, time: string): Promise<Staff[]>;

  // Staff Time Off
  getStaffTimeOff(staffId: number): Promise<StaffTimeOff[]>;
  getStaffTimeOffByBusiness(businessId: number): Promise<StaffTimeOff[]>;
  getStaffTimeOffForDate(staffId: number, date: Date): Promise<StaffTimeOff[]>;
  createStaffTimeOff(timeOff: InsertStaffTimeOff): Promise<StaffTimeOff>;
  updateStaffTimeOff(id: number, businessId: number, data: Partial<StaffTimeOff>): Promise<StaffTimeOff>;
  deleteStaffTimeOff(id: number, businessId: number): Promise<void>;

  // Staff-Service assignments
  getStaffServices(staffId: number): Promise<number[]>; // returns serviceIds
  getServiceStaff(serviceId: number): Promise<number[]>; // returns staffIds
  setStaffServices(staffId: number, serviceIds: number[]): Promise<void>;
  getStaffServicesForBusiness(businessId: number): Promise<{ staffId: number; serviceId: number }[]>;

  // Appointments
  getAppointments(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    customerId?: number,
    staffId?: number
  }): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  getAppointmentByManageToken(token: string): Promise<Appointment | undefined>;
  getAppointmentsByBusinessId(businessId: number): Promise<Appointment[]>;
  getUpcomingAppointmentsByBusinessId(businessId: number, limit?: number): Promise<Appointment[]>;
  getAppointmentsByCustomerId(customerId: number, limit?: number): Promise<Appointment[]>;
  getAppointmentsByCustomerContact(email: string, phone: string): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, appointment: Partial<Appointment>): Promise<Appointment>;
  deleteAppointment(id: number, businessId: number): Promise<void>;

  // Jobs
  getJobs(businessId: number, params?: {
    status?: string,
    customerId?: number,
    staffId?: number
  }): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  getJobByAppointmentId(appointmentId: number): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, job: Partial<Job>): Promise<Job>;
  deleteJob(id: number, businessId: number): Promise<void>;

  // Job Line Items
  getJobLineItems(jobId: number): Promise<JobLineItem[]>;
  createJobLineItem(item: InsertJobLineItem): Promise<JobLineItem>;
  updateJobLineItem(id: number, item: Partial<JobLineItem>): Promise<JobLineItem>;
  deleteJobLineItem(id: number): Promise<void>;
  deleteJobLineItemsByJob(jobId: number): Promise<void>;

  // Invoices
  getInvoices(businessId: number, params?: {
    status?: string,
    customerId?: number
  }): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoiceByAccessToken(token: string): Promise<Invoice | undefined>;
  getInvoicesWithAccessToken(email?: string, phone?: string): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: number, invoice: Partial<Invoice>): Promise<Invoice>;
  deleteInvoice(id: number, businessId: number): Promise<void>;
  
  // Invoice Items
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]>;
  createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem>;
  updateInvoiceItem(id: number, item: Partial<InvoiceItem>): Promise<InvoiceItem>;
  deleteInvoiceItem(id: number): Promise<void>;
  
  // Virtual Receptionist Configuration
  getReceptionistConfig(businessId: number): Promise<ReceptionistConfig | undefined>;
  createReceptionistConfig(config: InsertReceptionistConfig): Promise<ReceptionistConfig>;
  updateReceptionistConfig(id: number, config: Partial<ReceptionistConfig>): Promise<ReceptionistConfig>;
  
  // Call Logs
  getCallLogs(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    isEmergency?: boolean,
    status?: string
  }): Promise<CallLog[]>;
  getCallLog(id: number): Promise<CallLog | undefined>;
  createCallLog(log: InsertCallLog): Promise<CallLog>;
  updateCallLog(id: number, log: Partial<CallLog>): Promise<CallLog>;

  // Call Intelligence
  getCallIntelligence(callLogId: number): Promise<CallIntelligence | undefined>;
  getCallIntelligenceByCustomer(customerId: number, businessId: number, limit?: number): Promise<CallIntelligence[]>;
  getCallIntelligenceByBusiness(businessId: number, params?: {
    startDate?: Date;
    endDate?: Date;
    intent?: string;
    followUpNeeded?: boolean;
    limit?: number;
  }): Promise<CallIntelligence[]>;
  createCallIntelligence(entry: InsertCallIntelligence): Promise<CallIntelligence>;
  updateCallIntelligence(id: number, data: Partial<CallIntelligence>): Promise<CallIntelligence>;

  // Customer Insights
  getCustomerInsights(customerId: number, businessId: number): Promise<CustomerInsightsRow | undefined>;
  getCustomerInsightsByBusiness(businessId: number, params?: {
    riskLevel?: string;
    minLifetimeValue?: number;
    limit?: number;
  }): Promise<CustomerInsightsRow[]>;
  upsertCustomerInsights(customerId: number, businessId: number, data: Partial<CustomerInsightsRow>): Promise<CustomerInsightsRow>;
  getHighRiskCustomers(businessId: number): Promise<CustomerInsightsRow[]>;

  // Customer Engagement Lock
  acquireEngagementLock(businessId: number, customerId: number, customerPhone: string, agentType: string, durationMinutes: number): Promise<{ acquired: boolean; existingLock?: CustomerEngagementLock }>;
  releaseEngagementLock(customerId: number, businessId: number): Promise<void>;
  getEngagementLock(customerId: number, businessId: number): Promise<CustomerEngagementLock | undefined>;
  releaseExpiredEngagementLocks(): Promise<number>;

  // Quotes
  getAllQuotes(businessId: number, filters?: {
    status?: string;
    search?: string;
    customerId?: number;
    jobId?: number;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<any[]>;
  getQuoteById(id: number, businessId: number): Promise<any>;
  getQuoteByAccessToken(token: string): Promise<Quote | null>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: number, quote: Partial<Quote>): Promise<Quote>;
  updateQuoteStatus(id: number, status: string): Promise<Quote>;
  deleteQuote(id: number, businessId: number): Promise<void>;
  
  // Quote Items
  getQuoteItems(quoteId: number): Promise<QuoteItem[]>;
  createQuoteItem(item: InsertQuoteItem): Promise<QuoteItem>;
  deleteQuoteItems(quoteId: number): Promise<void>;

  // Notification Settings
  getNotificationSettings(businessId: number): Promise<NotificationSettings | undefined>;
  upsertNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings>;

  // Notification Log
  createNotificationLog(entry: InsertNotificationLog): Promise<NotificationLog>;
  getNotificationLogs(businessId: number, limit?: number): Promise<NotificationLog[]>;
  hasNotificationLogByType(businessId: number, type: string, status?: string): Promise<boolean>;
  getAllPlatformNotificationLogs(limit?: number): Promise<NotificationLog[]>;

  // Clover Menu Cache
  getCloverMenuCache(businessId: number): Promise<CloverMenuCache | undefined>;
  upsertCloverMenuCache(businessId: number, menuData: any): Promise<CloverMenuCache>;

  // Clover Order Log
  createCloverOrderLog(entry: InsertCloverOrderLog): Promise<CloverOrderLog>;
  getCloverOrderLogs(businessId: number, limit?: number): Promise<CloverOrderLog[]>;
  getCloverOrderLog(id: number): Promise<CloverOrderLog | undefined>;

  // Clover Token Management
  updateBusinessCloverTokens(businessId: number, tokens: {
    cloverMerchantId?: string;
    cloverAccessToken?: string;
    cloverRefreshToken?: string;
    cloverTokenExpiry?: Date;
    cloverEnvironment?: string;
  }): Promise<Business>;
  clearBusinessCloverConnection(businessId: number): Promise<Business>;

  // Square Menu Cache
  getSquareMenuCache(businessId: number): Promise<SquareMenuCache | undefined>;
  upsertSquareMenuCache(businessId: number, menuData: any): Promise<SquareMenuCache>;

  // Square Order Log
  createSquareOrderLog(entry: InsertSquareOrderLog): Promise<SquareOrderLog>;
  getSquareOrderLogs(businessId: number, limit?: number): Promise<SquareOrderLog[]>;
  getSquareOrderLog(id: number): Promise<SquareOrderLog | undefined>;

  // Square Token Management
  updateBusinessSquareTokens(businessId: number, tokens: {
    squareMerchantId?: string;
    squareAccessToken?: string;
    squareRefreshToken?: string;
    squareTokenExpiry?: Date;
    squareLocationId?: string;
    squareEnvironment?: string;
  }): Promise<Business>;
  clearBusinessSquareConnection(businessId: number): Promise<Business>;

  // Heartland Menu Cache
  getHeartlandMenuCache(businessId: number): Promise<HeartlandMenuCache | undefined>;
  upsertHeartlandMenuCache(businessId: number, menuData: any): Promise<HeartlandMenuCache>;

  // Heartland Order Log
  createHeartlandOrderLog(entry: InsertHeartlandOrderLog): Promise<HeartlandOrderLog>;
  getHeartlandOrderLogs(businessId: number, limit?: number): Promise<HeartlandOrderLog[]>;

  // Heartland Connection
  clearBusinessHeartlandConnection(businessId: number): Promise<Business>;

  // Password Reset Tokens
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(id: number): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<void>;

  // Business Knowledge (AI Knowledge Base)
  getBusinessKnowledge(businessId: number, params?: { isApproved?: boolean; source?: string; category?: string }): Promise<BusinessKnowledge[]>;
  getBusinessKnowledgeEntry(id: number): Promise<BusinessKnowledge | undefined>;
  createBusinessKnowledge(entry: InsertBusinessKnowledge): Promise<BusinessKnowledge>;
  updateBusinessKnowledge(id: number, data: Partial<BusinessKnowledge>): Promise<BusinessKnowledge>;
  deleteBusinessKnowledge(id: number, businessId: number): Promise<void>;
  deleteBusinessKnowledgeBySource(businessId: number, source: string): Promise<void>;

  // Unanswered Questions
  getUnansweredQuestions(businessId: number, params?: { status?: string }): Promise<UnansweredQuestion[]>;
  getUnansweredQuestion(id: number): Promise<UnansweredQuestion | undefined>;
  createUnansweredQuestion(question: InsertUnansweredQuestion): Promise<UnansweredQuestion>;
  updateUnansweredQuestion(id: number, data: Partial<UnansweredQuestion>): Promise<UnansweredQuestion>;
  deleteUnansweredQuestion(id: number, businessId: number): Promise<void>;
  getUnansweredQuestionCount(businessId: number): Promise<number>;

  // AI Suggestions (Auto-Refine Pipeline)
  getAiSuggestions(businessId: number, params?: { status?: string }): Promise<AiSuggestion[]>;
  getAiSuggestion(id: number): Promise<AiSuggestion | undefined>;
  createAiSuggestion(suggestion: InsertAiSuggestion): Promise<AiSuggestion>;
  updateAiSuggestion(id: number, data: Partial<AiSuggestion>): Promise<AiSuggestion>;
  getAiSuggestionCount(businessId: number): Promise<number>;
  getAiSuggestionsAcceptedCount(businessId: number): Promise<number>;

  // Agent Settings (SMS Automation Agents)
  getAgentSettings(businessId: number, agentType: string): Promise<AgentSettings | undefined>;
  getAllAgentSettings(businessId: number): Promise<AgentSettings[]>;
  upsertAgentSettings(businessId: number, agentType: string, enabled: boolean, config: any): Promise<AgentSettings>;

  // SMS Conversations
  createSmsConversation(conv: InsertSmsConversation): Promise<SmsConversation>;
  getActiveSmsConversation(customerPhone: string, businessId: number): Promise<SmsConversation | undefined>;
  getSmsConversationsByBusiness(businessId: number, params?: { agentType?: string; state?: string; limit?: number }): Promise<SmsConversation[]>;
  updateSmsConversation(id: number, data: Partial<SmsConversation>): Promise<SmsConversation>;
  getExpiredConversations(): Promise<SmsConversation[]>;

  // Agent Activity Log
  createAgentActivityLog(entry: InsertAgentActivityLog): Promise<AgentActivityLog>;
  getAgentActivityLogs(businessId: number, params?: { agentType?: string; limit?: number }): Promise<AgentActivityLog[]>;

  // Quote Follow-ups
  createQuoteFollowUp(entry: InsertQuoteFollowUp): Promise<QuoteFollowUp>;
  getQuoteFollowUpCount(quoteId: number): Promise<number>;

  // Review Responses
  createReviewResponse(entry: InsertReviewResponse): Promise<ReviewResponse>;
  getReviewResponseById(id: number): Promise<ReviewResponse | undefined>;
  getReviewResponses(businessId: number, params?: { status?: string }): Promise<ReviewResponse[]>;
  updateReviewResponse(id: number, data: Partial<ReviewResponse>): Promise<ReviewResponse>;

  // Website Scrape Cache
  getWebsiteScrapeCache(businessId: number): Promise<WebsiteScrapeCache | undefined>;
  upsertWebsiteScrapeCache(businessId: number, data: Partial<InsertWebsiteScrapeCache>): Promise<WebsiteScrapeCache>;

  // Websites (one-page sites)
  getWebsite(businessId: number): Promise<Website | undefined>;
  getWebsiteBySubdomain(subdomain: string): Promise<Website | undefined>;
  getWebsiteByCustomDomain(domain: string): Promise<Website | undefined>;
  upsertWebsite(businessId: number, data: Partial<InsertWebsite>): Promise<Website>;

  // Restaurant Reservations
  getRestaurantReservations(businessId: number, params?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    customerId?: number;
  }): Promise<RestaurantReservation[]>;
  getRestaurantReservation(id: number): Promise<RestaurantReservation | undefined>;
  getRestaurantReservationByManageToken(token: string): Promise<RestaurantReservation | undefined>;
  createRestaurantReservation(data: InsertRestaurantReservation): Promise<RestaurantReservation>;
  updateRestaurantReservation(id: number, data: Partial<RestaurantReservation>): Promise<RestaurantReservation>;
  getReservationSlotCapacity(businessId: number, date: string, time: string, slotDurationMinutes: number): Promise<{
    totalCapacity: number;
    bookedSeats: number;
    remainingSeats: number;
  }>;

  // Business Phone Numbers
  getPhoneNumbersByBusiness(businessId: number): Promise<BusinessPhoneNumber[]>;
  getPhoneNumber(id: number): Promise<BusinessPhoneNumber | undefined>;
  createPhoneNumber(data: InsertBusinessPhoneNumber): Promise<BusinessPhoneNumber>;
  updatePhoneNumber(id: number, data: Partial<BusinessPhoneNumber>): Promise<BusinessPhoneNumber>;
  deletePhoneNumber(id: number, businessId: number): Promise<void>;
  getPhoneNumberByTwilioNumber(phoneNumber: string): Promise<BusinessPhoneNumber | undefined>;

  // Business Groups
  getBusinessGroup(id: number): Promise<BusinessGroup | undefined>;
  createBusinessGroup(data: InsertBusinessGroup): Promise<BusinessGroup>;
  updateBusinessGroup(id: number, data: Partial<BusinessGroup>): Promise<BusinessGroup>;
  getBusinessesByGroup(groupId: number): Promise<Business[]>;

  // User Business Access
  getUserBusinesses(userId: number): Promise<UserBusinessAccess[]>;
  addUserBusinessAccess(data: InsertUserBusinessAccess): Promise<UserBusinessAccess>;
  removeUserBusinessAccess(userId: number, businessId: number): Promise<void>;
  hasBusinessAccess(userId: number, businessId: number): Promise<boolean>;

  // Team Management
  getTeamMembers(businessId: number): Promise<any[]>;
  updateTeamMemberRole(userId: number, businessId: number, role: string): Promise<void>;
  removeTeamMember(userId: number, businessId: number): Promise<void>;

  // GBP Reviews
  getGbpReviews(businessId: number, filters?: { flagged?: boolean; minRating?: number; maxRating?: number; hasReply?: boolean; limit?: number; offset?: number }): Promise<GbpReview[]>;
  getGbpReviewByGbpId(gbpReviewId: string): Promise<GbpReview | undefined>;
  getGbpReviewById(id: number): Promise<GbpReview | undefined>;
  upsertGbpReview(data: InsertGbpReview): Promise<GbpReview>;
  updateGbpReview(id: number, data: Partial<GbpReview>): Promise<GbpReview>;
  countGbpReviews(businessId: number, filters?: { flagged?: boolean; hasReply?: boolean }): Promise<number>;
  getGbpReviewStats(businessId: number): Promise<{ total: number; avgRating: number; responseRate: number; flaggedCount: number }>;

  // GBP Posts
  getGbpPosts(businessId: number, filters?: { status?: string; limit?: number; offset?: number }): Promise<GbpPost[]>;
  createGbpPost(data: InsertGbpPost): Promise<GbpPost>;
  updateGbpPost(id: number, data: Partial<GbpPost>): Promise<GbpPost>;

  // ── SMS Intelligence Layer ──
  getSmsBusinessProfile(businessId: number): Promise<SmsBusinessProfile | null>;
  upsertSmsBusinessProfile(businessId: number, data: Partial<InsertSmsBusinessProfile>): Promise<SmsBusinessProfile>;
  createOutboundMessage(data: InsertOutboundMessage): Promise<OutboundMessage>;
  getOutboundMessages(businessId: number, params?: { messageType?: string; limit?: number; offset?: number }): Promise<OutboundMessage[]>;
  createInboundMessage(data: InsertInboundMessage): Promise<InboundMessage>;
  getInboundMessages(businessId: number, params?: { limit?: number; offset?: number }): Promise<InboundMessage[]>;
  upsertConversationState(businessId: number, customerId: number, data: Partial<ConversationState>): Promise<ConversationState>;
  getConversationState(businessId: number, customerId: number): Promise<ConversationState | null>;
  createMarketingTrigger(data: InsertMarketingTrigger): Promise<MarketingTrigger>;
  getPendingMarketingTriggers(limit?: number): Promise<MarketingTrigger[]>;
  updateMarketingTrigger(id: number, data: Partial<MarketingTrigger>): Promise<MarketingTrigger>;
  cancelTriggersForCustomer(businessId: number, customerId: number, reason: string): Promise<number>;
  cancelTriggersForCampaign(campaignId: number, reason: string): Promise<number>;
  createSmsCampaign(data: InsertSmsCampaign): Promise<SmsCampaign>;
  getSmsCampaigns(businessId: number, params?: { status?: string; limit?: number }): Promise<SmsCampaign[]>;
  getSmsCampaign(id: number, businessId: number): Promise<SmsCampaign | null>;
  updateSmsCampaign(id: number, data: Partial<SmsCampaign>): Promise<SmsCampaign>;
  upsertCampaignAnalytics(campaignId: number, businessId: number, data: Partial<CampaignAnalyticsRow>): Promise<CampaignAnalyticsRow>;
  getCampaignAnalytics(campaignId: number): Promise<CampaignAnalyticsRow | null>;
  createSmsActivityFeedEntry(data: InsertSmsActivityFeed): Promise<SmsActivityFeedEntry>;
  getSmsActivityFeed(businessId: number, params?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<SmsActivityFeedEntry[]>;
  markSmsActivityFeedRead(businessId: number): Promise<void>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  
  constructor() {
    // Create a PostgreSQL session store
    const PostgresStore = connectPg(session);
    this.sessionStore = new PostgresStore({
      pool,
      tableName: 'session', 
      createTableIfMissing: true
    });
  }

  // --- Encryption helpers for sensitive fields ---

  /**
   * Decrypt all sensitive token fields on a Business object after reading from DB.
   */
  private decryptBusinessFields(business: Business): Business {
    const decrypted = { ...business };
    for (const field of BUSINESS_ENCRYPTED_FIELDS) {
      if (decrypted[field]) {
        (decrypted as any)[field] = decryptField(decrypted[field]);
      }
    }
    return decrypted;
  }

  /**
   * Encrypt sensitive token fields in a partial Business object before writing to DB.
   */
  private encryptBusinessFields<T extends Partial<Business>>(data: T): T {
    const encrypted = { ...data };
    for (const field of BUSINESS_ENCRYPTED_FIELDS) {
      if (field in encrypted && (encrypted as any)[field] !== null && (encrypted as any)[field] !== undefined) {
        (encrypted as any)[field] = encryptField((encrypted as any)[field]);
      }
    }
    return encrypted;
  }

  /**
   * Decrypt the twoFactorSecret field on a User object after reading from DB.
   */
  private decryptUserFields(user: User): User {
    if (user.twoFactorSecret) {
      return { ...user, twoFactorSecret: decryptField(user.twoFactorSecret) };
    }
    return user;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ? this.decryptUserFields(user) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
    return user ? this.decryptUserFields(user) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(ilike(users.email, email));
    return user ? this.decryptUserFields(user) : undefined;
  }

  async getBusinessOwner(businessId: number): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(and(eq(users.businessId, businessId), eq(users.role, 'user')))
      .limit(1);
    return user ? this.decryptUserFields(user) : undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values({
      ...user,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newUser;
  }

  async updateUser(id: number, user: Partial<User>): Promise<User> {
    const data = { ...user };
    // Encrypt 2FA secret before writing to DB
    if ('twoFactorSecret' in data && data.twoFactorSecret !== null && data.twoFactorSecret !== undefined) {
      data.twoFactorSecret = encryptField(data.twoFactorSecret);
    }
    const [updatedUser] = await db.update(users)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return this.decryptUserFields(updatedUser);
  }

  async updateUserLastLogin(id: number): Promise<User> {
    const [updatedUser] = await db.update(users)
      .set({
        lastLogin: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  // Business methods
  async getAllBusinesses(): Promise<Business[]> {
    const results = await db.select().from(businesses);
    return results.map(b => this.decryptBusinessFields(b));
  }

  async getBusiness(id: number): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id));
    return business ? this.decryptBusinessFields(business) : undefined;
  }

  async createBusiness(business: InsertBusiness): Promise<Business> {
    const encrypted = this.encryptBusinessFields(business);
    const [newBusiness] = await db.insert(businesses).values({
      ...encrypted,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return this.decryptBusinessFields(newBusiness);
  }

  async updateBusiness(id: number, business: Partial<Business>): Promise<Business> {
    const encrypted = this.encryptBusinessFields(business);
    const [updatedBusiness] = await db.update(businesses)
      .set({
        ...encrypted,
        updatedAt: new Date()
      })
      .where(eq(businesses.id, id))
      .returning();
    return this.decryptBusinessFields(updatedBusiness);
  }

  async getBusinessByTwilioPhoneNumber(phoneNumber: string): Promise<Business | undefined> {
    // Normalize phone number format for comparison
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const phoneVariants = [
      phoneNumber,
      normalizedPhone,
      `+${normalizedPhone}`,
      `+1${normalizedPhone}`,
      normalizedPhone.slice(-10) // Last 10 digits
    ];

    // Search for business with any of the phone variants on the businesses table
    const [business] = await db.select().from(businesses)
      .where(
        or(
          ...phoneVariants.map(p => eq(businesses.twilioPhoneNumber, p))
        )
      );
    if (business) return this.decryptBusinessFields(business);

    // Fallback: search the business_phone_numbers table for additional numbers
    const [phoneRecord] = await db.select().from(businessPhoneNumbers)
      .where(
        and(
          or(
            ...phoneVariants.map(p => eq(businessPhoneNumbers.twilioPhoneNumber, p))
          ),
          eq(businessPhoneNumbers.status, 'active')
        )
      );
    if (phoneRecord) {
      return this.getBusiness(phoneRecord.businessId);
    }

    return undefined;
  }

  async getBusinessByBookingSlug(slug: string): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses)
      .where(eq(businesses.bookingSlug, slug.toLowerCase()));
    return business ? this.decryptBusinessFields(business) : undefined;
  }

  // Business Hours
  async getBusinessHours(businessId: number): Promise<BusinessHours[]> {
    return db.select().from(businessHours)
      .where(eq(businessHours.businessId, businessId));
  }

  async createBusinessHours(hours: InsertBusinessHours): Promise<BusinessHours> {
    const [newHours] = await db.insert(businessHours).values(hours).returning();
    return newHours;
  }

  async updateBusinessHours(id: number, hours: Partial<BusinessHours>): Promise<BusinessHours> {
    const [updatedHours] = await db.update(businessHours)
      .set(hours)
      .where(eq(businessHours.id, id))
      .returning();
    return updatedHours;
  }

  // Services
  async getServices(businessId: number): Promise<Service[]> {
    return db.select().from(services)
      .where(eq(services.businessId, businessId));
  }

  async getService(id: number): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service;
  }

  async createService(service: InsertService): Promise<Service> {
    const [newService] = await db.insert(services).values(service).returning();
    return newService;
  }

  async updateService(id: number, service: Partial<Service>): Promise<Service> {
    const [updatedService] = await db.update(services)
      .set(service)
      .where(eq(services.id, id))
      .returning();
    return updatedService;
  }

  async deleteService(id: number, businessId: number): Promise<void> {
    await db.delete(services).where(and(eq(services.id, id), eq(services.businessId, businessId)));
  }

  // Customers
  async getCustomers(businessId: number): Promise<Customer[]> {
    return db.select().from(customers)
      .where(eq(customers.businessId, businessId));
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async getCustomerByPhone(phone: string, businessId: number): Promise<Customer | undefined> {
    // First try exact match
    const [exact] = await db.select().from(customers)
      .where(and(
        eq(customers.phone, phone),
        eq(customers.businessId, businessId)
      ));
    if (exact) return exact;

    // Normalize and try common formats
    const digits = normalizePhone(phone);
    if (digits.length < 10) return undefined;

    const formats = [
      digits,                                                          // 5551234567
      `+1${digits}`,                                                   // +15551234567
      `1${digits}`,                                                    // 15551234567
      `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`, // (555) 123-4567
      `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`,  // 555-123-4567
    ];

    const [normalized] = await db.select().from(customers)
      .where(and(
        or(...formats.map(f => eq(customers.phone, f))),
        eq(customers.businessId, businessId)
      ));
    return normalized;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values({
      ...customer,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newCustomer;
  }

  async updateCustomer(id: number, customer: Partial<Customer>): Promise<Customer> {
    const [updatedCustomer] = await db.update(customers)
      .set({
        ...customer,
        updatedAt: new Date()
      })
      .where(eq(customers.id, id))
      .returning();
    return updatedCustomer;
  }

  async deleteCustomer(id: number, businessId: number): Promise<void> {
    await db.delete(customers).where(and(eq(customers.id, id), eq(customers.businessId, businessId)));
  }

  // Staff
  async getStaff(businessId: number): Promise<Staff[]> {
    return db.select().from(staff)
      .where(eq(staff.businessId, businessId));
  }

  async getStaffMember(id: number): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, id));
    return staffMember;
  }

  async createStaffMember(staffMember: InsertStaff): Promise<Staff> {
    const [newStaff] = await db.insert(staff).values({
      ...staffMember,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newStaff;
  }

  async updateStaffMember(id: number, staffMember: Partial<Staff>): Promise<Staff> {
    const [updatedStaff] = await db.update(staff)
      .set({
        ...staffMember,
        updatedAt: new Date()
      })
      .where(eq(staff.id, id))
      .returning();
    return updatedStaff;
  }

  async deleteStaffMember(id: number): Promise<void> {
    await db.delete(staff).where(eq(staff.id, id));
  }

  async getStaffMemberByUserId(userId: number): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.userId, userId));
    return staffMember;
  }

  // Staff Invites
  async createStaffInvite(invite: InsertStaffInvite): Promise<StaffInvite> {
    const [newInvite] = await db.insert(staffInvites).values({
      ...invite,
      createdAt: new Date(),
    }).returning();
    return newInvite;
  }

  async getStaffInviteByCode(code: string): Promise<StaffInvite | undefined> {
    const [invite] = await db.select().from(staffInvites).where(eq(staffInvites.inviteCode, code));
    return invite;
  }

  async getStaffInvitesByBusiness(businessId: number): Promise<StaffInvite[]> {
    return db.select().from(staffInvites)
      .where(eq(staffInvites.businessId, businessId))
      .orderBy(desc(staffInvites.createdAt));
  }

  async updateStaffInvite(id: number, data: Partial<StaffInvite>): Promise<StaffInvite> {
    const [updated] = await db.update(staffInvites)
      .set(data)
      .where(eq(staffInvites.id, id))
      .returning();
    return updated;
  }

  // Staff Hours
  async getStaffHours(staffId: number): Promise<StaffHours[]> {
    return db.select().from(staffHours).where(eq(staffHours.staffId, staffId));
  }

  async getStaffHoursByDay(staffId: number, day: string): Promise<StaffHours | undefined> {
    const [hours] = await db.select().from(staffHours)
      .where(and(eq(staffHours.staffId, staffId), eq(staffHours.day, day.toLowerCase())));
    return hours;
  }

  async setStaffHours(staffId: number, hours: InsertStaffHours[]): Promise<StaffHours[]> {
    // Delete existing hours for this staff member
    await db.delete(staffHours).where(eq(staffHours.staffId, staffId));

    // Insert new hours
    if (hours.length === 0) return [];

    const newHours = await db.insert(staffHours)
      .values(hours.map(h => ({ ...h, staffId })))
      .returning();
    return newHours;
  }

  async updateStaffHoursForDay(staffId: number, day: string, hours: Partial<StaffHours>): Promise<StaffHours> {
    // Check if hours exist for this day
    const existing = await this.getStaffHoursByDay(staffId, day);

    if (existing) {
      const [updated] = await db.update(staffHours)
        .set(hours)
        .where(and(eq(staffHours.staffId, staffId), eq(staffHours.day, day.toLowerCase())))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(staffHours)
        .values({ staffId, day: day.toLowerCase(), ...hours })
        .returning();
      return created;
    }
  }

  async getAvailableStaffForSlot(businessId: number, date: Date, time: string): Promise<Staff[]> {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const timeMinutes = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]);

    // Get all active staff for this business
    const allStaff = await this.getStaff(businessId);
    const activeStaff = allStaff.filter(s => s.active);

    const availableStaff: Staff[] = [];

    for (const staffMember of activeStaff) {
      // Get this staff member's hours for the day
      const dayHours = await this.getStaffHoursByDay(staffMember.id, dayName);

      // If no hours set, assume they follow business hours (available)
      // If hours are set and it's their day off, skip
      if (dayHours?.isOff) continue;

      // Check if staff has time off on this date (vacation, sick, etc.)
      const timeOffEntries = await this.getStaffTimeOffForDate(staffMember.id, date);
      if (timeOffEntries.some(t => t.allDay !== false)) continue; // Full-day time off

      // If they have hours set, check if the time falls within their working hours
      if (dayHours?.startTime && dayHours?.endTime) {
        const startMinutes = parseInt(dayHours.startTime.split(':')[0]) * 60 + parseInt(dayHours.startTime.split(':')[1]);
        const endMinutes = parseInt(dayHours.endTime.split(':')[0]) * 60 + parseInt(dayHours.endTime.split(':')[1]);

        if (timeMinutes < startMinutes || timeMinutes >= endMinutes) {
          continue; // Outside their working hours
        }
      }

      // Check if they have an appointment at this time
      const appointments = await this.getAppointments(businessId, { staffId: staffMember.id });
      const hasConflict = appointments.some(apt => {
        if (apt.status === 'cancelled') return false;
        const aptDate = new Date(apt.startDate);
        if (aptDate.toDateString() !== date.toDateString()) return false;

        const aptStart = aptDate.getHours() * 60 + aptDate.getMinutes();
        const aptEnd = new Date(apt.endDate).getHours() * 60 + new Date(apt.endDate).getMinutes();

        return timeMinutes >= aptStart && timeMinutes < aptEnd;
      });

      if (!hasConflict) {
        availableStaff.push(staffMember);
      }
    }

    return availableStaff;
  }

  // Staff-Service assignments
  async getStaffServices(staffId: number): Promise<number[]> {
    const results = await db.select().from(staffServices).where(eq(staffServices.staffId, staffId));
    return results.map(r => r.serviceId);
  }

  async getServiceStaff(serviceId: number): Promise<number[]> {
    const results = await db.select().from(staffServices).where(eq(staffServices.serviceId, serviceId));
    return results.map(r => r.staffId);
  }

  async setStaffServices(staffId: number, serviceIds: number[]): Promise<void> {
    // Delete existing assignments
    await db.delete(staffServices).where(eq(staffServices.staffId, staffId));
    // Insert new assignments
    if (serviceIds.length > 0) {
      await db.insert(staffServices).values(
        serviceIds.map(serviceId => ({ staffId, serviceId }))
      );
    }
  }

  async getStaffServicesForBusiness(businessId: number): Promise<{ staffId: number; serviceId: number }[]> {
    // Get all staff for business, then get their service assignments
    const businessStaff = await this.getStaff(businessId);
    const staffIds = businessStaff.map(s => s.id);
    if (staffIds.length === 0) return [];

    const results = await db.select().from(staffServices)
      .where(inArray(staffServices.staffId, staffIds));
    return results.map(r => ({ staffId: r.staffId, serviceId: r.serviceId }));
  }

  // Staff Time Off
  async getStaffTimeOff(staffId: number): Promise<StaffTimeOff[]> {
    return db.select().from(staffTimeOff)
      .where(eq(staffTimeOff.staffId, staffId))
      .orderBy(staffTimeOff.startDate);
  }

  async getStaffTimeOffByBusiness(businessId: number): Promise<StaffTimeOff[]> {
    return db.select().from(staffTimeOff)
      .where(eq(staffTimeOff.businessId, businessId))
      .orderBy(staffTimeOff.startDate);
  }

  async getStaffTimeOffForDate(staffId: number, date: Date): Promise<StaffTimeOff[]> {
    // Find any time-off entries that overlap with the given date
    // A time-off entry overlaps if: startDate <= endOfDay AND endDate >= startOfDay
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return db.select().from(staffTimeOff)
      .where(and(
        eq(staffTimeOff.staffId, staffId),
        lte(staffTimeOff.startDate, endOfDay),
        gte(staffTimeOff.endDate, startOfDay)
      ));
  }

  async createStaffTimeOff(timeOffData: InsertStaffTimeOff): Promise<StaffTimeOff> {
    const [entry] = await db.insert(staffTimeOff).values({
      ...timeOffData,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return entry;
  }

  async updateStaffTimeOff(id: number, businessId: number, data: Partial<StaffTimeOff>): Promise<StaffTimeOff> {
    const [updated] = await db.update(staffTimeOff)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(staffTimeOff.id, id), eq(staffTimeOff.businessId, businessId)))
      .returning();
    return updated;
  }

  async deleteStaffTimeOff(id: number, businessId: number): Promise<void> {
    await db.delete(staffTimeOff)
      .where(and(eq(staffTimeOff.id, id), eq(staffTimeOff.businessId, businessId)));
  }

  // Appointments
  async getAppointments(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    customerId?: number,
    staffId?: number
  }): Promise<Appointment[]> {
    // Build conditions array
    const conditions = [eq(appointments.businessId, businessId)];

    if (params?.customerId) {
      conditions.push(eq(appointments.customerId, params.customerId));
    }

    if (params?.staffId) {
      conditions.push(eq(appointments.staffId, params.staffId));
    }

    // Filter by date range - compare just the date portion
    if (params?.startDate) {
      // Get start of day for the filter date
      const startOfDay = new Date(params.startDate);
      startOfDay.setHours(0, 0, 0, 0);
      conditions.push(gte(appointments.startDate, startOfDay));
    }

    if (params?.endDate) {
      // Get end of day for the filter date
      const endOfDay = new Date(params.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(lte(appointments.startDate, endOfDay));
    }

    return db.select().from(appointments).where(and(...conditions));
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment;
  }

  async getAppointmentByManageToken(token: string): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.manageToken, token));
    return appointment;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [newAppointment] = await db.insert(appointments).values({
      ...appointment,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newAppointment;
  }

  async updateAppointment(id: number, appointment: Partial<Appointment>): Promise<Appointment> {
    const [updatedAppointment] = await db.update(appointments)
      .set({
        ...appointment,
        updatedAt: new Date()
      })
      .where(eq(appointments.id, id))
      .returning();
    return updatedAppointment;
  }

  async deleteAppointment(id: number, businessId: number): Promise<void> {
    await db.delete(appointments).where(and(eq(appointments.id, id), eq(appointments.businessId, businessId)));
  }

  // Helper methods for Vapi integration
  async getAppointmentsByBusinessId(businessId: number): Promise<Appointment[]> {
    return db.select().from(appointments)
      .where(eq(appointments.businessId, businessId))
      .limit(1000);
  }

  async getUpcomingAppointmentsByBusinessId(businessId: number, limit: number = 100): Promise<Appointment[]> {
    const now = new Date();
    return db.select().from(appointments)
      .where(and(
        eq(appointments.businessId, businessId),
        gte(appointments.startDate, now)
      ))
      .orderBy(appointments.startDate)
      .limit(limit);
  }

  async getAppointmentsByCustomerId(customerId: number, limit: number = 50): Promise<Appointment[]> {
    return db.select().from(appointments)
      .where(eq(appointments.customerId, customerId))
      .orderBy(desc(appointments.startDate))
      .limit(limit);
  }

  async getAppointmentsByCustomerContact(email: string, phone: string): Promise<Appointment[]> {
    if (!email && !phone) return [];

    // Find all customers matching email OR phone
    const conditions = [];
    if (email) conditions.push(eq(customers.email, email));
    if (phone) conditions.push(eq(customers.phone, phone));

    const matchingCustomers = await db.select().from(customers)
      .where(conditions.length > 1 ? or(...conditions) : conditions[0]);

    if (matchingCustomers.length === 0) return [];

    const customerIds = matchingCustomers.map(c => c.id);
    return db.select().from(appointments)
      .where(
        sql`${appointments.customerId} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`
      )
      .orderBy(desc(appointments.startDate))
      .limit(50);
  }

  // Jobs
  async getJobs(businessId: number, params?: {
    status?: string,
    customerId?: number,
    staffId?: number
  }): Promise<Job[]> {
    const conditions = [eq(jobs.businessId, businessId)];

    if (params?.status) {
      conditions.push(eq(jobs.status, params.status));
    }

    if (params?.customerId) {
      conditions.push(eq(jobs.customerId, params.customerId));
    }

    return db.select().from(jobs).where(and(...conditions));
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async getJobByAppointmentId(appointmentId: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.appointmentId, appointmentId));
    return job;
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [newJob] = await db.insert(jobs).values({
      ...job,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newJob;
  }

  async updateJob(id: number, job: Partial<Job>): Promise<Job> {
    const [updatedJob] = await db.update(jobs)
      .set({
        ...job,
        updatedAt: new Date()
      })
      .where(eq(jobs.id, id))
      .returning();
    return updatedJob;
  }

  async deleteJob(id: number, businessId: number): Promise<void> {
    await db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.businessId, businessId)));
  }

  // Job Line Items
  async getJobLineItems(jobId: number): Promise<JobLineItem[]> {
    return db.select().from(jobLineItems)
      .where(eq(jobLineItems.jobId, jobId))
      .orderBy(jobLineItems.createdAt);
  }

  async createJobLineItem(item: InsertJobLineItem): Promise<JobLineItem> {
    const [newItem] = await db.insert(jobLineItems).values({
      ...item,
      createdAt: new Date()
    }).returning();
    return newItem;
  }

  async updateJobLineItem(id: number, item: Partial<JobLineItem>): Promise<JobLineItem> {
    const [updatedItem] = await db.update(jobLineItems)
      .set(item)
      .where(eq(jobLineItems.id, id))
      .returning();
    return updatedItem;
  }

  async deleteJobLineItem(id: number): Promise<void> {
    await db.delete(jobLineItems).where(eq(jobLineItems.id, id));
  }

  async deleteJobLineItemsByJob(jobId: number): Promise<void> {
    await db.delete(jobLineItems).where(eq(jobLineItems.jobId, jobId));
  }

  // Invoices
  async getInvoices(businessId: number, params?: {
    status?: string,
    customerId?: number
  }): Promise<Invoice[]> {
    const conditions = [eq(invoices.businessId, businessId)];

    if (params?.status) {
      conditions.push(eq(invoices.status, params.status));
    }

    if (params?.customerId) {
      conditions.push(eq(invoices.customerId, params.customerId));
    }

    return db.select().from(invoices).where(and(...conditions));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoiceByAccessToken(token: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.accessToken, token));
    return invoice;
  }

  async getInvoicesWithAccessToken(email?: string, phone?: string): Promise<Invoice[]> {
    if (!email && !phone) {
      return [];
    }

    // Find customers matching email or phone
    const conditions = [];
    if (email) {
      conditions.push(eq(customers.email, email));
    }
    if (phone) {
      conditions.push(eq(customers.phone, phone));
    }

    const matchingCustomers = await db.select().from(customers)
      .where(conditions.length > 1 ? or(...conditions) : conditions[0]);

    if (matchingCustomers.length === 0) {
      return [];
    }

    // Get all invoices for these customers that have access tokens
    const customerIds = matchingCustomers.map(c => c.id);
    const allInvoices = await db.select().from(invoices)
      .where(
        and(
          sql`${invoices.customerId} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`,
          sql`${invoices.accessToken} IS NOT NULL`
        )
      )
      .orderBy(desc(invoices.createdAt))
      .limit(50);

    return allInvoices;
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [newInvoice] = await db.insert(invoices).values({
      ...invoice,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newInvoice;
  }

  async updateInvoice(id: number, invoice: Partial<Invoice>): Promise<Invoice> {
    const [updatedInvoice] = await db.update(invoices)
      .set({
        ...invoice,
        updatedAt: new Date()
      })
      .where(eq(invoices.id, id))
      .returning();
    return updatedInvoice;
  }

  async deleteInvoice(id: number, businessId: number): Promise<void> {
    await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.businessId, businessId)));
  }

  // Invoice Items
  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return db.select().from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem> {
    const [newItem] = await db.insert(invoiceItems).values(item).returning();
    return newItem;
  }

  async updateInvoiceItem(id: number, item: Partial<InvoiceItem>): Promise<InvoiceItem> {
    const [updatedItem] = await db.update(invoiceItems)
      .set(item)
      .where(eq(invoiceItems.id, id))
      .returning();
    return updatedItem;
  }

  async deleteInvoiceItem(id: number): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
  }

  // Virtual Receptionist Configuration
  async getReceptionistConfig(businessId: number): Promise<ReceptionistConfig | undefined> {
    const [config] = await db.select().from(receptionistConfig)
      .where(eq(receptionistConfig.businessId, businessId));
    return config;
  }

  async createReceptionistConfig(config: InsertReceptionistConfig): Promise<ReceptionistConfig> {
    const [newConfig] = await db.insert(receptionistConfig).values({
      ...config,
      updatedAt: new Date()
    }).returning();
    return newConfig;
  }

  async updateReceptionistConfig(id: number, config: Partial<ReceptionistConfig>): Promise<ReceptionistConfig> {
    const [updatedConfig] = await db.update(receptionistConfig)
      .set({
        ...config,
        updatedAt: new Date()
      })
      .where(eq(receptionistConfig.id, id))
      .returning();
    return updatedConfig;
  }

  // Call Logs
  async getCallLogs(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    isEmergency?: boolean,
    status?: string
  }): Promise<CallLog[]> {
    const conditions = [eq(callLogs.businessId, businessId)];

    if (params?.startDate) {
      conditions.push(gte(callLogs.callTime, params.startDate));
    }

    if (params?.endDate) {
      conditions.push(lte(callLogs.callTime, params.endDate));
    }

    if (params?.status) {
      conditions.push(eq(callLogs.status, params.status));
    }

    if (params?.isEmergency !== undefined) {
      conditions.push(eq(callLogs.isEmergency, params.isEmergency));
    }

    return db.select().from(callLogs).where(and(...conditions)).orderBy(desc(callLogs.callTime));
  }

  async getCallLog(id: number): Promise<CallLog | undefined> {
    const [log] = await db.select().from(callLogs).where(eq(callLogs.id, id));
    return log;
  }

  async createCallLog(log: InsertCallLog): Promise<CallLog> {
    const [newLog] = await db.insert(callLogs).values(log).returning();
    return newLog;
  }

  async updateCallLog(id: number, log: Partial<CallLog>): Promise<CallLog> {
    const [updatedLog] = await db.update(callLogs)
      .set(log)
      .where(eq(callLogs.id, id))
      .returning();
    return updatedLog;
  }

  // Call Intelligence
  async getCallIntelligence(callLogId: number): Promise<CallIntelligence | undefined> {
    const [result] = await db.select().from(callIntelligence)
      .where(eq(callIntelligence.callLogId, callLogId));
    return result;
  }

  async getCallIntelligenceByCustomer(customerId: number, businessId: number, limit = 10): Promise<CallIntelligence[]> {
    return db.select().from(callIntelligence)
      .where(and(
        eq(callIntelligence.customerId, customerId),
        eq(callIntelligence.businessId, businessId)
      ))
      .orderBy(desc(callIntelligence.createdAt))
      .limit(limit);
  }

  async getCallIntelligenceByBusiness(businessId: number, params?: {
    startDate?: Date; endDate?: Date; intent?: string;
    followUpNeeded?: boolean; limit?: number;
  }): Promise<CallIntelligence[]> {
    const conditions = [eq(callIntelligence.businessId, businessId)];
    if (params?.startDate) conditions.push(gte(callIntelligence.createdAt, params.startDate));
    if (params?.endDate) conditions.push(lte(callIntelligence.createdAt, params.endDate));
    if (params?.intent) conditions.push(eq(callIntelligence.intent, params.intent));
    if (params?.followUpNeeded !== undefined) conditions.push(eq(callIntelligence.followUpNeeded, params.followUpNeeded));

    return db.select().from(callIntelligence)
      .where(and(...conditions))
      .orderBy(desc(callIntelligence.createdAt))
      .limit(params?.limit ?? 100);
  }

  async createCallIntelligence(entry: InsertCallIntelligence): Promise<CallIntelligence> {
    const [result] = await db.insert(callIntelligence).values(entry).returning();
    return result;
  }

  async updateCallIntelligence(id: number, data: Partial<CallIntelligence>): Promise<CallIntelligence> {
    const [result] = await db.update(callIntelligence)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(callIntelligence.id, id))
      .returning();
    return result;
  }

  // Customer Insights
  async getCustomerInsights(customerId: number, businessId: number): Promise<CustomerInsightsRow | undefined> {
    const [result] = await db.select().from(customerInsights)
      .where(and(
        eq(customerInsights.customerId, customerId),
        eq(customerInsights.businessId, businessId)
      ));
    return result;
  }

  async getCustomerInsightsByBusiness(businessId: number, params?: {
    riskLevel?: string; minLifetimeValue?: number; limit?: number;
  }): Promise<CustomerInsightsRow[]> {
    const conditions: any[] = [eq(customerInsights.businessId, businessId)];
    if (params?.riskLevel) conditions.push(eq(customerInsights.riskLevel, params.riskLevel));
    if (params?.minLifetimeValue) conditions.push(gte(customerInsights.lifetimeValue, params.minLifetimeValue));

    return db.select().from(customerInsights)
      .where(and(...conditions))
      .orderBy(desc(customerInsights.lifetimeValue))
      .limit(params?.limit ?? 100);
  }

  async upsertCustomerInsights(customerId: number, businessId: number, data: Partial<CustomerInsightsRow>): Promise<CustomerInsightsRow> {
    // Use a transaction to prevent race conditions on concurrent inserts
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(customerInsights)
        .where(and(
          eq(customerInsights.customerId, customerId),
          eq(customerInsights.businessId, businessId),
        ));
      if (existing) {
        const [result] = await tx.update(customerInsights)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(customerInsights.id, existing.id))
          .returning();
        return result;
      }
      const [result] = await tx.insert(customerInsights)
        .values({ customerId, businessId, ...data } as InsertCustomerInsights)
        .returning();
      return result;
    });
  }

  async getHighRiskCustomers(businessId: number): Promise<CustomerInsightsRow[]> {
    return db.select().from(customerInsights)
      .where(and(
        eq(customerInsights.businessId, businessId),
        eq(customerInsights.riskLevel, 'high')
      ))
      .orderBy(desc(customerInsights.churnProbability))
      .limit(50);
  }

  // Customer Engagement Lock
  async acquireEngagementLock(
    businessId: number, customerId: number, customerPhone: string,
    agentType: string, durationMinutes: number
  ): Promise<{ acquired: boolean; existingLock?: CustomerEngagementLock }> {
    // Use raw SQL with SELECT ... FOR UPDATE to prevent race conditions.
    // A Drizzle transaction with default isolation allows two concurrent SELECT checks
    // to both see no lock before either INSERT completes (TOCTOU race).
    // FOR UPDATE acquires a row-level lock, so concurrent transactions block on the
    // SELECT until the first transaction commits or rolls back.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check for existing active lock with row-level lock.
      // FOR UPDATE blocks any concurrent transaction from reading/modifying these rows
      // until this transaction completes, preventing the TOCTOU race.
      const existing = await client.query(
        `SELECT * FROM customer_engagement_lock
         WHERE customer_id = $1 AND business_id = $2 AND status = 'active' AND expires_at > NOW()
         FOR UPDATE`,
        [customerId, businessId]
      );

      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return { acquired: false, existingLock: existing.rows[0] };
      }

      // Expire any stale locks for this customer (already locked by FOR UPDATE above if they exist)
      await client.query(
        `UPDATE customer_engagement_lock SET status = 'expired'
         WHERE customer_id = $1 AND business_id = $2 AND status = 'active' AND expires_at <= NOW()`,
        [customerId, businessId]
      );

      // No active lock exists — safe to insert
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
      await client.query(
        `INSERT INTO customer_engagement_lock (customer_id, business_id, customer_phone, locked_by_agent, locked_at, expires_at, status)
         VALUES ($1, $2, $3, $4, NOW(), $5, 'active')`,
        [customerId, businessId, customerPhone || '', agentType, expiresAt]
      );

      await client.query('COMMIT');
      return { acquired: true };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[EngagementLock] Error acquiring lock:', err);
      return { acquired: false };
    } finally {
      client.release();
    }
  }

  async releaseEngagementLock(customerId: number, businessId: number): Promise<void> {
    await db.update(customerEngagementLock)
      .set({ status: 'released' })
      .where(and(
        eq(customerEngagementLock.customerId, customerId),
        eq(customerEngagementLock.businessId, businessId),
        eq(customerEngagementLock.status, 'active'),
      ));
  }

  async getEngagementLock(customerId: number, businessId: number): Promise<CustomerEngagementLock | undefined> {
    const [result] = await db.select().from(customerEngagementLock)
      .where(and(
        eq(customerEngagementLock.customerId, customerId),
        eq(customerEngagementLock.businessId, businessId),
        eq(customerEngagementLock.status, 'active'),
        gte(customerEngagementLock.expiresAt, new Date()),
      ));
    return result;
  }

  async releaseExpiredEngagementLocks(): Promise<number> {
    const result = await db.update(customerEngagementLock)
      .set({ status: 'expired' })
      .where(and(
        eq(customerEngagementLock.status, 'active'),
        lte(customerEngagementLock.expiresAt, new Date()),
      ))
      .returning();
    return result.length;
  }

  // Quotes
  async getAllQuotes(businessId: number, filters?: {
    status?: string;
    search?: string;
    customerId?: number;
    jobId?: number;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<any[]> {
    // Build conditions array
    const conditions: ReturnType<typeof eq>[] = [eq(quotes.businessId, businessId)];

    if (filters?.status) {
      conditions.push(eq(quotes.status, filters.status));
    }

    if (filters?.customerId) {
      conditions.push(eq(quotes.customerId, filters.customerId));
    }

    if (filters?.jobId) {
      conditions.push(eq(quotes.jobId, filters.jobId as number));
    }

    if (filters?.fromDate) {
      conditions.push(gte(quotes.createdAt, filters.fromDate));
    }

    if (filters?.toDate) {
      conditions.push(lte(quotes.createdAt, filters.toDate));
    }

    // Build the query with all conditions
    let whereCondition = and(...conditions);

    // Add search filter with OR conditions
    if (filters?.search) {
      const searchCondition = or(
        ilike(quotes.quoteNumber, `%${filters.search}%`),
        ilike(customers.firstName, `%${filters.search}%`),
        ilike(customers.lastName, `%${filters.search}%`),
        ilike(customers.email, `%${filters.search}%`),
        ilike(customers.phone, `%${filters.search}%`),
        ilike(jobs.title, `%${filters.search}%`)
      );
      whereCondition = and(whereCondition, searchCondition);
    }

    // Execute the query
    const results = await db.select({
      quote: quotes,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      jobTitle: jobs.title
    })
    .from(quotes)
    .leftJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(jobs, eq(quotes.jobId, jobs.id))
    .where(whereCondition)
    .orderBy(desc(quotes.createdAt));
    
    // Format the results for the frontend
    return results.map(row => ({
      id: row.quote.id,
      quoteNumber: row.quote.quoteNumber,
      customerId: row.quote.customerId,
      customerName: row.customerFirstName && row.customerLastName 
        ? `${row.customerFirstName} ${row.customerLastName}` 
        : 'Unknown Customer',
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      jobId: row.quote.jobId,
      jobTitle: row.jobTitle,
      amount: row.quote.amount,
      tax: row.quote.tax,
      total: row.quote.total,
      status: row.quote.status,
      validUntil: row.quote.validUntil,
      createdAt: row.quote.createdAt,
      updatedAt: row.quote.updatedAt,
      convertedToInvoiceId: row.quote.convertedToInvoiceId
    }));
  }

  async getQuoteById(id: number, businessId: number): Promise<any> {
    // Fetch the quote
    const [quoteRow] = await db.select()
      .from(quotes)
      .where(and(
        eq(quotes.id, id),
        eq(quotes.businessId, businessId)
      ));
    
    if (!quoteRow) {
      return null;
    }
    
    // Fetch the customer
    const [customer] = await db.select()
      .from(customers)
      .where(eq(customers.id, quoteRow.customerId));
    
    // Fetch job if exists
    let job = null;
    if (quoteRow.jobId) {
      const [jobRow] = await db.select()
        .from(jobs)
        .where(eq(jobs.id, quoteRow.jobId));
      job = jobRow;
    }
    
    // Fetch quote items
    const items = await this.getQuoteItems(id);
    
    // Format the result
    return {
      ...quoteRow,
      customer,
      job,
      items
    };
  }

  async getQuoteByAccessToken(token: string): Promise<Quote | null> {
    const [quote] = await db.select()
      .from(quotes)
      .where(eq(quotes.accessToken, token));
    return quote || null;
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const [newQuote] = await db.insert(quotes).values({
      ...quote,
      status: quote.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newQuote;
  }

  async updateQuote(id: number, quote: Partial<Quote>): Promise<Quote> {
    // Handle Date object to string conversion for validUntil
    let quoteData = { ...quote };
    if (quote.validUntil && typeof quote.validUntil === 'object' && 'toISOString' in quote.validUntil) {
      quoteData.validUntil = (quote.validUntil as Date).toISOString();
    }

    const [updatedQuote] = await db.update(quotes)
      .set({
        ...quoteData,
        updatedAt: new Date()
      })
      .where(eq(quotes.id, id))
      .returning();
    return updatedQuote;
  }

  async updateQuoteStatus(id: number, status: string): Promise<Quote> {
    const [updatedQuote] = await db.update(quotes)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(quotes.id, id))
      .returning();
    return updatedQuote;
  }

  async deleteQuote(id: number, businessId: number): Promise<void> {
    // First delete all quote items
    await this.deleteQuoteItems(id);
    // Then delete the quote
    await db.delete(quotes).where(and(eq(quotes.id, id), eq(quotes.businessId, businessId)));
  }

  // Quote Items
  async getQuoteItems(quoteId: number): Promise<QuoteItem[]> {
    return db.select().from(quoteItems)
      .where(eq(quoteItems.quoteId, quoteId));
  }

  async createQuoteItem(item: InsertQuoteItem): Promise<QuoteItem> {
    const [newItem] = await db.insert(quoteItems).values(item).returning();
    return newItem;
  }

  async deleteQuoteItems(quoteId: number): Promise<void> {
    await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  }

  // Method for converting a quote to an invoice
  async convertQuoteToInvoice(quoteId: number): Promise<Invoice> {
    // Get the quote details
    const [quoteData] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quoteData) {
      throw new Error('Quote not found');
    }
    
    // Get the quote items
    const quoteItems = await this.getQuoteItems(quoteId);
    
    // Create a new invoice based on the quote
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Due in 30 days
    const invoice = await this.createInvoice({
      businessId: quoteData.businessId,
      customerId: quoteData.customerId,
      jobId: quoteData.jobId,
      invoiceNumber: `INV-${Date.now()}`, // Generate a new invoice number
      amount: quoteData.amount,
      tax: quoteData.tax || 0,
      total: quoteData.total,
      status: 'pending',
      notes: `Converted from Quote #${quoteData.quoteNumber}\n${quoteData.notes || ''}`.trim(),
      dueDate: dueDate.toISOString().split('T')[0], // Format as 'YYYY-MM-DD'
    });
    
    // Create invoice items from quote items
    for (const item of quoteItems) {
      await this.createInvoiceItem({
        invoiceId: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      });
    }
    
    // Mark the quote as converted
    await this.updateQuote(quoteId, {
      status: 'converted',
      convertedToInvoiceId: invoice.id,
    });

    return invoice;
  }

  // Notification Settings methods
  async getNotificationSettings(businessId: number): Promise<NotificationSettings | undefined> {
    const [settings] = await db.select().from(notificationSettings)
      .where(eq(notificationSettings.businessId, businessId));
    return settings;
  }

  async upsertNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings> {
    const existing = await this.getNotificationSettings(settings.businessId);
    if (existing) {
      const [updated] = await db.update(notificationSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(notificationSettings.businessId, settings.businessId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(notificationSettings).values(settings).returning();
    return created;
  }

  // Notification Log methods
  async createNotificationLog(entry: InsertNotificationLog): Promise<NotificationLog> {
    const [log] = await db.insert(notificationLog).values(entry).returning();
    return log;
  }

  async getNotificationLogs(businessId: number, limit: number = 50): Promise<NotificationLog[]> {
    return db.select().from(notificationLog)
      .where(eq(notificationLog.businessId, businessId))
      .orderBy(desc(notificationLog.sentAt))
      .limit(limit);
  }

  async hasNotificationLogByType(businessId: number, type: string, status: string = 'sent'): Promise<boolean> {
    const [row] = await db.select({ id: notificationLog.id }).from(notificationLog)
      .where(and(
        eq(notificationLog.businessId, businessId),
        eq(notificationLog.type, type),
        eq(notificationLog.status, status),
      ))
      .limit(1);
    return !!row;
  }

  async getAllPlatformNotificationLogs(limit: number = 100): Promise<NotificationLog[]> {
    return db.select().from(notificationLog)
      .where(isNull(notificationLog.customerId))
      .orderBy(desc(notificationLog.sentAt))
      .limit(limit);
  }

  // Clover Menu Cache methods
  async getCloverMenuCache(businessId: number): Promise<CloverMenuCache | undefined> {
    const [cache] = await db.select().from(cloverMenuCache)
      .where(eq(cloverMenuCache.businessId, businessId));
    return cache;
  }

  async upsertCloverMenuCache(businessId: number, menuData: any): Promise<CloverMenuCache> {
    // Try to update existing cache first
    const existing = await this.getCloverMenuCache(businessId);
    if (existing) {
      const [updated] = await db.update(cloverMenuCache)
        .set({ menuData, lastSyncedAt: new Date() })
        .where(eq(cloverMenuCache.businessId, businessId))
        .returning();
      return updated;
    }
    // Create new cache entry
    const [created] = await db.insert(cloverMenuCache)
      .values({ businessId, menuData, lastSyncedAt: new Date() })
      .returning();
    return created;
  }

  // Clover Order Log methods
  async createCloverOrderLog(entry: InsertCloverOrderLog): Promise<CloverOrderLog> {
    const [log] = await db.insert(cloverOrderLog).values(entry).returning();
    return log;
  }

  async getCloverOrderLogs(businessId: number, limit: number = 50): Promise<CloverOrderLog[]> {
    return db.select().from(cloverOrderLog)
      .where(eq(cloverOrderLog.businessId, businessId))
      .orderBy(desc(cloverOrderLog.createdAt))
      .limit(limit);
  }

  async getCloverOrderLog(id: number): Promise<CloverOrderLog | undefined> {
    const [log] = await db.select().from(cloverOrderLog)
      .where(eq(cloverOrderLog.id, id));
    return log;
  }

  // Clover Token Management methods
  async updateBusinessCloverTokens(businessId: number, tokens: {
    cloverMerchantId?: string;
    cloverAccessToken?: string;
    cloverRefreshToken?: string;
    cloverTokenExpiry?: Date;
    cloverEnvironment?: string;
  }): Promise<Business> {
    const encryptedTokens = { ...tokens };
    if (encryptedTokens.cloverAccessToken) {
      encryptedTokens.cloverAccessToken = encryptField(encryptedTokens.cloverAccessToken)!;
    }
    if (encryptedTokens.cloverRefreshToken) {
      encryptedTokens.cloverRefreshToken = encryptField(encryptedTokens.cloverRefreshToken)!;
    }
    const [updated] = await db.update(businesses)
      .set({ ...encryptedTokens, updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
      .returning();
    return this.decryptBusinessFields(updated);
  }

  async clearBusinessCloverConnection(businessId: number): Promise<Business> {
    const [updated] = await db.update(businesses)
      .set({
        cloverMerchantId: null,
        cloverAccessToken: null,
        cloverRefreshToken: null,
        cloverTokenExpiry: null,
        cloverEnvironment: null,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId))
      .returning();
    return updated;
  }

  // Square Menu Cache methods
  async getSquareMenuCache(businessId: number): Promise<SquareMenuCache | undefined> {
    const [cache] = await db.select().from(squareMenuCache)
      .where(eq(squareMenuCache.businessId, businessId));
    return cache;
  }

  async upsertSquareMenuCache(businessId: number, menuData: any): Promise<SquareMenuCache> {
    const existing = await this.getSquareMenuCache(businessId);
    if (existing) {
      const [updated] = await db.update(squareMenuCache)
        .set({ menuData, lastSyncedAt: new Date() })
        .where(eq(squareMenuCache.businessId, businessId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(squareMenuCache)
      .values({ businessId, menuData, lastSyncedAt: new Date() })
      .returning();
    return created;
  }

  // Square Order Log methods
  async createSquareOrderLog(entry: InsertSquareOrderLog): Promise<SquareOrderLog> {
    const [log] = await db.insert(squareOrderLog).values(entry).returning();
    return log;
  }

  async getSquareOrderLogs(businessId: number, limit: number = 50): Promise<SquareOrderLog[]> {
    return db.select().from(squareOrderLog)
      .where(eq(squareOrderLog.businessId, businessId))
      .orderBy(desc(squareOrderLog.createdAt))
      .limit(limit);
  }

  async getSquareOrderLog(id: number): Promise<SquareOrderLog | undefined> {
    const [log] = await db.select().from(squareOrderLog)
      .where(eq(squareOrderLog.id, id));
    return log;
  }

  // Square Token Management methods
  async updateBusinessSquareTokens(businessId: number, tokens: {
    squareMerchantId?: string;
    squareAccessToken?: string;
    squareRefreshToken?: string;
    squareTokenExpiry?: Date;
    squareLocationId?: string;
    squareEnvironment?: string;
  }): Promise<Business> {
    const encryptedTokens = { ...tokens };
    if (encryptedTokens.squareAccessToken) {
      encryptedTokens.squareAccessToken = encryptField(encryptedTokens.squareAccessToken)!;
    }
    if (encryptedTokens.squareRefreshToken) {
      encryptedTokens.squareRefreshToken = encryptField(encryptedTokens.squareRefreshToken)!;
    }
    const [updated] = await db.update(businesses)
      .set({ ...encryptedTokens, updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
      .returning();
    return this.decryptBusinessFields(updated);
  }

  async clearBusinessSquareConnection(businessId: number): Promise<Business> {
    const [updated] = await db.update(businesses)
      .set({
        squareMerchantId: null,
        squareAccessToken: null,
        squareRefreshToken: null,
        squareTokenExpiry: null,
        squareLocationId: null,
        squareEnvironment: null,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId))
      .returning();
    return updated;
  }

  // Heartland Menu Cache methods
  async getHeartlandMenuCache(businessId: number): Promise<HeartlandMenuCache | undefined> {
    const [cache] = await db.select().from(heartlandMenuCache)
      .where(eq(heartlandMenuCache.businessId, businessId));
    return cache;
  }

  async upsertHeartlandMenuCache(businessId: number, menuData: any): Promise<HeartlandMenuCache> {
    const existing = await this.getHeartlandMenuCache(businessId);
    if (existing) {
      const [updated] = await db.update(heartlandMenuCache)
        .set({ menuData, lastSyncedAt: new Date() })
        .where(eq(heartlandMenuCache.businessId, businessId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(heartlandMenuCache)
      .values({ businessId, menuData, lastSyncedAt: new Date() })
      .returning();
    return created;
  }

  // Heartland Order Log methods
  async createHeartlandOrderLog(entry: InsertHeartlandOrderLog): Promise<HeartlandOrderLog> {
    const [log] = await db.insert(heartlandOrderLog).values(entry).returning();
    return log;
  }

  async getHeartlandOrderLogs(businessId: number, limit: number = 50): Promise<HeartlandOrderLog[]> {
    return db.select().from(heartlandOrderLog)
      .where(eq(heartlandOrderLog.businessId, businessId))
      .orderBy(desc(heartlandOrderLog.createdAt))
      .limit(limit);
  }

  // Heartland Connection methods
  async clearBusinessHeartlandConnection(businessId: number): Promise<Business> {
    const [updated] = await db.update(businesses)
      .set({
        heartlandApiKey: null,
        heartlandLocationName: null,
        heartlandEnvironment: null,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId))
      .returning();
    return updated;
  }

  // Password Reset Token methods
  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [newToken] = await db.insert(passwordResetTokens).values({
      ...token,
      createdAt: new Date()
    }).returning();
    return newToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false)
      ));
    return resetToken;
  }

  async markPasswordResetTokenUsed(id: number): Promise<void> {
    await db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, id));
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    await db.delete(passwordResetTokens)
      .where(sql`${passwordResetTokens.expiresAt} < NOW()`);
  }

  // =================== Business Knowledge (AI Knowledge Base) ===================

  async getBusinessKnowledge(businessId: number, params?: { isApproved?: boolean; source?: string; category?: string }): Promise<BusinessKnowledge[]> {
    const conditions: any[] = [eq(businessKnowledge.businessId, businessId)];
    if (params?.isApproved !== undefined) {
      conditions.push(eq(businessKnowledge.isApproved, params.isApproved));
    }
    if (params?.source) {
      conditions.push(eq(businessKnowledge.source, params.source));
    }
    if (params?.category) {
      conditions.push(eq(businessKnowledge.category, params.category));
    }
    return db.select().from(businessKnowledge)
      .where(and(...conditions))
      .orderBy(desc(businessKnowledge.priority));
  }

  async getBusinessKnowledgeEntry(id: number): Promise<BusinessKnowledge | undefined> {
    const [entry] = await db.select().from(businessKnowledge)
      .where(eq(businessKnowledge.id, id));
    return entry;
  }

  async createBusinessKnowledge(entry: InsertBusinessKnowledge): Promise<BusinessKnowledge> {
    const [created] = await db.insert(businessKnowledge).values(entry).returning();
    return created;
  }

  async updateBusinessKnowledge(id: number, data: Partial<BusinessKnowledge>): Promise<BusinessKnowledge> {
    const [updated] = await db.update(businessKnowledge)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businessKnowledge.id, id))
      .returning();
    return updated;
  }

  async deleteBusinessKnowledge(id: number, businessId: number): Promise<void> {
    await db.delete(businessKnowledge).where(and(eq(businessKnowledge.id, id), eq(businessKnowledge.businessId, businessId)));
  }

  async deleteBusinessKnowledgeBySource(businessId: number, source: string): Promise<void> {
    await db.delete(businessKnowledge)
      .where(and(
        eq(businessKnowledge.businessId, businessId),
        eq(businessKnowledge.source, source)
      ));
  }

  // =================== Unanswered Questions ===================

  async getUnansweredQuestions(businessId: number, params?: { status?: string }): Promise<UnansweredQuestion[]> {
    const conditions: any[] = [eq(unansweredQuestions.businessId, businessId)];
    if (params?.status) {
      conditions.push(eq(unansweredQuestions.status, params.status));
    }
    return db.select().from(unansweredQuestions)
      .where(and(...conditions))
      .orderBy(desc(unansweredQuestions.createdAt));
  }

  async getUnansweredQuestion(id: number): Promise<UnansweredQuestion | undefined> {
    const [question] = await db.select().from(unansweredQuestions)
      .where(eq(unansweredQuestions.id, id));
    return question;
  }

  async createUnansweredQuestion(question: InsertUnansweredQuestion): Promise<UnansweredQuestion> {
    const [created] = await db.insert(unansweredQuestions).values(question).returning();
    return created;
  }

  async updateUnansweredQuestion(id: number, data: Partial<UnansweredQuestion>): Promise<UnansweredQuestion> {
    const [updated] = await db.update(unansweredQuestions)
      .set(data)
      .where(eq(unansweredQuestions.id, id))
      .returning();
    return updated;
  }

  async deleteUnansweredQuestion(id: number, businessId: number): Promise<void> {
    await db.delete(unansweredQuestions).where(and(eq(unansweredQuestions.id, id), eq(unansweredQuestions.businessId, businessId)));
  }

  async getUnansweredQuestionCount(businessId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(unansweredQuestions)
      .where(and(
        eq(unansweredQuestions.businessId, businessId),
        eq(unansweredQuestions.status, 'pending')
      ));
    return Number(result[0]?.count ?? 0);
  }

  // =================== AI Suggestions (Auto-Refine Pipeline) ===================

  async getAiSuggestions(businessId: number, params?: { status?: string }): Promise<AiSuggestion[]> {
    const conditions: any[] = [eq(aiSuggestions.businessId, businessId)];
    if (params?.status) {
      conditions.push(eq(aiSuggestions.status, params.status));
    }
    return db.select().from(aiSuggestions)
      .where(and(...conditions))
      .orderBy(desc(aiSuggestions.createdAt));
  }

  async getAiSuggestion(id: number): Promise<AiSuggestion | undefined> {
    const [suggestion] = await db.select().from(aiSuggestions)
      .where(eq(aiSuggestions.id, id));
    return suggestion;
  }

  async createAiSuggestion(suggestion: InsertAiSuggestion): Promise<AiSuggestion> {
    const [created] = await db.insert(aiSuggestions).values(suggestion).returning();
    return created;
  }

  async updateAiSuggestion(id: number, data: Partial<AiSuggestion>): Promise<AiSuggestion> {
    const [updated] = await db.update(aiSuggestions)
      .set(data)
      .where(eq(aiSuggestions.id, id))
      .returning();
    return updated;
  }

  async getAiSuggestionCount(businessId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(aiSuggestions)
      .where(and(
        eq(aiSuggestions.businessId, businessId),
        eq(aiSuggestions.status, 'pending')
      ));
    return Number(result[0]?.count ?? 0);
  }

  async getAiSuggestionsAcceptedCount(businessId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(aiSuggestions)
      .where(and(
        eq(aiSuggestions.businessId, businessId),
        or(eq(aiSuggestions.status, 'accepted'), eq(aiSuggestions.status, 'edited'))
      ));
    return Number(result[0]?.count ?? 0);
  }

  // =================== Agent Settings ===================

  async getAgentSettings(businessId: number, agentType: string): Promise<AgentSettings | undefined> {
    const [settings] = await db.select().from(agentSettings)
      .where(and(eq(agentSettings.businessId, businessId), eq(agentSettings.agentType, agentType)));
    return settings;
  }

  async getAllAgentSettings(businessId: number): Promise<AgentSettings[]> {
    return db.select().from(agentSettings)
      .where(eq(agentSettings.businessId, businessId));
  }

  async upsertAgentSettings(businessId: number, agentType: string, enabled: boolean, config: any): Promise<AgentSettings> {
    const existing = await this.getAgentSettings(businessId, agentType);
    if (existing) {
      const [updated] = await db.update(agentSettings)
        .set({ enabled, config, updatedAt: new Date() })
        .where(eq(agentSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(agentSettings)
      .values({ businessId, agentType, enabled, config })
      .returning();
    return created;
  }

  // =================== SMS Conversations ===================

  async createSmsConversation(conv: InsertSmsConversation): Promise<SmsConversation> {
    const [created] = await db.insert(smsConversations).values(conv).returning();
    return created;
  }

  async getActiveSmsConversation(customerPhone: string, businessId: number): Promise<SmsConversation | undefined> {
    // Normalize phone for matching
    const digits = customerPhone.replace(/\D/g, '').slice(-10);
    const activeStates = ['awaiting_reply', 'collecting_preferences', 'offering_slots', 'confirming_booking', 'disambiguating', 'reschedule_awaiting', 'opt_in_awaiting', 'birthday_awaiting'];
    const results = await db.select().from(smsConversations)
      .where(and(
        eq(smsConversations.businessId, businessId),
        inArray(smsConversations.state, activeStates)
      ))
      .orderBy(desc(smsConversations.createdAt));
    // Match by normalized phone
    return results.find(c => c.customerPhone.replace(/\D/g, '').slice(-10) === digits);
  }

  async getSmsConversationsByBusiness(businessId: number, params?: { agentType?: string; state?: string; limit?: number }): Promise<SmsConversation[]> {
    const conditions = [eq(smsConversations.businessId, businessId)];
    if (params?.agentType) conditions.push(eq(smsConversations.agentType, params.agentType));
    if (params?.state) conditions.push(eq(smsConversations.state, params.state));
    return db.select().from(smsConversations)
      .where(and(...conditions))
      .orderBy(desc(smsConversations.createdAt))
      .limit(params?.limit ?? 50);
  }

  async updateSmsConversation(id: number, data: Partial<SmsConversation>): Promise<SmsConversation> {
    const [updated] = await db.update(smsConversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(smsConversations.id, id))
      .returning();
    return updated;
  }

  async getExpiredConversations(): Promise<SmsConversation[]> {
    const activeStates = ['awaiting_reply', 'collecting_preferences', 'offering_slots', 'confirming_booking', 'disambiguating', 'reschedule_awaiting', 'opt_in_awaiting', 'birthday_awaiting'];
    return db.select().from(smsConversations)
      .where(and(
        inArray(smsConversations.state, activeStates),
        lte(smsConversations.expiresAt, new Date())
      ));
  }

  // =================== Agent Activity Log ===================

  async createAgentActivityLog(entry: InsertAgentActivityLog): Promise<AgentActivityLog> {
    const [created] = await db.insert(agentActivityLog).values(entry).returning();
    return created;
  }

  async getAgentActivityLogs(businessId: number, params?: { agentType?: string; limit?: number }): Promise<AgentActivityLog[]> {
    const conditions = [eq(agentActivityLog.businessId, businessId)];
    if (params?.agentType) {
      conditions.push(eq(agentActivityLog.agentType, params.agentType));
    }
    return db.select().from(agentActivityLog)
      .where(and(...conditions))
      .orderBy(desc(agentActivityLog.createdAt))
      .limit(params?.limit ?? 50);
  }

  // =================== Quote Follow-ups ===================

  async createQuoteFollowUp(entry: InsertQuoteFollowUp): Promise<QuoteFollowUp> {
    const [created] = await db.insert(quoteFollowUps).values(entry).returning();
    return created;
  }

  async getQuoteFollowUpCount(quoteId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(quoteFollowUps)
      .where(eq(quoteFollowUps.quoteId, quoteId));
    return Number(result[0]?.count ?? 0);
  }

  // =================== Review Responses ===================

  async createReviewResponse(entry: InsertReviewResponse): Promise<ReviewResponse> {
    const [created] = await db.insert(reviewResponses).values(entry).returning();
    return created;
  }

  async getReviewResponseById(id: number): Promise<ReviewResponse | undefined> {
    const [result] = await db.select().from(reviewResponses).where(eq(reviewResponses.id, id)).limit(1);
    return result;
  }

  async getReviewResponses(businessId: number, params?: { status?: string }): Promise<ReviewResponse[]> {
    const conditions = [eq(reviewResponses.businessId, businessId)];
    if (params?.status) {
      conditions.push(eq(reviewResponses.status, params.status));
    }
    return db.select().from(reviewResponses)
      .where(and(...conditions))
      .orderBy(desc(reviewResponses.createdAt));
  }

  async updateReviewResponse(id: number, data: Partial<ReviewResponse>): Promise<ReviewResponse> {
    const [updated] = await db.update(reviewResponses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reviewResponses.id, id))
      .returning();
    return updated;
  }

  // =================== Website Scrape Cache ===================

  async getWebsiteScrapeCache(businessId: number): Promise<WebsiteScrapeCache | undefined> {
    const [cache] = await db.select().from(websiteScrapeCache)
      .where(eq(websiteScrapeCache.businessId, businessId));
    return cache;
  }

  async upsertWebsiteScrapeCache(businessId: number, data: Partial<InsertWebsiteScrapeCache>): Promise<WebsiteScrapeCache> {
    // Check if exists
    const existing = await this.getWebsiteScrapeCache(businessId);
    if (existing) {
      const [updated] = await db.update(websiteScrapeCache)
        .set(data)
        .where(eq(websiteScrapeCache.businessId, businessId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(websiteScrapeCache)
        .values({ businessId, url: data.url || '', ...data })
        .returning();
      return created;
    }
  }

  // =================== Restaurant Reservations ===================

  async getRestaurantReservations(businessId: number, params?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    customerId?: number;
  }): Promise<RestaurantReservation[]> {
    const conditions = [eq(restaurantReservations.businessId, businessId)];

    if (params?.date) {
      conditions.push(eq(restaurantReservations.reservationDate, params.date));
    }
    if (params?.startDate) {
      conditions.push(gte(restaurantReservations.reservationDate, params.startDate));
    }
    if (params?.endDate) {
      conditions.push(lte(restaurantReservations.reservationDate, params.endDate));
    }
    if (params?.status) {
      conditions.push(eq(restaurantReservations.status, params.status));
    }
    if (params?.customerId) {
      conditions.push(eq(restaurantReservations.customerId, params.customerId));
    }

    return db.select().from(restaurantReservations)
      .where(and(...conditions))
      .orderBy(restaurantReservations.reservationDate, restaurantReservations.reservationTime);
  }

  async getRestaurantReservation(id: number): Promise<RestaurantReservation | undefined> {
    const [reservation] = await db.select().from(restaurantReservations)
      .where(eq(restaurantReservations.id, id));
    return reservation;
  }

  async getRestaurantReservationByManageToken(token: string): Promise<RestaurantReservation | undefined> {
    const [reservation] = await db.select().from(restaurantReservations)
      .where(eq(restaurantReservations.manageToken, token));
    return reservation;
  }

  async createRestaurantReservation(data: InsertRestaurantReservation): Promise<RestaurantReservation> {
    const [reservation] = await db.insert(restaurantReservations)
      .values(data)
      .returning();
    return reservation;
  }

  async updateRestaurantReservation(id: number, data: Partial<RestaurantReservation>): Promise<RestaurantReservation> {
    const [reservation] = await db.update(restaurantReservations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(restaurantReservations.id, id))
      .returning();
    return reservation;
  }

  async getReservationSlotCapacity(businessId: number, date: string, time: string, slotDurationMinutes: number): Promise<{
    totalCapacity: number;
    bookedSeats: number;
    remainingSeats: number;
  }> {
    // Get the business to read max capacity
    const business = await this.getBusiness(businessId);
    const totalCapacity = business?.reservationMaxCapacityPerSlot || 40;

    // Parse the requested slot start/end times
    // time is "HH:MM", date is "YYYY-MM-DD"
    const [hours, minutes] = time.split(':').map(Number);
    const slotStart = new Date(`${date}T${time}:00`);
    const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60 * 1000);

    // Get all non-cancelled reservations for this date
    const dayReservations = await db.select().from(restaurantReservations)
      .where(and(
        eq(restaurantReservations.businessId, businessId),
        eq(restaurantReservations.reservationDate, date),
        sql`${restaurantReservations.status} NOT IN ('cancelled', 'no_show')`
      ));

    // Sum party sizes of overlapping reservations
    // A reservation overlaps if its time range intersects with the requested slot
    let bookedSeats = 0;
    for (const res of dayReservations) {
      const resStart = new Date(res.startDate);
      const resEnd = new Date(res.endDate);

      // Check overlap: two intervals overlap if one starts before the other ends AND vice versa
      if (resStart < slotEnd && resEnd > slotStart) {
        bookedSeats += res.partySize;
      }
    }

    return {
      totalCapacity,
      bookedSeats,
      remainingSeats: Math.max(0, totalCapacity - bookedSeats),
    };
  }

  // =================== Business Phone Numbers ===================

  async getPhoneNumbersByBusiness(businessId: number): Promise<BusinessPhoneNumber[]> {
    return db.select().from(businessPhoneNumbers)
      .where(eq(businessPhoneNumbers.businessId, businessId))
      .orderBy(desc(businessPhoneNumbers.createdAt));
  }

  async getPhoneNumber(id: number): Promise<BusinessPhoneNumber | undefined> {
    const [phoneNumber] = await db.select().from(businessPhoneNumbers)
      .where(eq(businessPhoneNumbers.id, id));
    return phoneNumber;
  }

  async createPhoneNumber(data: InsertBusinessPhoneNumber): Promise<BusinessPhoneNumber> {
    const [created] = await db.insert(businessPhoneNumbers).values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updatePhoneNumber(id: number, data: Partial<BusinessPhoneNumber>): Promise<BusinessPhoneNumber> {
    const [updated] = await db.update(businessPhoneNumbers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businessPhoneNumbers.id, id))
      .returning();
    return updated;
  }

  async deletePhoneNumber(id: number, businessId: number): Promise<void> {
    await db.delete(businessPhoneNumbers).where(and(eq(businessPhoneNumbers.id, id), eq(businessPhoneNumbers.businessId, businessId)));
  }

  async getPhoneNumberByTwilioNumber(phoneNumber: string): Promise<BusinessPhoneNumber | undefined> {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const phoneVariants = [
      phoneNumber,
      normalizedPhone,
      `+${normalizedPhone}`,
      `+1${normalizedPhone}`,
      normalizedPhone.slice(-10)
    ];

    const [record] = await db.select().from(businessPhoneNumbers)
      .where(
        or(
          ...phoneVariants.map(p => eq(businessPhoneNumbers.twilioPhoneNumber, p))
        )
      );
    return record;
  }

  // =================== Business Groups ===================

  async getBusinessGroup(id: number): Promise<BusinessGroup | undefined> {
    const [group] = await db.select().from(businessGroups)
      .where(eq(businessGroups.id, id));
    return group;
  }

  async createBusinessGroup(data: InsertBusinessGroup): Promise<BusinessGroup> {
    const [created] = await db.insert(businessGroups).values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateBusinessGroup(id: number, data: Partial<BusinessGroup>): Promise<BusinessGroup> {
    const [updated] = await db.update(businessGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businessGroups.id, id))
      .returning();
    return updated;
  }

  async getBusinessesByGroup(groupId: number): Promise<Business[]> {
    return db.select().from(businesses)
      .where(eq(businesses.businessGroupId, groupId));
  }

  // =================== User Business Access ===================

  async getUserBusinesses(userId: number): Promise<UserBusinessAccess[]> {
    return db.select().from(userBusinessAccess)
      .where(eq(userBusinessAccess.userId, userId));
  }

  async addUserBusinessAccess(data: InsertUserBusinessAccess): Promise<UserBusinessAccess> {
    const [created] = await db.insert(userBusinessAccess).values({
      ...data,
      createdAt: new Date(),
    }).returning();
    return created;
  }

  async removeUserBusinessAccess(userId: number, businessId: number): Promise<void> {
    await db.delete(userBusinessAccess)
      .where(and(
        eq(userBusinessAccess.userId, userId),
        eq(userBusinessAccess.businessId, businessId)
      ));
  }

  async hasBusinessAccess(userId: number, businessId: number): Promise<boolean> {
    const [record] = await db.select().from(userBusinessAccess)
      .where(and(
        eq(userBusinessAccess.userId, userId),
        eq(userBusinessAccess.businessId, businessId)
      ));
    return !!record;
  }

  // =================== Team Management ===================

  async getTeamMembers(businessId: number): Promise<any[]> {
    // Get team members from user_business_access (managers, staff with access)
    const accessMembers = await db.select({
      userId: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      accessRole: userBusinessAccess.role,
      lastLoginAt: users.lastLogin,
      createdAt: users.createdAt,
    })
      .from(userBusinessAccess)
      .innerJoin(users, eq(userBusinessAccess.userId, users.id))
      .where(eq(userBusinessAccess.businessId, businessId));

    // Also include the business owner (user where businessId matches and role is 'user')
    const ownerMembers = await db.select({
      userId: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      lastLoginAt: users.lastLogin,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(and(
        eq(users.businessId, businessId),
        eq(users.role, 'user')
      ));

    // Combine: owner gets accessRole 'owner', access members keep their accessRole
    const ownerResults = ownerMembers.map(o => ({
      ...o,
      accessRole: 'owner',
    }));

    // Deduplicate by userId (owner might also be in user_business_access)
    const seen = new Set<number>();
    const combined: any[] = [];
    for (const member of ownerResults) {
      if (!seen.has(member.userId)) {
        seen.add(member.userId);
        combined.push(member);
      }
    }
    for (const member of accessMembers) {
      if (!seen.has(member.userId)) {
        seen.add(member.userId);
        combined.push(member);
      }
    }

    return combined;
  }

  async updateTeamMemberRole(userId: number, businessId: number, role: string): Promise<void> {
    await db.update(userBusinessAccess)
      .set({ role })
      .where(and(
        eq(userBusinessAccess.userId, userId),
        eq(userBusinessAccess.businessId, businessId)
      ));
  }

  async removeTeamMember(userId: number, businessId: number): Promise<void> {
    await db.delete(userBusinessAccess)
      .where(and(
        eq(userBusinessAccess.userId, userId),
        eq(userBusinessAccess.businessId, businessId)
      ));
  }

  // =================== Websites (one-page sites) ===================

  async getWebsite(businessId: number): Promise<Website | undefined> {
    const [website] = await db.select().from(websites)
      .where(eq(websites.businessId, businessId));
    return website;
  }

  async getWebsiteBySubdomain(subdomain: string): Promise<Website | undefined> {
    const [website] = await db.select().from(websites)
      .where(eq(websites.subdomain, subdomain));
    return website;
  }

  async getWebsiteByCustomDomain(domain: string): Promise<Website | undefined> {
    const [website] = await db.select().from(websites)
      .where(and(
        eq(websites.customDomain, domain),
        eq(websites.domainVerified, true)
      ));
    return website;
  }

  async upsertWebsite(businessId: number, data: Partial<InsertWebsite>): Promise<Website> {
    const existing = await this.getWebsite(businessId);
    if (existing) {
      const [updated] = await db.update(websites)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(websites.businessId, businessId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(websites)
        .values({ businessId, ...data })
        .returning();
      return created;
    }
  }

  // =================== GBP Reviews ===================

  async getGbpReviews(businessId: number, filters?: { flagged?: boolean; minRating?: number; maxRating?: number; hasReply?: boolean; limit?: number; offset?: number }): Promise<GbpReview[]> {
    const conditions = [eq(gbpReviews.businessId, businessId)];

    if (filters?.flagged !== undefined) {
      conditions.push(eq(gbpReviews.flagged, filters.flagged));
    }
    if (filters?.minRating !== undefined) {
      conditions.push(gte(gbpReviews.rating, filters.minRating));
    }
    if (filters?.maxRating !== undefined) {
      conditions.push(lte(gbpReviews.rating, filters.maxRating));
    }
    if (filters?.hasReply === true) {
      conditions.push(sql`${gbpReviews.replyText} IS NOT NULL`);
    } else if (filters?.hasReply === false) {
      conditions.push(isNull(gbpReviews.replyText));
    }

    let query = db.select().from(gbpReviews)
      .where(and(...conditions))
      .orderBy(desc(gbpReviews.reviewDate));

    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as typeof query;
    }

    return query;
  }

  async getGbpReviewByGbpId(gbpReviewId: string): Promise<GbpReview | undefined> {
    const [review] = await db.select().from(gbpReviews)
      .where(eq(gbpReviews.gbpReviewId, gbpReviewId));
    return review;
  }

  async getGbpReviewById(id: number): Promise<GbpReview | undefined> {
    const [review] = await db.select().from(gbpReviews)
      .where(eq(gbpReviews.id, id));
    return review;
  }

  async upsertGbpReview(data: InsertGbpReview): Promise<GbpReview> {
    const existing = await this.getGbpReviewByGbpId(data.gbpReviewId);
    if (existing) {
      const [updated] = await db.update(gbpReviews)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(gbpReviews.gbpReviewId, data.gbpReviewId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(gbpReviews)
        .values(data)
        .returning();
      return created;
    }
  }

  async updateGbpReview(id: number, data: Partial<GbpReview>): Promise<GbpReview> {
    const [updated] = await db.update(gbpReviews)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(gbpReviews.id, id))
      .returning();
    return updated;
  }

  async countGbpReviews(businessId: number, filters?: { flagged?: boolean; hasReply?: boolean }): Promise<number> {
    const conditions = [eq(gbpReviews.businessId, businessId)];

    if (filters?.flagged !== undefined) {
      conditions.push(eq(gbpReviews.flagged, filters.flagged));
    }
    if (filters?.hasReply === true) {
      conditions.push(sql`${gbpReviews.replyText} IS NOT NULL`);
    } else if (filters?.hasReply === false) {
      conditions.push(isNull(gbpReviews.replyText));
    }

    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(gbpReviews)
      .where(and(...conditions));
    return result?.count ?? 0;
  }

  async getGbpReviewStats(businessId: number): Promise<{ total: number; avgRating: number; responseRate: number; flaggedCount: number }> {
    const [result] = await db.select({
      total: sql<number>`count(*)::int`,
      avgRating: sql<number>`coalesce(avg(${gbpReviews.rating})::numeric(3,1), 0)`,
      withReply: sql<number>`count(case when ${gbpReviews.replyText} is not null then 1 end)::int`,
      flaggedCount: sql<number>`count(case when ${gbpReviews.flagged} = true then 1 end)::int`,
    })
      .from(gbpReviews)
      .where(eq(gbpReviews.businessId, businessId));

    const total = result?.total ?? 0;
    return {
      total,
      avgRating: Math.round(Number(result?.avgRating ?? 0) * 10) / 10,
      responseRate: total > 0 ? Math.round(((result?.withReply ?? 0) / total) * 100) : 0,
      flaggedCount: result?.flaggedCount ?? 0,
    };
  }

  // =================== GBP Posts ===================

  async getGbpPosts(businessId: number, filters?: { status?: string; limit?: number; offset?: number }): Promise<GbpPost[]> {
    const conditions = [eq(gbpPosts.businessId, businessId)];

    if (filters?.status) {
      conditions.push(eq(gbpPosts.status, filters.status));
    }

    let query = db.select().from(gbpPosts)
      .where(and(...conditions))
      .orderBy(desc(gbpPosts.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as typeof query;
    }

    return query;
  }

  async createGbpPost(data: InsertGbpPost): Promise<GbpPost> {
    const [created] = await db.insert(gbpPosts)
      .values(data)
      .returning();
    return created;
  }

  async updateGbpPost(id: number, data: Partial<GbpPost>): Promise<GbpPost> {
    const [updated] = await db.update(gbpPosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(gbpPosts.id, id))
      .returning();
    return updated;
  }
  // ── SMS Intelligence Layer ──────────────────────────────────────────────────

  async getSmsBusinessProfile(businessId: number): Promise<SmsBusinessProfile | null> {
    const [profile] = await db.select().from(smsBusinessProfiles).where(eq(smsBusinessProfiles.businessId, businessId));
    return profile || null;
  }

  async upsertSmsBusinessProfile(businessId: number, data: Partial<InsertSmsBusinessProfile>): Promise<SmsBusinessProfile> {
    const existing = await this.getSmsBusinessProfile(businessId);
    if (existing) {
      const [updated] = await db.update(smsBusinessProfiles).set({ ...data, updatedAt: new Date() }).where(eq(smsBusinessProfiles.businessId, businessId)).returning();
      return updated;
    }
    const [created] = await db.insert(smsBusinessProfiles).values({ ...data, businessId } as InsertSmsBusinessProfile).returning();
    return created;
  }

  async createOutboundMessage(data: InsertOutboundMessage): Promise<OutboundMessage> {
    const [msg] = await db.insert(outboundMessages).values(data).returning();
    return msg;
  }

  async getOutboundMessages(businessId: number, params?: { messageType?: string; limit?: number; offset?: number }): Promise<OutboundMessage[]> {
    const conditions = [eq(outboundMessages.businessId, businessId)];
    if (params?.messageType) conditions.push(eq(outboundMessages.messageType, params.messageType));
    return db.select().from(outboundMessages).where(and(...conditions)).orderBy(desc(outboundMessages.createdAt)).limit(params?.limit || 50).offset(params?.offset || 0);
  }

  async createInboundMessage(data: InsertInboundMessage): Promise<InboundMessage> {
    const [msg] = await db.insert(inboundMessages).values(data).returning();
    return msg;
  }

  async getInboundMessages(businessId: number, params?: { limit?: number; offset?: number }): Promise<InboundMessage[]> {
    return db.select().from(inboundMessages).where(eq(inboundMessages.businessId, businessId)).orderBy(desc(inboundMessages.createdAt)).limit(params?.limit || 50).offset(params?.offset || 0);
  }

  async upsertConversationState(businessId: number, customerId: number, data: Partial<ConversationState>): Promise<ConversationState> {
    const [existing] = await db.select().from(conversationStates).where(and(eq(conversationStates.businessId, businessId), eq(conversationStates.customerId, customerId)));
    if (existing) {
      const [updated] = await db.update(conversationStates).set({ ...data, updatedAt: new Date() }).where(eq(conversationStates.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(conversationStates).values({ ...data, businessId, customerId } as InsertConversationState).returning();
    return created;
  }

  async getConversationState(businessId: number, customerId: number): Promise<ConversationState | null> {
    const [state] = await db.select().from(conversationStates).where(and(eq(conversationStates.businessId, businessId), eq(conversationStates.customerId, customerId)));
    return state || null;
  }

  async createMarketingTrigger(data: InsertMarketingTrigger): Promise<MarketingTrigger> {
    const [trigger] = await db.insert(marketingTriggers).values(data).returning();
    return trigger;
  }

  async getPendingMarketingTriggers(limit: number = 100): Promise<MarketingTrigger[]> {
    return db.select().from(marketingTriggers)
      .where(and(eq(marketingTriggers.status, 'pending'), lte(marketingTriggers.scheduledFor, new Date())))
      .orderBy(marketingTriggers.scheduledFor)
      .limit(limit);
  }

  async updateMarketingTrigger(id: number, data: Partial<MarketingTrigger>): Promise<MarketingTrigger> {
    const [updated] = await db.update(marketingTriggers).set({ ...data, updatedAt: new Date() }).where(eq(marketingTriggers.id, id)).returning();
    return updated;
  }

  async cancelTriggersForCustomer(businessId: number, customerId: number, reason: string): Promise<number> {
    const result = await db.update(marketingTriggers)
      .set({ status: 'cancelled', skipReason: reason, updatedAt: new Date() })
      .where(and(eq(marketingTriggers.businessId, businessId), eq(marketingTriggers.customerId, customerId), eq(marketingTriggers.status, 'pending')))
      .returning();
    return result.length;
  }

  async cancelTriggersForCampaign(campaignId: number, reason: string): Promise<number> {
    const result = await db.update(marketingTriggers)
      .set({ status: 'cancelled', skipReason: reason, updatedAt: new Date() })
      .where(and(eq(marketingTriggers.campaignId, campaignId), eq(marketingTriggers.status, 'pending')))
      .returning();
    return result.length;
  }

  async createSmsCampaign(data: InsertSmsCampaign): Promise<SmsCampaign> {
    const [campaign] = await db.insert(smsCampaigns).values(data).returning();
    return campaign;
  }

  async getSmsCampaigns(businessId: number, params?: { status?: string; limit?: number }): Promise<SmsCampaign[]> {
    const conditions = [eq(smsCampaigns.businessId, businessId)];
    if (params?.status) conditions.push(eq(smsCampaigns.status, params.status));
    return db.select().from(smsCampaigns).where(and(...conditions)).orderBy(desc(smsCampaigns.createdAt)).limit(params?.limit || 50);
  }

  async getSmsCampaign(id: number, businessId: number): Promise<SmsCampaign | null> {
    const [campaign] = await db.select().from(smsCampaigns).where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.businessId, businessId)));
    return campaign || null;
  }

  async updateSmsCampaign(id: number, data: Partial<SmsCampaign>): Promise<SmsCampaign> {
    const [updated] = await db.update(smsCampaigns).set({ ...data, updatedAt: new Date() }).where(eq(smsCampaigns.id, id)).returning();
    return updated;
  }

  async upsertCampaignAnalytics(campaignId: number, businessId: number, data: Partial<CampaignAnalyticsRow>): Promise<CampaignAnalyticsRow> {
    const [existing] = await db.select().from(campaignAnalytics).where(eq(campaignAnalytics.campaignId, campaignId));
    if (existing) {
      const [updated] = await db.update(campaignAnalytics).set({ ...data, updatedAt: new Date() }).where(eq(campaignAnalytics.campaignId, campaignId)).returning();
      return updated;
    }
    const [created] = await db.insert(campaignAnalytics).values({ ...data, campaignId, businessId } as InsertCampaignAnalytics).returning();
    return created;
  }

  async getCampaignAnalytics(campaignId: number): Promise<CampaignAnalyticsRow | null> {
    const [row] = await db.select().from(campaignAnalytics).where(eq(campaignAnalytics.campaignId, campaignId));
    return row || null;
  }

  async createSmsActivityFeedEntry(data: InsertSmsActivityFeed): Promise<SmsActivityFeedEntry> {
    const [entry] = await db.insert(smsActivityFeed).values(data).returning();
    return entry;
  }

  async getSmsActivityFeed(businessId: number, params?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<SmsActivityFeedEntry[]> {
    const conditions = [eq(smsActivityFeed.businessId, businessId)];
    if (params?.unreadOnly) conditions.push(eq(smsActivityFeed.readByOwner, false));
    return db.select().from(smsActivityFeed).where(and(...conditions)).orderBy(desc(smsActivityFeed.createdAt)).limit(params?.limit || 50).offset(params?.offset || 0);
  }

  async markSmsActivityFeedRead(businessId: number): Promise<void> {
    await db.update(smsActivityFeed).set({ readByOwner: true }).where(and(eq(smsActivityFeed.businessId, businessId), eq(smsActivityFeed.readByOwner, false)));
  }
}

// Export an instance of DatabaseStorage for use in the application
export const storage = new DatabaseStorage();