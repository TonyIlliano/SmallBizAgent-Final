import {
  User, InsertUser, users,
  Business, InsertBusiness, businesses,
  BusinessHours, InsertBusinessHours, businessHours,
  Service, InsertService, services,
  Customer, InsertCustomer, customers,
  Staff, InsertStaff, staff,
  StaffHours, InsertStaffHours, staffHours,
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
  StaffInvite, InsertStaffInvite, staffInvites,
  BusinessKnowledge, InsertBusinessKnowledge, businessKnowledge,
  UnansweredQuestion, InsertUnansweredQuestion, unansweredQuestions,
  WebsiteScrapeCache, InsertWebsiteScrapeCache, websiteScrapeCache
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { eq, and, or, desc, ilike, sql, gte, lte } from "drizzle-orm";
import { db, pool } from "./db";

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
  deleteService(id: number): Promise<void>;
  
  // Customers
  getCustomers(businessId: number): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByPhone(phone: string, businessId: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;
  
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

  // Appointments
  getAppointments(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    customerId?: number,
    staffId?: number
  }): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
  getAppointmentsByBusinessId(businessId: number): Promise<Appointment[]>;
  getAppointmentsByCustomerId(customerId: number): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, appointment: Partial<Appointment>): Promise<Appointment>;
  deleteAppointment(id: number): Promise<void>;

  // Jobs
  getJobs(businessId: number, params?: {
    status?: string,
    customerId?: number,
    staffId?: number
  }): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, job: Partial<Job>): Promise<Job>;
  deleteJob(id: number): Promise<void>;

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
  deleteInvoice(id: number): Promise<void>;
  
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
  deleteQuote(id: number): Promise<void>;
  
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
  deleteBusinessKnowledge(id: number): Promise<void>;
  deleteBusinessKnowledgeBySource(businessId: number, source: string): Promise<void>;

  // Unanswered Questions
  getUnansweredQuestions(businessId: number, params?: { status?: string }): Promise<UnansweredQuestion[]>;
  getUnansweredQuestion(id: number): Promise<UnansweredQuestion | undefined>;
  createUnansweredQuestion(question: InsertUnansweredQuestion): Promise<UnansweredQuestion>;
  updateUnansweredQuestion(id: number, data: Partial<UnansweredQuestion>): Promise<UnansweredQuestion>;
  deleteUnansweredQuestion(id: number): Promise<void>;
  getUnansweredQuestionCount(businessId: number): Promise<number>;

  // Website Scrape Cache
  getWebsiteScrapeCache(businessId: number): Promise<WebsiteScrapeCache | undefined>;
  upsertWebsiteScrapeCache(businessId: number, data: Partial<InsertWebsiteScrapeCache>): Promise<WebsiteScrapeCache>;
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
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
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
    const [updatedUser] = await db.update(users)
      .set({
        ...user,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
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
    return db.select().from(businesses);
  }
  
  async getBusiness(id: number): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id));
    return business;
  }

  async createBusiness(business: InsertBusiness): Promise<Business> {
    const [newBusiness] = await db.insert(businesses).values({
      ...business,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return newBusiness;
  }

  async updateBusiness(id: number, business: Partial<Business>): Promise<Business> {
    const [updatedBusiness] = await db.update(businesses)
      .set({
        ...business,
        updatedAt: new Date()
      })
      .where(eq(businesses.id, id))
      .returning();
    return updatedBusiness;
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

    // Search for business with any of the phone variants
    const [business] = await db.select().from(businesses)
      .where(
        or(
          ...phoneVariants.map(p => eq(businesses.twilioPhoneNumber, p))
        )
      );
    return business;
  }

  async getBusinessByBookingSlug(slug: string): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses)
      .where(eq(businesses.bookingSlug, slug.toLowerCase()));
    return business;
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

  async deleteService(id: number): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
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

  async deleteCustomer(id: number): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id));
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

  async deleteAppointment(id: number): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  // Helper methods for Vapi integration
  async getAppointmentsByBusinessId(businessId: number): Promise<Appointment[]> {
    return db.select().from(appointments)
      .where(eq(appointments.businessId, businessId));
  }

  async getAppointmentsByCustomerId(customerId: number): Promise<Appointment[]> {
    return db.select().from(appointments)
      .where(eq(appointments.customerId, customerId));
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

  async deleteJob(id: number): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
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
      .orderBy(desc(invoices.createdAt));

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

  async deleteInvoice(id: number): Promise<void> {
    await db.delete(invoices).where(eq(invoices.id, id));
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

    if (params?.status) {
      conditions.push(eq(callLogs.status, params.status));
    }

    if (params?.isEmergency !== undefined) {
      conditions.push(eq(callLogs.isEmergency, params.isEmergency));
    }

    return db.select().from(callLogs).where(and(...conditions));
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

  async deleteQuote(id: number): Promise<void> {
    // First delete all quote items
    await this.deleteQuoteItems(id);
    // Then delete the quote
    await db.delete(quotes).where(eq(quotes.id, id));
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
    const [updated] = await db.update(businesses)
      .set({ ...tokens, updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
      .returning();
    return updated;
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
    const [updated] = await db.update(businesses)
      .set({ ...tokens, updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
      .returning();
    return updated;
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

  async deleteBusinessKnowledge(id: number): Promise<void> {
    await db.delete(businessKnowledge).where(eq(businessKnowledge.id, id));
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

  async deleteUnansweredQuestion(id: number): Promise<void> {
    await db.delete(unansweredQuestions).where(eq(unansweredQuestions.id, id));
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
}

// Export an instance of DatabaseStorage for use in the application
export const storage = new DatabaseStorage();