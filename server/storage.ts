import {
  User, InsertUser,
  Business, InsertBusiness,
  BusinessHours, InsertBusinessHours,
  Service, InsertService,
  Customer, InsertCustomer,
  Staff, InsertStaff,
  Appointment, InsertAppointment,
  Job, InsertJob,
  Invoice, InsertInvoice,
  InvoiceItem, InsertInvoiceItem,
  ReceptionistConfig, InsertReceptionistConfig,
  CallLog, InsertCallLog
} from "@shared/schema";
import session from "express-session";
import memoryStoreFactory from "memorystore";

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
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  sessionStore: session.Store;
  
  private users: Map<number, User>;
  private businesses: Map<number, Business>;
  private businessHours: Map<number, BusinessHours>;
  private services: Map<number, Service>;
  private customers: Map<number, Customer>;
  private staff: Map<number, Staff>;
  private appointments: Map<number, Appointment>;
  private jobs: Map<number, Job>;
  private invoices: Map<number, Invoice>;
  private invoiceItems: Map<number, InvoiceItem>;
  private receptionistConfigs: Map<number, ReceptionistConfig>;
  private callLogs: Map<number, CallLog>;
  
  // Auto-increment IDs
  private userId = 1;
  private businessId = 1;
  private businessHoursId = 1;
  private serviceId = 1;
  private customerId = 1;
  private staffId = 1;
  private appointmentId = 1;
  private jobId = 1;
  private invoiceId = 1;
  private invoiceItemId = 1;
  private receptionistConfigId = 1;
  private callLogId = 1;
  
  constructor() {
    // Create a memory store for sessions
    const MemoryStore = memoryStoreFactory(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // Prune expired entries every 24h
    });
    
    this.users = new Map();
    this.businesses = new Map();
    this.businessHours = new Map();
    this.services = new Map();
    this.customers = new Map();
    this.staff = new Map();
    this.appointments = new Map();
    this.jobs = new Map();
    this.invoices = new Map();
    this.invoiceItems = new Map();
    this.receptionistConfigs = new Map();
    this.callLogs = new Map();
    
    // Add demo data
    this.initializeDemoData();
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values())
      .find(user => user.username.toLowerCase() === username.toLowerCase());
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values())
      .find(user => user.email.toLowerCase() === email.toLowerCase());
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = this.userId++;
    const newUser: User = {
      ...user,
      id,
      role: user.role ?? null,
      businessId: user.businessId ?? null,
      active: user.active ?? null,
      lastLogin: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, newUser);
    return newUser;
  }

  async updateUser(id: number, user: Partial<User>): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    const updated: User = {
      ...existing,
      ...user,
      updatedAt: new Date()
    };
    this.users.set(id, updated);
    return updated;
  }

  async updateUserLastLogin(id: number): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    const updated: User = {
      ...existing,
      lastLogin: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, updated);
    return updated;
  }

  // Businesses
  async getBusiness(id: number): Promise<Business | undefined> {
    return this.businesses.get(id);
  }

  async createBusiness(business: InsertBusiness): Promise<Business> {
    const id = this.businessId++;
    const newBusiness: Business = { 
      ...business, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.businesses.set(id, newBusiness);
    return newBusiness;
  }

  async updateBusiness(id: number, business: Partial<Business>): Promise<Business> {
    const existing = this.businesses.get(id);
    if (!existing) {
      throw new Error(`Business with ID ${id} not found`);
    }
    
    const updated: Business = { 
      ...existing, 
      ...business, 
      updatedAt: new Date() 
    };
    this.businesses.set(id, updated);
    return updated;
  }

  // Business Hours
  async getBusinessHours(businessId: number): Promise<BusinessHours[]> {
    return Array.from(this.businessHours.values())
      .filter(hours => hours.businessId === businessId);
  }

  async createBusinessHours(hours: InsertBusinessHours): Promise<BusinessHours> {
    const id = this.businessHoursId++;
    const newHours: BusinessHours = { ...hours, id };
    this.businessHours.set(id, newHours);
    return newHours;
  }

  async updateBusinessHours(id: number, hours: Partial<BusinessHours>): Promise<BusinessHours> {
    const existing = this.businessHours.get(id);
    if (!existing) {
      throw new Error(`Business hours with ID ${id} not found`);
    }
    
    const updated: BusinessHours = { ...existing, ...hours };
    this.businessHours.set(id, updated);
    return updated;
  }

  // Services
  async getServices(businessId: number): Promise<Service[]> {
    return Array.from(this.services.values())
      .filter(service => service.businessId === businessId);
  }

  async getService(id: number): Promise<Service | undefined> {
    return this.services.get(id);
  }

  async createService(service: InsertService): Promise<Service> {
    const id = this.serviceId++;
    const newService: Service = { ...service, id };
    this.services.set(id, newService);
    return newService;
  }

  async updateService(id: number, service: Partial<Service>): Promise<Service> {
    const existing = this.services.get(id);
    if (!existing) {
      throw new Error(`Service with ID ${id} not found`);
    }
    
    const updated: Service = { ...existing, ...service };
    this.services.set(id, updated);
    return updated;
  }

  async deleteService(id: number): Promise<void> {
    if (!this.services.has(id)) {
      throw new Error(`Service with ID ${id} not found`);
    }
    this.services.delete(id);
  }

  // Customers
  async getCustomers(businessId: number): Promise<Customer[]> {
    return Array.from(this.customers.values())
      .filter(customer => customer.businessId === businessId);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async getCustomerByPhone(phone: string, businessId: number): Promise<Customer | undefined> {
    return Array.from(this.customers.values())
      .find(customer => customer.phone === phone && customer.businessId === businessId);
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const id = this.customerId++;
    const newCustomer: Customer = { 
      ...customer, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.customers.set(id, newCustomer);
    return newCustomer;
  }

  async updateCustomer(id: number, customer: Partial<Customer>): Promise<Customer> {
    const existing = this.customers.get(id);
    if (!existing) {
      throw new Error(`Customer with ID ${id} not found`);
    }
    
    const updated: Customer = { 
      ...existing, 
      ...customer, 
      updatedAt: new Date() 
    };
    this.customers.set(id, updated);
    return updated;
  }

  async deleteCustomer(id: number): Promise<void> {
    if (!this.customers.has(id)) {
      throw new Error(`Customer with ID ${id} not found`);
    }
    this.customers.delete(id);
  }

  // Staff
  async getStaff(businessId: number): Promise<Staff[]> {
    return Array.from(this.staff.values())
      .filter(member => member.businessId === businessId);
  }

  async getStaffMember(id: number): Promise<Staff | undefined> {
    return this.staff.get(id);
  }

  async createStaffMember(staff: InsertStaff): Promise<Staff> {
    const id = this.staffId++;
    const newStaffMember: Staff = { 
      ...staff, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.staff.set(id, newStaffMember);
    return newStaffMember;
  }

  async updateStaffMember(id: number, staff: Partial<Staff>): Promise<Staff> {
    const existing = this.staff.get(id);
    if (!existing) {
      throw new Error(`Staff member with ID ${id} not found`);
    }
    
    const updated: Staff = { 
      ...existing, 
      ...staff, 
      updatedAt: new Date() 
    };
    this.staff.set(id, updated);
    return updated;
  }

  async deleteStaffMember(id: number): Promise<void> {
    if (!this.staff.has(id)) {
      throw new Error(`Staff member with ID ${id} not found`);
    }
    this.staff.delete(id);
  }

  // Appointments
  async getAppointments(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    customerId?: number,
    staffId?: number
  }): Promise<Appointment[]> {
    let appointments = Array.from(this.appointments.values())
      .filter(appointment => appointment.businessId === businessId);
    
    if (params) {
      if (params.startDate) {
        appointments = appointments.filter(a => 
          new Date(a.startDate) >= new Date(params.startDate as Date)
        );
      }
      
      if (params.endDate) {
        appointments = appointments.filter(a => 
          new Date(a.startDate) <= new Date(params.endDate as Date)
        );
      }
      
      if (params.customerId) {
        appointments = appointments.filter(a => 
          a.customerId === params.customerId
        );
      }
      
      if (params.staffId) {
        appointments = appointments.filter(a => 
          a.staffId === params.staffId
        );
      }
    }
    
    return appointments;
  }

  async getAppointment(id: number): Promise<Appointment | undefined> {
    return this.appointments.get(id);
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const id = this.appointmentId++;
    const newAppointment: Appointment = { 
      ...appointment, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.appointments.set(id, newAppointment);
    return newAppointment;
  }

  async updateAppointment(id: number, appointment: Partial<Appointment>): Promise<Appointment> {
    const existing = this.appointments.get(id);
    if (!existing) {
      throw new Error(`Appointment with ID ${id} not found`);
    }
    
    const updated: Appointment = { 
      ...existing, 
      ...appointment, 
      updatedAt: new Date() 
    };
    this.appointments.set(id, updated);
    return updated;
  }

  async deleteAppointment(id: number): Promise<void> {
    if (!this.appointments.has(id)) {
      throw new Error(`Appointment with ID ${id} not found`);
    }
    this.appointments.delete(id);
  }

  // Jobs
  async getJobs(businessId: number, params?: {
    status?: string,
    customerId?: number,
    staffId?: number
  }): Promise<Job[]> {
    let jobs = Array.from(this.jobs.values())
      .filter(job => job.businessId === businessId);
    
    if (params) {
      if (params.status) {
        jobs = jobs.filter(j => j.status === params.status);
      }
      
      if (params.customerId) {
        jobs = jobs.filter(j => j.customerId === params.customerId);
      }
      
      if (params.staffId) {
        jobs = jobs.filter(j => j.staffId === params.staffId);
      }
    }
    
    return jobs;
  }

  async getJob(id: number): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async createJob(job: InsertJob): Promise<Job> {
    const id = this.jobId++;
    const newJob: Job = { 
      ...job, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.jobs.set(id, newJob);
    return newJob;
  }

  async updateJob(id: number, job: Partial<Job>): Promise<Job> {
    const existing = this.jobs.get(id);
    if (!existing) {
      throw new Error(`Job with ID ${id} not found`);
    }
    
    const updated: Job = { 
      ...existing, 
      ...job, 
      updatedAt: new Date() 
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async deleteJob(id: number): Promise<void> {
    if (!this.jobs.has(id)) {
      throw new Error(`Job with ID ${id} not found`);
    }
    this.jobs.delete(id);
  }

  // Invoices
  async getInvoices(businessId: number, params?: {
    status?: string,
    customerId?: number
  }): Promise<Invoice[]> {
    let invoices = Array.from(this.invoices.values())
      .filter(invoice => invoice.businessId === businessId);
    
    if (params) {
      if (params.status) {
        invoices = invoices.filter(i => i.status === params.status);
      }
      
      if (params.customerId) {
        invoices = invoices.filter(i => i.customerId === params.customerId);
      }
    }
    
    return invoices;
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    return this.invoices.get(id);
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const id = this.invoiceId++;
    const newInvoice: Invoice = { 
      ...invoice, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.invoices.set(id, newInvoice);
    return newInvoice;
  }

  async updateInvoice(id: number, invoice: Partial<Invoice>): Promise<Invoice> {
    const existing = this.invoices.get(id);
    if (!existing) {
      throw new Error(`Invoice with ID ${id} not found`);
    }
    
    const updated: Invoice = { 
      ...existing, 
      ...invoice, 
      updatedAt: new Date() 
    };
    this.invoices.set(id, updated);
    return updated;
  }

  async deleteInvoice(id: number): Promise<void> {
    if (!this.invoices.has(id)) {
      throw new Error(`Invoice with ID ${id} not found`);
    }
    this.invoices.delete(id);
  }

  // Invoice Items
  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return Array.from(this.invoiceItems.values())
      .filter(item => item.invoiceId === invoiceId);
  }

  async createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem> {
    const id = this.invoiceItemId++;
    const newItem: InvoiceItem = { ...item, id };
    this.invoiceItems.set(id, newItem);
    return newItem;
  }

  async updateInvoiceItem(id: number, item: Partial<InvoiceItem>): Promise<InvoiceItem> {
    const existing = this.invoiceItems.get(id);
    if (!existing) {
      throw new Error(`Invoice item with ID ${id} not found`);
    }
    
    const updated: InvoiceItem = { ...existing, ...item };
    this.invoiceItems.set(id, updated);
    return updated;
  }

  async deleteInvoiceItem(id: number): Promise<void> {
    if (!this.invoiceItems.has(id)) {
      throw new Error(`Invoice item with ID ${id} not found`);
    }
    this.invoiceItems.delete(id);
  }

  // Virtual Receptionist Configuration
  async getReceptionistConfig(businessId: number): Promise<ReceptionistConfig | undefined> {
    return Array.from(this.receptionistConfigs.values())
      .find(config => config.businessId === businessId);
  }

  async createReceptionistConfig(config: InsertReceptionistConfig): Promise<ReceptionistConfig> {
    const id = this.receptionistConfigId++;
    const newConfig: ReceptionistConfig = { 
      ...config, 
      id, 
      updatedAt: new Date() 
    };
    this.receptionistConfigs.set(id, newConfig);
    return newConfig;
  }

  async updateReceptionistConfig(id: number, config: Partial<ReceptionistConfig>): Promise<ReceptionistConfig> {
    const existing = this.receptionistConfigs.get(id);
    if (!existing) {
      throw new Error(`Receptionist config with ID ${id} not found`);
    }
    
    const updated: ReceptionistConfig = { 
      ...existing, 
      ...config, 
      updatedAt: new Date() 
    };
    this.receptionistConfigs.set(id, updated);
    return updated;
  }

  // Call Logs
  async getCallLogs(businessId: number, params?: {
    startDate?: Date,
    endDate?: Date,
    isEmergency?: boolean,
    status?: string
  }): Promise<CallLog[]> {
    let logs = Array.from(this.callLogs.values())
      .filter(log => log.businessId === businessId);
    
    if (params) {
      if (params.startDate) {
        logs = logs.filter(l => 
          new Date(l.callTime) >= new Date(params.startDate as Date)
        );
      }
      
      if (params.endDate) {
        logs = logs.filter(l => 
          new Date(l.callTime) <= new Date(params.endDate as Date)
        );
      }
      
      if (params.isEmergency !== undefined) {
        logs = logs.filter(l => l.isEmergency === params.isEmergency);
      }
      
      if (params.status) {
        logs = logs.filter(l => l.status === params.status);
      }
    }
    
    return logs;
  }

  async getCallLog(id: number): Promise<CallLog | undefined> {
    return this.callLogs.get(id);
  }

  async createCallLog(log: InsertCallLog): Promise<CallLog> {
    const id = this.callLogId++;
    const newLog: CallLog = { ...log, id };
    this.callLogs.set(id, newLog);
    return newLog;
  }

  async updateCallLog(id: number, log: Partial<CallLog>): Promise<CallLog> {
    const existing = this.callLogs.get(id);
    if (!existing) {
      throw new Error(`Call log with ID ${id} not found`);
    }
    
    const updated: CallLog = { ...existing, ...log };
    this.callLogs.set(id, updated);
    return updated;
  }

  // Demo data initialization
  private initializeDemoData() {
    // Create a demo user with hashed password (admin123)
    const user: User = {
      id: this.userId++,
      username: "admin",
      email: "admin@example.com",
      password: "$2a$10$vQH7YgdLfGVJfDHYNVgId.XGEnYbrJ6rxVI1Bbc03iVStsxIreccS", // hashed "admin123"
      role: "admin",
      businessId: 1,
      active: true,
      lastLogin: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    
    // Create a sample business
    const business: Business = {
      id: this.businessId++,
      name: "Precision Auto Repair",
      address: "123 Main St",
      city: "Anytown",
      state: "CA",
      zip: "12345",
      phone: "555-123-4567",
      email: "info@precisionauto.example",
      website: "https://precisionauto.example",
      logoUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.businesses.set(business.id, business);

    // Business hours
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    days.forEach(day => {
      const hours: BusinessHours = {
        id: this.businessHoursId++,
        businessId: business.id,
        day,
        open: day !== "sunday" ? (day === "saturday" ? "10:00" : "09:00") : null,
        close: day !== "sunday" ? (day === "saturday" ? "15:00" : "17:00") : null,
        isClosed: day === "sunday"
      };
      this.businessHours.set(hours.id, hours);
    });

    // Services
    const services = [
      { name: "Oil Change", description: "Regular oil change service", price: 49.95, duration: 30 },
      { name: "Brake Replacement", description: "Front or rear brake replacement", price: 299.95, duration: 120 },
      { name: "A/C Repair", description: "Air conditioning system repair", price: 249.95, duration: 180 },
      { name: "Tire Rotation", description: "Rotate and balance tires", price: 59.95, duration: 45 }
    ];
    
    services.forEach(svc => {
      const service: Service = {
        id: this.serviceId++,
        businessId: business.id,
        name: svc.name,
        description: svc.description,
        price: svc.price,
        duration: svc.duration,
        active: true
      };
      this.services.set(service.id, service);
    });

    // Staff
    const staffMembers = [
      { firstName: "Mike", lastName: "Thompson", role: "Senior Technician" },
      { firstName: "Sarah", lastName: "King", role: "Technician" },
      { firstName: "Alex", lastName: "Rodriguez", role: "Junior Technician" }
    ];
    
    staffMembers.forEach(member => {
      const staff: Staff = {
        id: this.staffId++,
        businessId: business.id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: `${member.firstName.toLowerCase()}@precisionauto.example`,
        phone: "555-123-4567",
        role: member.role,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.staff.set(staff.id, staff);
    });

    // Customers
    const customers = [
      { firstName: "James", lastName: "Wilson", phone: "555-111-2222", vehicle: "Toyota Camry" },
      { firstName: "Robert", lastName: "Johnson", phone: "555-222-3333", vehicle: "Honda Accord" },
      { firstName: "Susan", lastName: "Miller", phone: "555-333-4444", vehicle: "Ford Escape" },
      { firstName: "Michael", lastName: "Brown", phone: "555-444-5555", vehicle: "Chevy Malibu" }
    ];
    
    customers.forEach(c => {
      const customer: Customer = {
        id: this.customerId++,
        businessId: business.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: `${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@example.com`,
        phone: c.phone,
        address: "456 Oak St",
        city: "Anytown",
        state: "CA",
        zip: "12345",
        notes: `Customer drives a ${c.vehicle}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.customers.set(customer.id, customer);
    });

    // Today's date and appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Appointments
    const appointments = [
      { 
        customer: 1, 
        service: 1, 
        staff: 3, 
        startTime: new Date(today.getTime() + 8.5 * 60 * 60 * 1000), // 8:30 AM
        status: "confirmed" 
      },
      { 
        customer: 2, 
        service: 2, 
        staff: 1, 
        startTime: new Date(today.getTime() + 10 * 60 * 60 * 1000), // 10:00 AM
        status: "confirmed" 
      },
      { 
        customer: 3, 
        service: 3, 
        staff: 2, 
        startTime: new Date(today.getTime() + 13.5 * 60 * 60 * 1000), // 1:30 PM
        status: "pending" 
      },
      { 
        customer: 4, 
        service: 4, 
        staff: 1, 
        startTime: new Date(today.getTime() + 15.75 * 60 * 60 * 1000), // 3:45 PM
        status: "confirmed" 
      }
    ];
    
    appointments.forEach(a => {
      const service = this.services.get(a.service);
      const endTime = new Date(a.startTime.getTime() + (service?.duration || 60) * 60 * 1000);
      
      const appointment: Appointment = {
        id: this.appointmentId++,
        businessId: business.id,
        customerId: a.customer,
        staffId: a.staff,
        serviceId: a.service,
        startDate: a.startTime,
        endDate: endTime,
        status: a.status,
        notes: null,
        createdAt: new Date(today.getTime() - 24 * 60 * 60 * 1000), // yesterday
        updatedAt: new Date(today.getTime() - 24 * 60 * 60 * 1000)
      };
      this.appointments.set(appointment.id, appointment);
    });

    // Jobs
    const jobs = [
      { 
        customer: 1, 
        staff: 3, 
        title: "Oil Change + Inspection", 
        status: "in_progress", 
        estimatedCompletion: new Date(today.getTime() + 9.5 * 60 * 60 * 1000) // 9:30 AM
      },
      { 
        customer: 2, 
        staff: 1, 
        title: "Brake Replacement", 
        status: "in_progress", 
        estimatedCompletion: new Date(today.getTime() + 11.5 * 60 * 60 * 1000) // 11:30 AM 
      },
      { 
        customer: 3, 
        staff: 2, 
        title: "A/C System Repair", 
        status: "waiting_parts", 
        estimatedCompletion: new Date(today.getTime() + 15 * 60 * 60 * 1000) // 3:00 PM
      }
    ];
    
    jobs.forEach((j, index) => {
      const job: Job = {
        id: this.jobId++,
        businessId: business.id,
        customerId: j.customer,
        appointmentId: index + 1,
        staffId: j.staff,
        title: j.title,
        description: `Job #${7829 + index}`,
        scheduledDate: today,
        status: j.status,
        estimatedCompletion: j.estimatedCompletion,
        notes: null,
        createdAt: new Date(today.getTime() - 24 * 60 * 60 * 1000), // yesterday
        updatedAt: new Date(today.getTime() - 24 * 60 * 60 * 1000)
      };
      this.jobs.set(job.id, job);
    });

    // Invoices
    const invoices = [
      { customer: 1, job: 1, amount: 89.95, status: "paid", invoiceNumber: "INV-2023-078" },
      { customer: 3, job: 3, amount: 325.00, status: "pending", invoiceNumber: "INV-2023-077" },
      { customer: 4, job: null, amount: 65.00, status: "paid", invoiceNumber: "INV-2023-076" }
    ];
    
    invoices.forEach(inv => {
      const invoice: Invoice = {
        id: this.invoiceId++,
        businessId: business.id,
        customerId: inv.customer,
        jobId: inv.job,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        tax: inv.amount * 0.08,
        total: inv.amount * 1.08,
        dueDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days from today
        status: inv.status,
        stripePaymentIntentId: inv.status === "paid" ? `pi_${Math.random().toString(36).substring(2, 15)}` : null,
        createdAt: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        updatedAt: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)
      };
      this.invoices.set(invoice.id, invoice);
    });

    // Invoice items
    invoices.forEach((inv, index) => {
      const item: InvoiceItem = {
        id: this.invoiceItemId++,
        invoiceId: index + 1,
        description: inv.job ? this.jobs.get(inv.job)?.title || "Service" : "Tire Rotation",
        quantity: 1,
        unitPrice: inv.amount,
        amount: inv.amount
      };
      this.invoiceItems.set(item.id, item);
    });

    // Receptionist config
    const receptionistConfig: ReceptionistConfig = {
      id: this.receptionistConfigId++,
      businessId: business.id,
      greeting: "Thank you for calling Precision Auto Repair. How may I help you today?",
      afterHoursMessage: "I'm sorry, our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff. Otherwise, I'd be happy to schedule an appointment for you.",
      emergencyKeywords: ["emergency", "urgent", "immediately", "critical", "asap"],
      voicemailEnabled: true,
      callRecordingEnabled: false,
      transcriptionEnabled: true,
      maxCallLengthMinutes: 15,
      transferPhoneNumbers: ["555-555-5555"],
      updatedAt: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    };
    this.receptionistConfigs.set(receptionistConfig.id, receptionistConfig);

    // Call logs
    const callLogs = [
      { 
        callerId: "555-123-4567", 
        transcript: "Appointment Scheduled - Brake service requested for tomorrow", 
        intentDetected: "appointment", 
        status: "answered",
        time: new Date(today.getTime() - 0.1 * 24 * 60 * 60 * 1000) // today, 8:45 AM
      },
      { 
        callerId: "555-987-6543", 
        transcript: "Inquiry - Asked about availability for AC service next week", 
        intentDetected: "inquiry", 
        status: "answered",
        time: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000) // yesterday, 2:30 PM
      },
      { 
        callerId: "555-789-0123", 
        transcript: "Missed Call - No message left", 
        intentDetected: "unknown", 
        status: "missed",
        time: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000) // yesterday, 9:15 AM
      }
    ];
    
    callLogs.forEach(log => {
      const callLog: CallLog = {
        id: this.callLogId++,
        businessId: business.id,
        callerId: log.callerId,
        callerName: null,
        transcript: log.transcript,
        intentDetected: log.intentDetected,
        isEmergency: false,
        callDuration: Math.floor(Math.random() * 300) + 30, // 30-330 seconds
        recordingUrl: null,
        status: log.status,
        callTime: log.time
      };
      this.callLogs.set(callLog.id, callLog);
    });
  }
}

export const storage = new MemStorage();
