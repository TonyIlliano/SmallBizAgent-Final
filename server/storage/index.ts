import {
  User, InsertUser,
  Business, InsertBusiness,
  BusinessHours, InsertBusinessHours,
  Service, InsertService,
  Customer, InsertCustomer,
  Staff, InsertStaff,
  StaffHours, InsertStaffHours,
  StaffInvite, InsertStaffInvite,
  StaffTimeOff, InsertStaffTimeOff,
  Appointment, InsertAppointment,
  Job, InsertJob,
  JobLineItem, InsertJobLineItem,
  Invoice, InsertInvoice,
  InvoiceItem, InsertInvoiceItem,
  ReceptionistConfig, InsertReceptionistConfig,
  CallLog, InsertCallLog,
  Quote, InsertQuote,
  QuoteItem, InsertQuoteItem,
  QuoteFollowUp, InsertQuoteFollowUp,
  PasswordResetToken, InsertPasswordResetToken,
  NotificationSettings, InsertNotificationSettings,
  NotificationLog, InsertNotificationLog,
  CloverMenuCache, InsertCloverMenuCache,
  CloverOrderLog, InsertCloverOrderLog,
  SquareMenuCache, InsertSquareMenuCache,
  SquareOrderLog, InsertSquareOrderLog,
  HeartlandMenuCache, InsertHeartlandMenuCache,
  HeartlandOrderLog, InsertHeartlandOrderLog,
  BusinessKnowledge, InsertBusinessKnowledge,
  UnansweredQuestion, InsertUnansweredQuestion,
  AiSuggestion, InsertAiSuggestion,
  AgentSettings, InsertAgentSettings,
  SmsConversation, InsertSmsConversation,
  AgentActivityLog, InsertAgentActivityLog,
  ReviewResponse, InsertReviewResponse,
  WebsiteScrapeCache, InsertWebsiteScrapeCache,
  RestaurantReservation, InsertRestaurantReservation,
  BusinessPhoneNumber, InsertBusinessPhoneNumber,
  BusinessGroup, InsertBusinessGroup,
  UserBusinessAccess, InsertUserBusinessAccess,
  CallIntelligence, InsertCallIntelligence,
  CustomerInsightsRow, InsertCustomerInsights,
  CustomerEngagementLock, InsertCustomerEngagementLock,
  Website, InsertWebsite,
  GbpReview, InsertGbpReview,
  GbpPost, InsertGbpPost,
  SmsBusinessProfile, InsertSmsBusinessProfile,
  OutboundMessage, InsertOutboundMessage,
  InboundMessage, InsertInboundMessage,
  ConversationState, InsertConversationState,
  MarketingTrigger, InsertMarketingTrigger,
  SmsCampaign, InsertSmsCampaign,
  CampaignAnalyticsRow, InsertCampaignAnalytics,
  SmsActivityFeedEntry, InsertSmsActivityFeed,
  Workflow, InsertWorkflow,
  WorkflowRun, InsertWorkflowRun,
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "../db";

// Domain module imports
import * as customerFns from "./customers";
import * as appointmentFns from "./appointments";
import * as jobFns from "./jobs";
import * as invoiceFns from "./invoices";
import * as staffFns from "./staff";
import * as commsFns from "./communications";
import * as businessFns from "./business";
import * as integrationFns from "./integrations";
import * as smsFns from "./sms-intelligence";
import * as workflowFns from "./workflows";

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
  getCustomers(businessId: number, params?: { limit?: number; offset?: number }): Promise<Customer[]>;
  getArchivedCustomers(businessId: number): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByPhone(phone: string, businessId: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: number, businessId: number): Promise<void>;
  archiveCustomer(id: number, businessId: number): Promise<Customer>;
  restoreCustomer(id: number, businessId: number): Promise<Customer>;

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
  getStaffServices(staffId: number): Promise<number[]>;
  getServiceStaff(serviceId: number): Promise<number[]>;
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
    staffId?: number,
    limit?: number,
    offset?: number
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
  // Workflows
  createWorkflow(data: InsertWorkflow): Promise<Workflow>;
  getWorkflows(businessId: number, params?: { status?: string; limit?: number }): Promise<Workflow[]>;
  getWorkflow(id: number, businessId: number): Promise<Workflow | null>;
  updateWorkflow(id: number, data: Partial<Workflow>): Promise<Workflow>;
  deleteWorkflow(id: number, businessId: number): Promise<boolean>;
  getActiveWorkflowsByTrigger(triggerEvent: string): Promise<Workflow[]>;
  // Workflow Runs
  createWorkflowRun(data: InsertWorkflowRun): Promise<WorkflowRun>;
  getWorkflowRun(id: number): Promise<WorkflowRun | null>;
  getWorkflowRuns(businessId: number, params?: { workflowId?: number; status?: string; limit?: number }): Promise<WorkflowRun[]>;
  updateWorkflowRun(id: number, data: Partial<WorkflowRun>): Promise<WorkflowRun>;
  getActiveRunsForCustomer(customerId: number, businessId: number, workflowId?: number): Promise<WorkflowRun[]>;
  getDueWorkflowRuns(limit?: number): Promise<WorkflowRun[]>;
  cancelWorkflowRunsForCustomer(businessId: number, customerId: number, reason: string): Promise<number>;
}

// Database storage implementation — delegates to domain modules
export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    const PostgresStore = connectPg(session);
    this.sessionStore = new PostgresStore({
      pool,
      tableName: 'session',
      createTableIfMissing: true
    });
  }

  // --- Users (business.ts) ---
  getUser = businessFns.getUser;
  getUserByUsername = businessFns.getUserByUsername;
  getUserByEmail = businessFns.getUserByEmail;
  getBusinessOwner = businessFns.getBusinessOwner;
  createUser = businessFns.createUser;
  updateUser = businessFns.updateUser;
  updateUserLastLogin = businessFns.updateUserLastLogin;

  // --- Business (business.ts) ---
  getAllBusinesses = businessFns.getAllBusinesses;
  getBusiness = businessFns.getBusiness;
  getBusinessByTwilioPhoneNumber = businessFns.getBusinessByTwilioPhoneNumber;
  getBusinessByBookingSlug = businessFns.getBusinessByBookingSlug;
  createBusiness = businessFns.createBusiness;
  updateBusiness = businessFns.updateBusiness;

  // --- Business Hours (business.ts) ---
  getBusinessHours = businessFns.getBusinessHours;
  createBusinessHours = businessFns.createBusinessHours;
  updateBusinessHours = businessFns.updateBusinessHours;

  // --- Services (business.ts) ---
  getServices = businessFns.getServices;
  getService = businessFns.getService;
  createService = businessFns.createService;
  updateService = businessFns.updateService;
  deleteService = businessFns.deleteService;

  // --- Customers (customers.ts) ---
  getCustomers = customerFns.getCustomers;
  getArchivedCustomers = customerFns.getArchivedCustomers;
  getCustomer = customerFns.getCustomer;
  getCustomerByPhone = customerFns.getCustomerByPhone;
  createCustomer = customerFns.createCustomer;
  updateCustomer = customerFns.updateCustomer;
  deleteCustomer = customerFns.deleteCustomer;
  archiveCustomer = customerFns.archiveCustomer;
  restoreCustomer = customerFns.restoreCustomer;

  // --- Customer Insights (customers.ts) ---
  getCustomerInsights = customerFns.getCustomerInsights;
  getCustomerInsightsByBusiness = customerFns.getCustomerInsightsByBusiness;
  upsertCustomerInsights = customerFns.upsertCustomerInsights;
  getHighRiskCustomers = customerFns.getHighRiskCustomers;

  // --- Staff (staff.ts) ---
  getStaff = staffFns.getStaff;
  getStaffMember = staffFns.getStaffMember;
  getStaffMemberByUserId = staffFns.getStaffMemberByUserId;
  createStaffMember = staffFns.createStaffMember;
  updateStaffMember = staffFns.updateStaffMember;
  deleteStaffMember = staffFns.deleteStaffMember;

  // --- Staff Invites (staff.ts) ---
  createStaffInvite = staffFns.createStaffInvite;
  getStaffInviteByCode = staffFns.getStaffInviteByCode;
  getStaffInvitesByBusiness = staffFns.getStaffInvitesByBusiness;
  updateStaffInvite = staffFns.updateStaffInvite;

  // --- Staff Hours (staff.ts) ---
  getStaffHours = staffFns.getStaffHours;
  getStaffHoursByDay = staffFns.getStaffHoursByDay;
  setStaffHours = staffFns.setStaffHours;
  updateStaffHoursForDay = staffFns.updateStaffHoursForDay;
  getAvailableStaffForSlot = staffFns.getAvailableStaffForSlot;

  // --- Staff Time Off (staff.ts) ---
  getStaffTimeOff = staffFns.getStaffTimeOff;
  getStaffTimeOffByBusiness = staffFns.getStaffTimeOffByBusiness;
  getStaffTimeOffForDate = staffFns.getStaffTimeOffForDate;
  createStaffTimeOff = staffFns.createStaffTimeOff;
  updateStaffTimeOff = staffFns.updateStaffTimeOff;
  deleteStaffTimeOff = staffFns.deleteStaffTimeOff;

  // --- Staff-Service Assignments (staff.ts) ---
  getStaffServices = staffFns.getStaffServices;
  getServiceStaff = staffFns.getServiceStaff;
  setStaffServices = staffFns.setStaffServices;
  getStaffServicesForBusiness = staffFns.getStaffServicesForBusiness;

  // --- Appointments (appointments.ts) ---
  getAppointments = appointmentFns.getAppointments;
  getAppointment = appointmentFns.getAppointment;
  getAppointmentByManageToken = appointmentFns.getAppointmentByManageToken;
  getAppointmentsByBusinessId = appointmentFns.getAppointmentsByBusinessId;
  getUpcomingAppointmentsByBusinessId = appointmentFns.getUpcomingAppointmentsByBusinessId;
  getAppointmentsByCustomerId = appointmentFns.getAppointmentsByCustomerId;
  getAppointmentsByCustomerContact = appointmentFns.getAppointmentsByCustomerContact;
  createAppointment = appointmentFns.createAppointment;
  updateAppointment = appointmentFns.updateAppointment;
  deleteAppointment = appointmentFns.deleteAppointment;

  // --- Jobs (jobs.ts) ---
  getJobs = jobFns.getJobs;
  getJob = jobFns.getJob;
  getJobByAppointmentId = jobFns.getJobByAppointmentId;
  createJob = jobFns.createJob;
  updateJob = jobFns.updateJob;
  deleteJob = jobFns.deleteJob;

  // --- Job Line Items (jobs.ts) ---
  getJobLineItems = jobFns.getJobLineItems;
  createJobLineItem = jobFns.createJobLineItem;
  updateJobLineItem = jobFns.updateJobLineItem;
  deleteJobLineItem = jobFns.deleteJobLineItem;
  deleteJobLineItemsByJob = jobFns.deleteJobLineItemsByJob;

  // --- Invoices (invoices.ts) ---
  getInvoices = invoiceFns.getInvoices;
  getInvoice = invoiceFns.getInvoice;
  getInvoiceByAccessToken = invoiceFns.getInvoiceByAccessToken;
  getInvoicesWithAccessToken = invoiceFns.getInvoicesWithAccessToken;
  createInvoice = invoiceFns.createInvoice;
  updateInvoice = invoiceFns.updateInvoice;
  deleteInvoice = invoiceFns.deleteInvoice;

  // --- Invoice Items (invoices.ts) ---
  getInvoiceItems = invoiceFns.getInvoiceItems;
  createInvoiceItem = invoiceFns.createInvoiceItem;
  updateInvoiceItem = invoiceFns.updateInvoiceItem;
  deleteInvoiceItem = invoiceFns.deleteInvoiceItem;

  // --- Quotes (invoices.ts) ---
  getAllQuotes = invoiceFns.getAllQuotes;
  getQuoteById = invoiceFns.getQuoteById;
  getQuoteByAccessToken = invoiceFns.getQuoteByAccessToken;
  createQuote = invoiceFns.createQuote;
  updateQuote = invoiceFns.updateQuote;
  updateQuoteStatus = invoiceFns.updateQuoteStatus;
  deleteQuote = invoiceFns.deleteQuote;

  // --- Quote Items (invoices.ts) ---
  getQuoteItems = invoiceFns.getQuoteItems;
  createQuoteItem = invoiceFns.createQuoteItem;
  deleteQuoteItems = invoiceFns.deleteQuoteItems;

  // --- Quote Follow-ups (invoices.ts) ---
  createQuoteFollowUp = invoiceFns.createQuoteFollowUp;
  getQuoteFollowUpCount = invoiceFns.getQuoteFollowUpCount;

  // --- Receptionist Config (business.ts) ---
  getReceptionistConfig = businessFns.getReceptionistConfig;
  createReceptionistConfig = businessFns.createReceptionistConfig;
  updateReceptionistConfig = businessFns.updateReceptionistConfig;

  // --- Call Logs (communications.ts) ---
  getCallLogs = commsFns.getCallLogs;
  getCallLog = commsFns.getCallLog;
  createCallLog = commsFns.createCallLog;
  updateCallLog = commsFns.updateCallLog;

  // --- Call Intelligence (communications.ts) ---
  getCallIntelligence = commsFns.getCallIntelligence;
  getCallIntelligenceByCustomer = commsFns.getCallIntelligenceByCustomer;
  getCallIntelligenceByBusiness = commsFns.getCallIntelligenceByBusiness;
  createCallIntelligence = commsFns.createCallIntelligence;
  updateCallIntelligence = commsFns.updateCallIntelligence;

  // --- Engagement Lock (communications.ts) ---
  acquireEngagementLock = commsFns.acquireEngagementLock;
  releaseEngagementLock = commsFns.releaseEngagementLock;
  getEngagementLock = commsFns.getEngagementLock;
  releaseExpiredEngagementLocks = commsFns.releaseExpiredEngagementLocks;

  // --- SMS Conversations (communications.ts) ---
  createSmsConversation = commsFns.createSmsConversation;
  getActiveSmsConversation = commsFns.getActiveSmsConversation;
  getSmsConversationsByBusiness = commsFns.getSmsConversationsByBusiness;
  updateSmsConversation = commsFns.updateSmsConversation;
  getExpiredConversations = commsFns.getExpiredConversations;

  // --- Agent Activity Log (communications.ts) ---
  createAgentActivityLog = commsFns.createAgentActivityLog;
  getAgentActivityLogs = commsFns.getAgentActivityLogs;

  // --- Agent Settings (communications.ts) ---
  getAgentSettings = commsFns.getAgentSettings;
  getAllAgentSettings = commsFns.getAllAgentSettings;
  upsertAgentSettings = commsFns.upsertAgentSettings;

  // --- Notification Settings (communications.ts) ---
  getNotificationSettings = commsFns.getNotificationSettings;
  upsertNotificationSettings = commsFns.upsertNotificationSettings;

  // --- Notification Log (communications.ts) ---
  createNotificationLog = commsFns.createNotificationLog;
  getNotificationLogs = commsFns.getNotificationLogs;
  hasNotificationLogByType = commsFns.hasNotificationLogByType;
  getAllPlatformNotificationLogs = commsFns.getAllPlatformNotificationLogs;

  // --- Review Responses (communications.ts) ---
  createReviewResponse = commsFns.createReviewResponse;
  getReviewResponseById = commsFns.getReviewResponseById;
  getReviewResponses = commsFns.getReviewResponses;
  updateReviewResponse = commsFns.updateReviewResponse;

  // --- Password Reset Tokens (business.ts) ---
  createPasswordResetToken = businessFns.createPasswordResetToken;
  getPasswordResetToken = businessFns.getPasswordResetToken;
  markPasswordResetTokenUsed = businessFns.markPasswordResetTokenUsed;
  deleteExpiredPasswordResetTokens = businessFns.deleteExpiredPasswordResetTokens;

  // --- Business Knowledge (business.ts) ---
  getBusinessKnowledge = businessFns.getBusinessKnowledge;
  getBusinessKnowledgeEntry = businessFns.getBusinessKnowledgeEntry;
  createBusinessKnowledge = businessFns.createBusinessKnowledge;
  updateBusinessKnowledge = businessFns.updateBusinessKnowledge;
  deleteBusinessKnowledge = businessFns.deleteBusinessKnowledge;
  deleteBusinessKnowledgeBySource = businessFns.deleteBusinessKnowledgeBySource;

  // --- Unanswered Questions (business.ts) ---
  getUnansweredQuestions = businessFns.getUnansweredQuestions;
  getUnansweredQuestion = businessFns.getUnansweredQuestion;
  createUnansweredQuestion = businessFns.createUnansweredQuestion;
  updateUnansweredQuestion = businessFns.updateUnansweredQuestion;
  deleteUnansweredQuestion = businessFns.deleteUnansweredQuestion;
  getUnansweredQuestionCount = businessFns.getUnansweredQuestionCount;

  // --- AI Suggestions (business.ts) ---
  getAiSuggestions = businessFns.getAiSuggestions;
  getAiSuggestion = businessFns.getAiSuggestion;
  createAiSuggestion = businessFns.createAiSuggestion;
  updateAiSuggestion = businessFns.updateAiSuggestion;
  getAiSuggestionCount = businessFns.getAiSuggestionCount;
  getAiSuggestionsAcceptedCount = businessFns.getAiSuggestionsAcceptedCount;

  // --- Website Scrape Cache (business.ts) ---
  getWebsiteScrapeCache = businessFns.getWebsiteScrapeCache;
  upsertWebsiteScrapeCache = businessFns.upsertWebsiteScrapeCache;

  // --- Clover POS (business.ts) ---
  getCloverMenuCache = businessFns.getCloverMenuCache;
  upsertCloverMenuCache = businessFns.upsertCloverMenuCache;
  createCloverOrderLog = businessFns.createCloverOrderLog;
  getCloverOrderLogs = businessFns.getCloverOrderLogs;
  getCloverOrderLog = businessFns.getCloverOrderLog;
  updateBusinessCloverTokens = businessFns.updateBusinessCloverTokens;
  clearBusinessCloverConnection = businessFns.clearBusinessCloverConnection;

  // --- Square POS (business.ts) ---
  getSquareMenuCache = businessFns.getSquareMenuCache;
  upsertSquareMenuCache = businessFns.upsertSquareMenuCache;
  createSquareOrderLog = businessFns.createSquareOrderLog;
  getSquareOrderLogs = businessFns.getSquareOrderLogs;
  getSquareOrderLog = businessFns.getSquareOrderLog;
  updateBusinessSquareTokens = businessFns.updateBusinessSquareTokens;
  clearBusinessSquareConnection = businessFns.clearBusinessSquareConnection;

  // --- Heartland POS (business.ts) ---
  getHeartlandMenuCache = businessFns.getHeartlandMenuCache;
  upsertHeartlandMenuCache = businessFns.upsertHeartlandMenuCache;
  createHeartlandOrderLog = businessFns.createHeartlandOrderLog;
  getHeartlandOrderLogs = businessFns.getHeartlandOrderLogs;
  clearBusinessHeartlandConnection = businessFns.clearBusinessHeartlandConnection;

  // --- Websites (integrations.ts) ---
  getWebsite = integrationFns.getWebsite;
  getWebsiteBySubdomain = integrationFns.getWebsiteBySubdomain;
  getWebsiteByCustomDomain = integrationFns.getWebsiteByCustomDomain;
  upsertWebsite = integrationFns.upsertWebsite;

  // --- Restaurant Reservations (integrations.ts) ---
  getRestaurantReservations = integrationFns.getRestaurantReservations;
  getRestaurantReservation = integrationFns.getRestaurantReservation;
  getRestaurantReservationByManageToken = integrationFns.getRestaurantReservationByManageToken;
  createRestaurantReservation = integrationFns.createRestaurantReservation;
  updateRestaurantReservation = integrationFns.updateRestaurantReservation;
  getReservationSlotCapacity = integrationFns.getReservationSlotCapacity;

  // --- Business Phone Numbers (integrations.ts) ---
  getPhoneNumbersByBusiness = integrationFns.getPhoneNumbersByBusiness;
  getPhoneNumber = integrationFns.getPhoneNumber;
  createPhoneNumber = integrationFns.createPhoneNumber;
  updatePhoneNumber = integrationFns.updatePhoneNumber;
  deletePhoneNumber = integrationFns.deletePhoneNumber;
  getPhoneNumberByTwilioNumber = integrationFns.getPhoneNumberByTwilioNumber;

  // --- Business Groups (integrations.ts) ---
  getBusinessGroup = integrationFns.getBusinessGroup;
  createBusinessGroup = integrationFns.createBusinessGroup;
  updateBusinessGroup = integrationFns.updateBusinessGroup;
  getBusinessesByGroup = integrationFns.getBusinessesByGroup;

  // --- User Business Access (integrations.ts) ---
  getUserBusinesses = integrationFns.getUserBusinesses;
  addUserBusinessAccess = integrationFns.addUserBusinessAccess;
  removeUserBusinessAccess = integrationFns.removeUserBusinessAccess;
  hasBusinessAccess = integrationFns.hasBusinessAccess;

  // --- Team Management (integrations.ts) ---
  getTeamMembers = integrationFns.getTeamMembers;
  updateTeamMemberRole = integrationFns.updateTeamMemberRole;
  removeTeamMember = integrationFns.removeTeamMember;

  // --- GBP Reviews (integrations.ts) ---
  getGbpReviews = integrationFns.getGbpReviews;
  getGbpReviewByGbpId = integrationFns.getGbpReviewByGbpId;
  getGbpReviewById = integrationFns.getGbpReviewById;
  upsertGbpReview = integrationFns.upsertGbpReview;
  updateGbpReview = integrationFns.updateGbpReview;
  countGbpReviews = integrationFns.countGbpReviews;
  getGbpReviewStats = integrationFns.getGbpReviewStats;

  // --- GBP Posts (integrations.ts) ---
  getGbpPosts = integrationFns.getGbpPosts;
  createGbpPost = integrationFns.createGbpPost;
  updateGbpPost = integrationFns.updateGbpPost;

  // --- SMS Intelligence (sms-intelligence.ts) ---
  getSmsBusinessProfile = smsFns.getSmsBusinessProfile;
  upsertSmsBusinessProfile = smsFns.upsertSmsBusinessProfile;
  createOutboundMessage = smsFns.createOutboundMessage;
  getOutboundMessages = smsFns.getOutboundMessages;
  createInboundMessage = smsFns.createInboundMessage;
  getInboundMessages = smsFns.getInboundMessages;
  upsertConversationState = smsFns.upsertConversationState;
  getConversationState = smsFns.getConversationState;
  createMarketingTrigger = smsFns.createMarketingTrigger;
  getPendingMarketingTriggers = smsFns.getPendingMarketingTriggers;
  updateMarketingTrigger = smsFns.updateMarketingTrigger;
  cancelTriggersForCustomer = smsFns.cancelTriggersForCustomer;
  cancelTriggersForCampaign = smsFns.cancelTriggersForCampaign;
  createSmsCampaign = smsFns.createSmsCampaign;
  getSmsCampaigns = smsFns.getSmsCampaigns;
  getSmsCampaign = smsFns.getSmsCampaign;
  updateSmsCampaign = smsFns.updateSmsCampaign;
  upsertCampaignAnalytics = smsFns.upsertCampaignAnalytics;
  getCampaignAnalytics = smsFns.getCampaignAnalytics;
  createSmsActivityFeedEntry = smsFns.createSmsActivityFeedEntry;
  getSmsActivityFeed = smsFns.getSmsActivityFeed;
  markSmsActivityFeedRead = smsFns.markSmsActivityFeedRead;

  // --- Workflows (workflows.ts) ---
  createWorkflow = workflowFns.createWorkflow;
  getWorkflows = workflowFns.getWorkflows;
  getWorkflow = workflowFns.getWorkflow;
  updateWorkflow = workflowFns.updateWorkflow;
  deleteWorkflow = workflowFns.deleteWorkflow;
  getActiveWorkflowsByTrigger = workflowFns.getActiveWorkflowsByTrigger;

  // --- Workflow Runs (workflows.ts) ---
  createWorkflowRun = workflowFns.createWorkflowRun;
  getWorkflowRun = workflowFns.getWorkflowRun;
  getWorkflowRuns = workflowFns.getWorkflowRuns;
  updateWorkflowRun = workflowFns.updateWorkflowRun;
  getActiveRunsForCustomer = workflowFns.getActiveRunsForCustomer;
  getDueWorkflowRuns = workflowFns.getDueWorkflowRuns;
  cancelWorkflowRunsForCustomer = workflowFns.cancelWorkflowRunsForCustomer;
}

// Export an instance of DatabaseStorage for use in the application
export const storage = new DatabaseStorage();
