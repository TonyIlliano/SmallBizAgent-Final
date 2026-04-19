import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import crypto from 'crypto';
import supertest from 'supertest';

// ────────────────────────────────────────────────────────
// Module mocks — must be declared before any app imports
// ────────────────────────────────────────────────────────

const { mockStorage } = vi.hoisted(() => {
  return {
    mockStorage: {
      // Auth methods (needed for passport)
      getUserByUsername: vi.fn(),
      getUserByEmail: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      getUser: vi.fn(),
      updateUserLastLogin: vi.fn(),
      hasBusinessAccess: vi.fn(),

      // Business methods
      createBusiness: vi.fn(),
      getBusiness: vi.fn(),
      updateBusiness: vi.fn(),
      getAllBusinesses: vi.fn(),
      getBusinessByTwilioPhoneNumber: vi.fn(),
      getBusinessByBookingSlug: vi.fn(),

      // Business hours methods
      getBusinessHours: vi.fn(),
      createBusinessHours: vi.fn(),
      updateBusinessHours: vi.fn(),

      // Service methods
      getServices: vi.fn(),
      getService: vi.fn(),
      createService: vi.fn(),
      updateService: vi.fn(),
      deleteService: vi.fn(),

      // Customer methods
      getCustomers: vi.fn(),
      getCustomer: vi.fn(),
      createCustomer: vi.fn(),
      updateCustomer: vi.fn(),
      deleteCustomer: vi.fn(),
      getCustomerByPhone: vi.fn(),

      // Staff (needed by setup-status)
      getStaff: vi.fn(),
      getStaffMember: vi.fn(),
      getStaffMemberByUserId: vi.fn(),
      createStaffMember: vi.fn(),
      updateStaffMember: vi.fn(),
      deleteStaffMember: vi.fn(),
      getStaffHours: vi.fn(),
      getStaffHoursByDay: vi.fn(),
      setStaffHours: vi.fn(),
      updateStaffHoursForDay: vi.fn(),
      getAvailableStaffForSlot: vi.fn(),
      getStaffServices: vi.fn(),
      getServiceStaff: vi.fn(),
      setStaffServices: vi.fn(),
      getStaffServicesForBusiness: vi.fn(),
      getStaffInvitesByBusiness: vi.fn(),
      createStaffInvite: vi.fn(),
      getStaffInviteByCode: vi.fn(),
      updateStaffInvite: vi.fn(),

      // Appointments
      getAppointments: vi.fn(),
      getAppointment: vi.fn(),
      getAppointmentsByBusinessId: vi.fn(),
      getUpcomingAppointmentsByBusinessId: vi.fn(),
      createAppointment: vi.fn(),
      updateAppointment: vi.fn(),
      deleteAppointment: vi.fn(),

      // Jobs
      getJobs: vi.fn(),
      getJob: vi.fn(),
      createJob: vi.fn(),
      updateJob: vi.fn(),

      // Invoices
      getInvoices: vi.fn(),
      getInvoice: vi.fn(),
      createInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      deleteInvoice: vi.fn(),
      getInvoiceItems: vi.fn(),
      createInvoiceItem: vi.fn(),
      deleteInvoiceItem: vi.fn(),
      getInvoiceByNumber: vi.fn(),
      getInvoicesWithAccessToken: vi.fn(),

      // Quotes
      getQuotes: vi.fn(),
      getQuote: vi.fn(),
      createQuote: vi.fn(),
      updateQuote: vi.fn(),

      // Receptionist config
      getReceptionistConfig: vi.fn(),
      createReceptionistConfig: vi.fn(),
      updateReceptionistConfig: vi.fn(),

      // Call logs
      getCallLogs: vi.fn(),
      getCallLog: vi.fn(),
      createCallLog: vi.fn(),
      updateCallLog: vi.fn(),

      // Knowledge base
      getBusinessKnowledge: vi.fn(),
      createBusinessKnowledge: vi.fn(),
      updateBusinessKnowledge: vi.fn(),
      deleteBusinessKnowledge: vi.fn(),
      getUnansweredQuestions: vi.fn(),
      deleteUnansweredQuestion: vi.fn(),
      updateUnansweredQuestion: vi.fn(),

      // Website scrape cache
      getWebsiteScrapeCache: vi.fn(),
      createWebsiteScrapeCache: vi.fn(),
      updateWebsiteScrapeCache: vi.fn(),

      // Agent settings
      getAgentSettings: vi.fn(),
      getAllAgentSettings: vi.fn(),
      upsertAgentSettings: vi.fn(),
      getAgentActivityLogs: vi.fn(),

      // Notification settings
      getNotificationSettings: vi.fn(),
      createNotificationSettings: vi.fn(),
      updateNotificationSettings: vi.fn(),

      // Notification log
      getNotificationLogs: vi.fn(),
      createNotificationLog: vi.fn(),

      // Review settings
      getReviewSettings: vi.fn(),
      createReviewSettings: vi.fn(),
      updateReviewSettings: vi.fn(),

      // SMS
      getSmsConversations: vi.fn(),
      getSmsConversation: vi.fn(),
      createSmsConversation: vi.fn(),
      updateSmsConversation: vi.fn(),

      // Password reset
      createPasswordResetToken: vi.fn(),
      getPasswordResetToken: vi.fn(),
      markPasswordResetTokenUsed: vi.fn(),

      // Phone numbers
      getBusinessPhoneNumbers: vi.fn(),
      createBusinessPhoneNumber: vi.fn(),
      deletePhoneNumber: vi.fn(),

      // Calendar integrations
      getCalendarIntegration: vi.fn(),
      getCalendarIntegrations: vi.fn(),
      createCalendarIntegration: vi.fn(),
      updateCalendarIntegration: vi.fn(),

      // Business groups
      getBusinessGroup: vi.fn(),

      // Misc
      getBusinessOwner: vi.fn(),
      getSmsSuppression: vi.fn(),
      checkSmsSuppression: vi.fn(),

      // AI suggestions
      getAiSuggestions: vi.fn(),
      updateAiSuggestion: vi.fn(),

      // Recurring schedules
      getRecurringSchedules: vi.fn(),

      // Call intelligence
      getCallIntelligence: vi.fn(),
      getCallIntelligenceByBusiness: vi.fn(),

      // Customer insights
      getCustomerInsights: vi.fn(),
      getHighRiskCustomers: vi.fn(),

      // Engagement lock
      acquireEngagementLock: vi.fn(),

      // Job line items
      getJobLineItems: vi.fn(),
      createJobLineItem: vi.fn(),
      updateJobLineItem: vi.fn(),
      deleteJobLineItem: vi.fn(),

      // Review requests
      getReviewRequests: vi.fn(),
      createReviewRequest: vi.fn(),

      // Review responses
      getReviewResponses: vi.fn(),

      // Quote items
      getQuoteItems: vi.fn(),

      // Quote follow ups
      getQuoteFollowUps: vi.fn(),

      // Restaurant reservations
      getRestaurantReservations: vi.fn(),

      // Inventory
      getInventoryItems: vi.fn(),

      // Webhooks
      getWebhooks: vi.fn(),

      // API keys
      getApiKeys: vi.fn(),

      sessionStore: null as any, // set in beforeAll
    },
  };
});

vi.mock('../storage', () => ({ storage: mockStorage }));

vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
  pool: {
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  },
}));

vi.mock('../emailService', () => ({
  sendVerificationCodeEmail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
  sendNewBusinessSignupNotification: vi.fn().mockResolvedValue(undefined),
}));

// ── Service mocks ──
vi.mock('../services/schedulerService', () => ({
  default: {
    startAllSchedulers: vi.fn(),
    stopAllSchedulers: vi.fn(),
    startReminderScheduler: vi.fn(),
  },
  startAllSchedulers: vi.fn(),
  stopAllSchedulers: vi.fn(),
  startReminderScheduler: vi.fn(),
}));

vi.mock('../services/reminderService', () => ({
  default: {
    startReminderScheduler: vi.fn(),
    stopReminderScheduler: vi.fn(),
  },
}));

vi.mock('../services/notificationService', () => ({
  default: {
    sendAppointmentReminder: vi.fn(),
    sendAppointmentConfirmation: vi.fn().mockResolvedValue(undefined),
    sendInvoiceCreatedNotification: vi.fn().mockResolvedValue(undefined),
    sendPaymentConfirmation: vi.fn().mockResolvedValue(undefined),
    sendInvoiceSentNotification: vi.fn().mockResolvedValue(undefined),
    sendJobCompletedNotification: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn(),
  },
}));

vi.mock('../services/vapiService', () => ({
  default: {
    createAssistant: vi.fn(),
    updateAssistant: vi.fn().mockResolvedValue({ success: true }),
    deleteAssistant: vi.fn(),
  },
  updateVapiAssistant: vi.fn(),
  deleteVapiAssistant: vi.fn(),
}));

vi.mock('../services/vapiWebhookHandler', () => ({
  default: vi.fn(),
  dataCache: {
    invalidate: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    cleanup: vi.fn(),
  },
}));

vi.mock('../services/vapiProvisioningService', () => ({
  default: {
    debouncedUpdateVapiAssistant: vi.fn(),
    provisionVapiPhoneNumber: vi.fn(),
  },
  debouncedUpdateVapiAssistant: vi.fn(),
}));

vi.mock('../services/businessProvisioningService', () => ({
  default: {
    provisionBusiness: vi.fn().mockResolvedValue({ success: true }),
    deprovisionBusiness: vi.fn(),
  },
  provisionBusiness: vi.fn().mockResolvedValue({ success: true }),
  deprovisionBusiness: vi.fn(),
}));

vi.mock('../services/twilioProvisioningService', () => ({
  default: {
    provisionPhoneNumber: vi.fn(),
    releasePhoneNumber: vi.fn(),
  },
}));

vi.mock('../services/twilioService', () => ({
  default: {
    sendSms: vi.fn(),
  },
  sendSms: vi.fn(),
}));

vi.mock('../services/virtualReceptionistService', () => ({
  handleIncomingCall: vi.fn(),
  handleCallStatus: vi.fn(),
}));

vi.mock('../services/analyticsService', () => ({
  getBusinessAnalytics: vi.fn().mockResolvedValue({}),
  getRevenueAnalytics: vi.fn().mockResolvedValue({}),
  getJobAnalytics: vi.fn().mockResolvedValue({}),
  getAppointmentAnalytics: vi.fn().mockResolvedValue({}),
  getCallAnalytics: vi.fn().mockResolvedValue({}),
  getCustomerAnalytics: vi.fn().mockResolvedValue({}),
  getPerformanceMetrics: vi.fn().mockResolvedValue({}),
}));

vi.mock('../services/stripeConnectService', () => ({
  stripeConnectService: {
    createConnectAccount: vi.fn(),
    getAccountStatus: vi.fn(),
    createPaymentIntent: vi.fn(),
  },
}));

vi.mock('../services/webhookService', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
  getWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  getDeliveries: vi.fn(),
  sendTestEvent: vi.fn(),
  generateWebhookSecret: vi.fn(),
  WEBHOOK_EVENTS: [],
  default: {
    fireEvent: vi.fn(),
  },
}));

// ── Route sub-module mocks ──
vi.mock('../routes/calendarRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/quickbooksRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/subscriptionRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/quoteRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/recurring', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/bookingRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/embedRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/cloverRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/squareRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/heartlandRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/adminRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/gbpRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/socialMediaRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/stripeConnectRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/phoneRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/locationRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});
vi.mock('../routes/exportRoutes', () => {
  const { Router } = require('express');
  return { default: Router() };
});

vi.mock('../routes/analyticsRoutes', () => ({
  registerAnalyticsRoutes: vi.fn(),
}));
vi.mock('../routes/webhookRoutes', () => ({
  registerWebhookRoutes: vi.fn(),
}));
vi.mock('../routes/marketingRoutes', () => ({
  registerMarketingRoutes: vi.fn(),
}));
vi.mock('../routes/zapierRoutes', () => ({
  registerZapierRoutes: vi.fn(),
}));
vi.mock('../routes/inventoryRoutes', () => ({
  registerInventoryRoutes: vi.fn(),
}));
vi.mock('../routes/automationRoutes', () => ({
  registerAutomationRoutes: vi.fn(),
}));

vi.mock('../routes/import', () => ({
  importCustomers: vi.fn(),
  importServices: vi.fn(),
  importAppointments: vi.fn(),
}));

vi.mock('../services/appointmentService', () => ({
  createAppointmentSafely: vi.fn().mockImplementation(async (data: any) => {
    // Delegate to the mocked storage.createAppointment for test compatibility
    const appointment = await mockStorage.createAppointment(data);
    return { success: true, appointment };
  }),
  updateAppointmentSafely: vi.fn().mockImplementation(async (id: number, businessId: number, startDate: Date, endDate: Date, staffId: any, updates: any) => {
    const appointment = await mockStorage.updateAppointment(id, { startDate, endDate, ...updates });
    return { success: true, appointment };
  }),
}));

vi.mock('../utils/encryption', () => ({
  encryptField: vi.fn((val: string) => val),
  decryptField: vi.fn((val: string) => val),
}));

// ────────────────────────────────────────────────────────
// Imports (after mocks)
// ────────────────────────────────────────────────────────

import { registerRoutes } from '../routes';
import { hashPassword } from '../auth';

// ────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────

let app: express.Express;
let httpServer: any;
let hashedTestPassword: string;

/** Standard mock user returned by storage */
function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password: hashedTestPassword,
    role: 'user',
    businessId: null as number | null,
    active: true,
    emailVerified: true,
    emailVerificationCode: null,
    emailVerificationExpiry: null,
    twoFactorSecret: null,
    twoFactorEnabled: false,
    twoFactorBackupCodes: null,
    lastLogin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard mock business */
function makeBusiness(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'Test Barber Shop',
    email: 'shop@test.com',
    phone: '+15551234567',
    industry: 'barber',
    type: 'salon',
    timezone: 'America/New_York',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    website: null,
    logoUrl: null,
    bookingSlug: 'test-barber',
    bookingEnabled: true,
    description: null,
    twilioPhoneNumber: null,
    receptionistEnabled: true,
    provisioningStatus: 'pending',
    provisioningResult: null,
    provisioningCompletedAt: null,
    subscriptionStatus: 'trialing',
    trialEndsAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard mock customer */
function makeCustomer(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+15559876543',
    email: 'jane@example.com',
    address: null,
    city: null,
    state: null,
    zip: null,
    notes: null,
    birthday: null,
    smsOptIn: false,
    smsOptInDate: null,
    smsOptInMethod: null,
    marketingOptIn: false,
    marketingOptInDate: null,
    tags: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard mock service */
function makeService(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    name: 'Haircut',
    description: 'Standard haircut',
    price: 25.0,
    duration: 30,
    active: true,
    ...overrides,
  };
}

/** Standard mock appointment */
function makeAppointment(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    customerId: 1,
    staffId: null,
    serviceId: null,
    startDate: new Date('2026-04-01T10:00:00Z'),
    endDate: new Date('2026-04-01T10:30:00Z'),
    status: 'scheduled',
    notes: null,
    manageToken: null,
    googleCalendarEventId: null,
    microsoftCalendarEventId: null,
    appleCalendarEventId: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard mock invoice */
function makeInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    customerId: 1,
    jobId: null,
    invoiceNumber: 'INV-001',
    amount: 100.0,
    tax: 8.0,
    total: 108.0,
    dueDate: '2026-04-15',
    status: 'pending',
    notes: null,
    stripePaymentIntentId: null,
    accessToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard mock invoice item */
function makeInvoiceItem(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    invoiceId: 1,
    description: 'Haircut service',
    quantity: 1,
    unitPrice: 100.0,
    amount: 100.0,
    ...overrides,
  };
}

/** Create an authenticated agent and return it along with the CSRF token */
async function createAuthenticatedAgent(): Promise<{
  agent: supertest.SuperAgentTest;
  csrfToken: string;
  user: ReturnType<typeof makeUser>;
}> {
  const user = makeUser({ businessId: 1 });

  // Mock for registration
  mockStorage.getUserByUsername.mockResolvedValue(undefined);
  mockStorage.getUserByEmail.mockResolvedValue(undefined);
  mockStorage.createUser.mockResolvedValue(user);
  mockStorage.updateUser.mockResolvedValue(user);
  mockStorage.getUser.mockResolvedValue(user);
  mockStorage.updateUserLastLogin.mockResolvedValue(user);

  // Business mocks (for setup-status and other calls during registration)
  mockStorage.getBusiness.mockResolvedValue(makeBusiness());
  mockStorage.getServices.mockResolvedValue([]);
  mockStorage.getStaff.mockResolvedValue([]);
  mockStorage.getCustomers.mockResolvedValue([]);
  mockStorage.getBusinessHours.mockResolvedValue([]);
  mockStorage.getAllAgentSettings.mockResolvedValue([]);

  const agent = supertest.agent(app);

  // Register (CSRF-exempt) to create a session
  const regRes = await agent
    .post('/api/register')
    .send({
      username: 'testuser',
      email: 'test@example.com',
      password: 'TestPassword1!',
    acceptTerms: true,
    acceptPrivacy: true
    });

  expect(regRes.status).toBe(201);

  // Extract CSRF token from cookie
  let csrfToken = '';
  const cookies: string[] = Array.isArray(regRes.headers['set-cookie'])
    ? regRes.headers['set-cookie']
    : [regRes.headers['set-cookie']].filter(Boolean);
  for (const cookie of cookies) {
    const match = cookie.match(/csrf-token=([^;]+)/);
    if (match) {
      csrfToken = match[1];
      break;
    }
  }

  // If no CSRF token from register, trigger one via GET
  if (!csrfToken) {
    const getRes = await agent.get('/api/user');
    const getCookies: string[] = Array.isArray(getRes.headers['set-cookie'])
      ? getRes.headers['set-cookie']
      : [getRes.headers['set-cookie']].filter(Boolean);
    for (const cookie of getCookies) {
      const match = cookie.match(/csrf-token=([^;]+)/);
      if (match) {
        csrfToken = match[1];
        break;
      }
    }
  }

  expect(csrfToken).toBeTruthy();

  return { agent, csrfToken, user };
}

// ────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────

beforeAll(async () => {
  hashedTestPassword = await hashPassword('TestPassword1!');
  mockStorage.sessionStore = new session.MemoryStore();

  // Build the test app with all routes
  const testApp = express();
  testApp.use(express.json());
  testApp.use(express.urlencoded({ extended: false }));
  testApp.use(cookieParser());

  // Session via MemoryStore (no real DB)
  testApp.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      store: mockStorage.sessionStore,
      cookie: { secure: false },
    }),
  );

  // CSRF middleware (matches production exempt paths)
  testApp.use((req, res, next) => {
    if (!req.cookies?.['csrf-token']) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf-token', token, {
        httpOnly: false,
        secure: false,
        sameSite: 'strict',
        path: '/',
      });
    }

    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    const exemptPaths = [
      '/api/login',
      '/api/register',
      '/api/logout',
      '/api/forgot-password',
      '/api/reset-password',
      '/api/verify-email',
      '/api/resend-verification',
      '/api/2fa/validate',
      '/api/book/',
      '/api/booking/',
    ];

    if (
      safeMethods.includes(req.method) ||
      exemptPaths.some((p) => req.path.startsWith(p))
    ) {
      return next();
    }

    const cookieToken = req.cookies?.['csrf-token'];
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({ message: 'Invalid CSRF token' });
    }

    next();
  });

  // Register ALL routes (calls setupAuth internally)
  httpServer = await registerRoutes(testApp);
  app = testApp;
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  if (httpServer) {
    httpServer.close();
  }
});

// ════════════════════════════════════════════════════════
// TEST SUITES
// ════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────
// 1. Appointments CRUD
// ────────────────────────────────────────────────────────

describe('Appointments CRUD', () => {
  describe('GET /api/appointments', () => {
    it('returns appointments list for the business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const appointments = [
        makeAppointment({ id: 1 }),
        makeAppointment({ id: 2, startDate: new Date('2026-04-02T11:00:00Z'), endDate: new Date('2026-04-02T11:30:00Z') }),
      ];
      mockStorage.getAppointments.mockResolvedValue(appointments);
      mockStorage.getCustomer.mockResolvedValue(makeCustomer());
      mockStorage.getStaffMember.mockResolvedValue(null);
      mockStorage.getService.mockResolvedValue(null);

      const res = await agent.get('/api/appointments');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('customer');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await supertest(app).get('/api/appointments');
      expect(res.status).toBe(401);
    });

    it('rejects NaN customerId query param with 400', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/appointments?customerId=abc');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid customer id/i);
    });

    it('rejects NaN staffId query param with 400', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/appointments?staffId=abc');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid staff id/i);
    });
  });

  describe('GET /api/appointments/:id', () => {
    it('returns a single appointment with populated relations', async () => {
      const { agent } = await createAuthenticatedAgent();

      const appointment = makeAppointment({ serviceId: 1, staffId: 1 });
      const customer = makeCustomer();
      const staff = { id: 1, businessId: 1, firstName: 'Bob', lastName: 'Stylist' };
      const service = makeService();

      mockStorage.getAppointment.mockResolvedValue(appointment);
      mockStorage.getCustomer.mockResolvedValue(customer);
      mockStorage.getStaffMember.mockResolvedValue(staff);
      mockStorage.getService.mockResolvedValue(service);

      const res = await agent.get('/api/appointments/1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('customerId', 1);
      expect(res.body).toHaveProperty('customer');
      expect(res.body.customer).toHaveProperty('firstName', 'Jane');
      expect(res.body).toHaveProperty('staff');
      expect(res.body).toHaveProperty('service');
    });

    it('returns 404 for appointment belonging to another business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const appointment = makeAppointment({ businessId: 999 });
      mockStorage.getAppointment.mockResolvedValue(appointment);

      const res = await agent.get('/api/appointments/1');

      expect(res.status).toBe(404);
    });

    it('returns 404 for nonexistent appointment', async () => {
      const { agent } = await createAuthenticatedAgent();

      mockStorage.getAppointment.mockResolvedValue(undefined);

      const res = await agent.get('/api/appointments/999');

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN appointment ID', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/appointments/abc');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid appointment id/i);
    });
  });

  describe('POST /api/appointments', () => {
    it('creates an appointment and returns 201', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const newAppointment = makeAppointment();
      mockStorage.createAppointment.mockResolvedValue(newAppointment);

      const res = await agent
        .post('/api/appointments')
        .set('x-csrf-token', csrfToken)
        .send({
          customerId: 1,
          startDate: '2026-04-01T10:00:00Z',
          endDate: '2026-04-01T10:30:00Z',
          status: 'scheduled',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('customerId', 1);
      expect(res.body).toHaveProperty('status', 'scheduled');
      expect(mockStorage.createAppointment).toHaveBeenCalledOnce();
      // Verify businessId was auto-set from session
      expect(mockStorage.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 1 }),
      );
    });

    it('returns 400 for invalid appointment data (missing required fields)', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/appointments')
        .set('x-csrf-token', csrfToken)
        .send({
          // Missing customerId, startDate, endDate
          notes: 'Missing required fields',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('errors');
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/appointments')
        .send({
          customerId: 1,
          startDate: '2026-04-01T10:00:00Z',
          endDate: '2026-04-01T10:30:00Z',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/appointments/:id', () => {
    it('updates an appointment owned by the business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeAppointment();
      const updated = makeAppointment({ status: 'confirmed', notes: 'Updated notes' });
      mockStorage.getAppointment.mockResolvedValue(existing);
      mockStorage.updateAppointment.mockResolvedValue(updated);

      const res = await agent
        .put('/api/appointments/1')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'confirmed', notes: 'Updated notes' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'confirmed');
      expect(res.body).toHaveProperty('notes', 'Updated notes');
    });

    it('returns 404 for appointment belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeAppointment({ businessId: 999 });
      mockStorage.getAppointment.mockResolvedValue(existing);

      const res = await agent
        .put('/api/appointments/1')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(404);
    });

    it('returns 404 for nonexistent appointment', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      mockStorage.getAppointment.mockResolvedValue(undefined);

      const res = await agent
        .put('/api/appointments/999')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN appointment ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .put('/api/appointments/abc')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid appointment id/i);
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent
        .put('/api/appointments/1')
        .send({ status: 'confirmed' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/appointments/:id', () => {
    it('deletes an appointment and returns 204', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeAppointment();
      mockStorage.getAppointment.mockResolvedValue(existing);
      mockStorage.deleteAppointment.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/appointments/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(204);
      expect(mockStorage.deleteAppointment).toHaveBeenCalledWith(1, 1);
    });

    it('returns 404 for appointment belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeAppointment({ businessId: 999 });
      mockStorage.getAppointment.mockResolvedValue(existing);

      const res = await agent
        .delete('/api/appointments/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    });

    it('returns 404 for nonexistent appointment', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      mockStorage.getAppointment.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/appointments/999')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN appointment ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .delete('/api/appointments/abc')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid appointment id/i);
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.delete('/api/appointments/1');

      expect(res.status).toBe(403);
    });
  });
});

// ────────────────────────────────────────────────────────
// 2. Invoices CRUD
// ────────────────────────────────────────────────────────

describe('Invoices CRUD', () => {
  describe('GET /api/invoices', () => {
    it('returns invoice list for the business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const invoices = [
        makeInvoice({ id: 1, invoiceNumber: 'INV-001' }),
        makeInvoice({ id: 2, invoiceNumber: 'INV-002', amount: 200.0, total: 216.0 }),
      ];
      mockStorage.getInvoices.mockResolvedValue(invoices);
      mockStorage.getCustomer.mockResolvedValue(makeCustomer());
      mockStorage.getInvoiceItems.mockResolvedValue([makeInvoiceItem()]);

      const res = await agent.get('/api/invoices');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('customer');
      expect(res.body[0]).toHaveProperty('items');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await supertest(app).get('/api/invoices');
      expect(res.status).toBe(401);
    });

    it('rejects NaN customerId query param with 400', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/invoices?customerId=abc');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid customer id/i);
    });
  });

  describe('GET /api/invoices/:id', () => {
    it('returns a single invoice with customer and items', async () => {
      const { agent } = await createAuthenticatedAgent();

      const invoice = makeInvoice();
      const customer = makeCustomer();
      const items = [makeInvoiceItem()];

      mockStorage.getInvoice.mockResolvedValue(invoice);
      mockStorage.getCustomer.mockResolvedValue(customer);
      mockStorage.getInvoiceItems.mockResolvedValue(items);

      const res = await agent.get('/api/invoices/1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('invoiceNumber', 'INV-001');
      expect(res.body).toHaveProperty('total', 108.0);
      expect(res.body).toHaveProperty('customer');
      expect(res.body.customer).toHaveProperty('firstName', 'Jane');
      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toHaveLength(1);
    });

    it('returns 404 for invoice belonging to another business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const invoice = makeInvoice({ businessId: 999 });
      mockStorage.getInvoice.mockResolvedValue(invoice);

      const res = await agent.get('/api/invoices/1');

      expect(res.status).toBe(404);
    });

    it('returns 404 for nonexistent invoice', async () => {
      const { agent } = await createAuthenticatedAgent();

      mockStorage.getInvoice.mockResolvedValue(undefined);

      const res = await agent.get('/api/invoices/999');

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN invoice ID', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/invoices/abc');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid invoice id/i);
    });
  });

  describe('POST /api/invoices', () => {
    it('creates an invoice and returns 201', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const newInvoice = makeInvoice();
      mockStorage.createInvoice.mockResolvedValue(newInvoice);

      const res = await agent
        .post('/api/invoices')
        .set('x-csrf-token', csrfToken)
        .send({
          customerId: 1,
          invoiceNumber: 'INV-001',
          amount: 100.0,
          tax: 8.0,
          total: 108.0,
          dueDate: '2026-04-15',
          status: 'pending',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 1);
      expect(res.body).toHaveProperty('invoiceNumber', 'INV-001');
      expect(res.body).toHaveProperty('total', 108.0);
      expect(mockStorage.createInvoice).toHaveBeenCalledOnce();
      // Verify businessId was auto-set from session
      expect(mockStorage.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 1 }),
      );
    });

    it('creates an invoice with items and returns 201', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const newInvoice = makeInvoice();
      const newItem = makeInvoiceItem();
      mockStorage.createInvoice.mockResolvedValue(newInvoice);
      mockStorage.createInvoiceItem.mockResolvedValue(newItem);

      const res = await agent
        .post('/api/invoices')
        .set('x-csrf-token', csrfToken)
        .send({
          customerId: 1,
          invoiceNumber: 'INV-001',
          amount: 100.0,
          tax: 8.0,
          total: 108.0,
          dueDate: '2026-04-15',
          items: [
            {
              description: 'Haircut service',
              quantity: 1,
              unitPrice: 100.0,
              amount: 100.0,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('invoiceNumber', 'INV-001');
      expect(mockStorage.createInvoice).toHaveBeenCalledOnce();
      expect(mockStorage.createInvoiceItem).toHaveBeenCalledOnce();
    });

    it('returns 400 for invalid invoice data (missing required fields)', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/invoices')
        .set('x-csrf-token', csrfToken)
        .send({
          // Missing customerId, invoiceNumber, amount, total
          notes: 'Missing required fields',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('errors');
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/invoices')
        .send({
          customerId: 1,
          invoiceNumber: 'INV-001',
          amount: 100.0,
          total: 108.0,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/invoices/:id', () => {
    it('updates an invoice status', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeInvoice();
      const updated = makeInvoice({ status: 'paid' });
      mockStorage.getInvoice.mockResolvedValue(existing);
      mockStorage.updateInvoice.mockResolvedValue(updated);

      const res = await agent
        .put('/api/invoices/1')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'paid' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'paid');
    });

    it('updates invoice notes', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeInvoice();
      const updated = makeInvoice({ notes: 'Payment received via check' });
      mockStorage.getInvoice.mockResolvedValue(existing);
      mockStorage.updateInvoice.mockResolvedValue(updated);

      const res = await agent
        .put('/api/invoices/1')
        .set('x-csrf-token', csrfToken)
        .send({ notes: 'Payment received via check' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notes', 'Payment received via check');
    });

    it('returns 404 for invoice belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeInvoice({ businessId: 999 });
      mockStorage.getInvoice.mockResolvedValue(existing);

      const res = await agent
        .put('/api/invoices/1')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'paid' });

      expect(res.status).toBe(404);
    });

    it('returns 404 for nonexistent invoice', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      mockStorage.getInvoice.mockResolvedValue(undefined);

      const res = await agent
        .put('/api/invoices/999')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'paid' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN invoice ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .put('/api/invoices/abc')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'paid' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid invoice id/i);
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent
        .put('/api/invoices/1')
        .send({ status: 'paid' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/invoices/:id', () => {
    it('deletes an invoice (with items) and returns 204', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeInvoice();
      const items = [makeInvoiceItem({ id: 10 }), makeInvoiceItem({ id: 11 })];
      mockStorage.getInvoice.mockResolvedValue(existing);
      mockStorage.getInvoiceItems.mockResolvedValue(items);
      mockStorage.deleteInvoiceItem.mockResolvedValue(undefined);
      mockStorage.deleteInvoice.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/invoices/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(204);
      // Verify items were deleted first
      expect(mockStorage.deleteInvoiceItem).toHaveBeenCalledTimes(2);
      expect(mockStorage.deleteInvoiceItem).toHaveBeenCalledWith(10);
      expect(mockStorage.deleteInvoiceItem).toHaveBeenCalledWith(11);
      // Then the invoice itself with businessId
      expect(mockStorage.deleteInvoice).toHaveBeenCalledWith(1, 1);
    });

    it('deletes an invoice with no items and returns 204', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeInvoice();
      mockStorage.getInvoice.mockResolvedValue(existing);
      mockStorage.getInvoiceItems.mockResolvedValue([]);
      mockStorage.deleteInvoice.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/invoices/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(204);
      expect(mockStorage.deleteInvoiceItem).not.toHaveBeenCalled();
      expect(mockStorage.deleteInvoice).toHaveBeenCalledWith(1, 1);
    });

    it('returns 404 for invoice belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeInvoice({ businessId: 999 });
      mockStorage.getInvoice.mockResolvedValue(existing);

      const res = await agent
        .delete('/api/invoices/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    });

    it('returns 404 for nonexistent invoice', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      mockStorage.getInvoice.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/invoices/999')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN invoice ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .delete('/api/invoices/abc')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid invoice id/i);
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.delete('/api/invoices/1');

      expect(res.status).toBe(403);
    });
  });
});

// ────────────────────────────────────────────────────────
// 3. CSRF enforcement on appointment/invoice endpoints
// ────────────────────────────────────────────────────────

describe('CSRF enforcement on appointments and invoices', () => {
  it('blocks POST /api/appointments without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .post('/api/appointments')
      .send({ customerId: 1, startDate: '2026-04-01T10:00:00Z', endDate: '2026-04-01T10:30:00Z' });

    expect(res.status).toBe(403);
  });

  it('blocks PUT /api/appointments/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .put('/api/appointments/1')
      .send({ status: 'confirmed' });

    expect(res.status).toBe(403);
  });

  it('blocks DELETE /api/appointments/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.delete('/api/appointments/1');

    expect(res.status).toBe(403);
  });

  it('blocks POST /api/invoices without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .post('/api/invoices')
      .send({ customerId: 1, invoiceNumber: 'INV-001', amount: 100, total: 100 });

    expect(res.status).toBe(403);
  });

  it('blocks PUT /api/invoices/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .put('/api/invoices/1')
      .send({ status: 'paid' });

    expect(res.status).toBe(403);
  });

  it('blocks DELETE /api/invoices/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.delete('/api/invoices/1');

    expect(res.status).toBe(403);
  });
});

// ────────────────────────────────────────────────────────
// 4. Full Flow: Register -> Appointment -> Invoice
// ────────────────────────────────────────────────────────

describe('Full Flow: Register -> Appointment -> Invoice', () => {
  it('register -> create customer -> create appointment -> complete appointment -> create invoice', async () => {
    // Step 1: Register and get authenticated agent
    const user = makeUser({ businessId: 1 });
    mockStorage.getUserByUsername.mockResolvedValue(undefined);
    mockStorage.getUserByEmail.mockResolvedValue(undefined);
    mockStorage.createUser.mockResolvedValue(user);
    mockStorage.updateUser.mockResolvedValue(user);
    mockStorage.getUser.mockResolvedValue(user);
    mockStorage.updateUserLastLogin.mockResolvedValue(user);
    mockStorage.getBusiness.mockResolvedValue(makeBusiness());
    mockStorage.getServices.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([]);
    mockStorage.getCustomers.mockResolvedValue([]);
    mockStorage.getBusinessHours.mockResolvedValue([]);
    mockStorage.getAllAgentSettings.mockResolvedValue([]);

    const agent = supertest.agent(app);

    const regRes = await agent.post('/api/register').send({
      username: 'flowuser',
      email: 'flow@example.com',
      password: 'TestPassword1!',
    acceptTerms: true,
    acceptPrivacy: true
    });
    expect(regRes.status).toBe(201);

    // Extract CSRF token
    let csrfToken = '';
    const cookies: string[] = Array.isArray(regRes.headers['set-cookie'])
      ? regRes.headers['set-cookie']
      : [regRes.headers['set-cookie']].filter(Boolean);
    for (const cookie of cookies) {
      const match = cookie.match(/csrf-token=([^;]+)/);
      if (match) {
        csrfToken = match[1];
        break;
      }
    }
    if (!csrfToken) {
      const getRes = await agent.get('/api/user');
      const getCookies: string[] = Array.isArray(getRes.headers['set-cookie'])
        ? getRes.headers['set-cookie']
        : [getRes.headers['set-cookie']].filter(Boolean);
      for (const cookie of getCookies) {
        const match = cookie.match(/csrf-token=([^;]+)/);
        if (match) {
          csrfToken = match[1];
          break;
        }
      }
    }
    expect(csrfToken).toBeTruthy();

    // Step 2: Create a customer
    const customer = makeCustomer();
    mockStorage.createCustomer.mockResolvedValue(customer);

    const custRes = await agent
      .post('/api/customers')
      .set('x-csrf-token', csrfToken)
      .send({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+15559876543',
        email: 'jane@example.com',
      });
    expect(custRes.status).toBe(201);

    // Step 3: Create an appointment for this customer
    const appointment = makeAppointment();
    mockStorage.createAppointment.mockResolvedValue(appointment);

    const apptRes = await agent
      .post('/api/appointments')
      .set('x-csrf-token', csrfToken)
      .send({
        customerId: 1,
        startDate: '2026-04-01T10:00:00Z',
        endDate: '2026-04-01T10:30:00Z',
        status: 'scheduled',
      });
    expect(apptRes.status).toBe(201);
    expect(apptRes.body).toHaveProperty('customerId', 1);
    expect(apptRes.body).toHaveProperty('status', 'scheduled');

    // Step 4: Complete the appointment
    const completedAppointment = makeAppointment({ status: 'completed' });
    mockStorage.getAppointment.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue(completedAppointment);

    const updateRes = await agent
      .put('/api/appointments/1')
      .set('x-csrf-token', csrfToken)
      .send({ status: 'completed' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toHaveProperty('status', 'completed');

    // Step 5: Create an invoice for the completed service
    const invoice = makeInvoice();
    mockStorage.createInvoice.mockResolvedValue(invoice);
    const invoiceItem = makeInvoiceItem();
    mockStorage.createInvoiceItem.mockResolvedValue(invoiceItem);

    const invoiceRes = await agent
      .post('/api/invoices')
      .set('x-csrf-token', csrfToken)
      .send({
        customerId: 1,
        invoiceNumber: 'INV-001',
        amount: 25.0,
        tax: 2.0,
        total: 27.0,
        dueDate: '2026-04-15',
        items: [
          {
            description: 'Haircut service',
            quantity: 1,
            unitPrice: 25.0,
            amount: 25.0,
          },
        ],
      });
    expect(invoiceRes.status).toBe(201);
    expect(invoiceRes.body).toHaveProperty('invoiceNumber', 'INV-001');
    expect(mockStorage.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 1, customerId: 1 }),
    );
    expect(mockStorage.createInvoiceItem).toHaveBeenCalledOnce();

    // Step 6: Verify we can fetch the appointment list
    mockStorage.getAppointments.mockResolvedValue([completedAppointment]);
    mockStorage.getCustomer.mockResolvedValue(customer);
    mockStorage.getStaffMember.mockResolvedValue(null);
    mockStorage.getService.mockResolvedValue(null);

    const listRes = await agent.get('/api/appointments');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toHaveProperty('status', 'completed');

    // Step 7: Verify we can fetch the invoice list
    mockStorage.getInvoices.mockResolvedValue([invoice]);
    mockStorage.getInvoiceItems.mockResolvedValue([invoiceItem]);

    const invListRes = await agent.get('/api/invoices');
    expect(invListRes.status).toBe(200);
    expect(Array.isArray(invListRes.body)).toBe(true);
    expect(invListRes.body).toHaveLength(1);
    expect(invListRes.body[0]).toHaveProperty('invoiceNumber', 'INV-001');
  });
});
