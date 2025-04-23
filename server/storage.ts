import {
  User, InsertUser, users,
  Business, InsertBusiness, businesses,
  BusinessHours, InsertBusinessHours, businessHours,
  Service, InsertService, services,
  Customer, InsertCustomer, customers,
  Staff, InsertStaff, staff,
  Appointment, InsertAppointment, appointments,
  Job, InsertJob, jobs,
  Invoice, InsertInvoice, invoices,
  InvoiceItem, InsertInvoiceItem, invoiceItems,
  ReceptionistConfig, InsertReceptionistConfig, receptionistConfig,
  CallLog, InsertCallLog, callLogs,
  Quote, InsertQuote, quotes,
  QuoteItem, InsertQuoteItem, quoteItems
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { eq, and, or, desc, ilike, sql } from "drizzle-orm";
import { db, pool } from "./db";

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
  createStaffMember(staff: InsertStaff): Promise<Staff>;
  updateStaffMember(id: number, staff: Partial<Staff>): Promise<Staff>;
  deleteStaffMember(id: number): Promise<void>;
  
  // Appointments
  getAppointments(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    customerId?: number,
    staffId?: number
  }): Promise<Appointment[]>;
  getAppointment(id: number): Promise<Appointment | undefined>;
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
  
  // Invoices
  getInvoices(businessId: number, params?: {
    status?: string,
    customerId?: number
  }): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
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
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: number, quote: Partial<Quote>): Promise<Quote>;
  updateQuoteStatus(id: number, status: string): Promise<Quote>;
  deleteQuote(id: number): Promise<void>;
  
  // Quote Items
  getQuoteItems(quoteId: number): Promise<QuoteItem[]>;
  createQuoteItem(item: InsertQuoteItem): Promise<QuoteItem>;
  deleteQuoteItems(quoteId: number): Promise<void>;
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
    const [user] = await db.select().from(users).where(eq(users.username, username));
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
    const [customer] = await db.select().from(customers)
      .where(and(
        eq(customers.phone, phone),
        eq(customers.businessId, businessId)
      ));
    return customer;
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

  // Appointments
  async getAppointments(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    customerId?: number,
    staffId?: number
  }): Promise<Appointment[]> {
    let query = db.select().from(appointments)
      .where(eq(appointments.businessId, businessId));
    
    if (params?.customerId) {
      query = query.where(eq(appointments.customerId, params.customerId));
    }
    
    if (params?.staffId) {
      query = query.where(eq(appointments.staffId, params.staffId));
    }
    
    return query;
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

  // Jobs
  async getJobs(businessId: number, params?: {
    status?: string,
    customerId?: number,
    staffId?: number
  }): Promise<Job[]> {
    let query = db.select().from(jobs)
      .where(eq(jobs.businessId, businessId));
    
    if (params?.status) {
      query = query.where(eq(jobs.status, params.status));
    }
    
    if (params?.customerId) {
      query = query.where(eq(jobs.customerId, params.customerId));
    }
    
    return query;
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

  // Invoices
  async getInvoices(businessId: number, params?: {
    status?: string,
    customerId?: number
  }): Promise<Invoice[]> {
    let query = db.select().from(invoices)
      .where(eq(invoices.businessId, businessId));
    
    if (params?.status) {
      query = query.where(eq(invoices.status, params.status));
    }
    
    if (params?.customerId) {
      query = query.where(eq(invoices.customerId, params.customerId));
    }
    
    return query;
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
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
    let query = db.select().from(callLogs)
      .where(eq(callLogs.businessId, businessId));
    
    if (params?.status) {
      query = query.where(eq(callLogs.status, params.status));
    }
    
    if (params?.isEmergency !== undefined) {
      query = query.where(eq(callLogs.isEmergency, params.isEmergency));
    }
    
    return query;
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
    // Start with a base query
    let query = db.select({
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
    .where(eq(quotes.businessId, businessId));
    
    // Apply filters
    if (filters?.status) {
      query = query.where(eq(quotes.status, filters.status));
    }
    
    if (filters?.customerId) {
      query = query.where(eq(quotes.customerId, filters.customerId));
    }
    
    if (filters?.jobId) {
      query = query.where(eq(quotes.jobId, filters.jobId));
    }
    
    if (filters?.fromDate) {
      query = query.where(db.sql`${quotes.createdAt} >= ${filters.fromDate}`);
    }
    
    if (filters?.toDate) {
      query = query.where(db.sql`${quotes.createdAt} <= ${filters.toDate}`);
    }
    
    if (filters?.search) {
      query = query.where(
        or(
          ilike(quotes.quoteNumber, `%${filters.search}%`),
          ilike(customers.firstName, `%${filters.search}%`),
          ilike(customers.lastName, `%${filters.search}%`),
          ilike(customers.email, `%${filters.search}%`),
          ilike(customers.phone, `%${filters.search}%`),
          ilike(jobs.title, `%${filters.search}%`)
        )
      );
    }
    
    // Order by most recent first
    query = query.orderBy(desc(quotes.createdAt));
    
    // Execute the query
    const results = await query;
    
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
    if (quote.validUntil instanceof Date) {
      quoteData.validUntil = quote.validUntil.toISOString();
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
}

// Export an instance of DatabaseStorage for use in the application
export const storage = new DatabaseStorage();