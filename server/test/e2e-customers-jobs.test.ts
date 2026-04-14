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
      archiveCustomer: vi.fn(),
      restoreCustomer: vi.fn(),
      getArchivedCustomers: vi.fn(),

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
      deleteJob: vi.fn(),

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

      sessionStore: null as any,
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
    execute: vi.fn().mockResolvedValue({ rows: [] }),
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
    sendJobInProgressNotification: vi.fn().mockResolvedValue(undefined),
    sendJobWaitingPartsNotification: vi.fn().mockResolvedValue(undefined),
    sendJobResumedNotification: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../services/callToolHandlers', () => ({
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

vi.mock('../services/jobQueue', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  default: {
    enqueue: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/appointmentService', () => ({
  createAppointmentSafely: vi.fn().mockImplementation(async (data: any) => {
    const appointment = await mockStorage.createAppointment(data);
    return { success: true, appointment };
  }),
  updateAppointmentSafely: vi.fn().mockImplementation(async (id: number, businessId: number, startDate: Date, endDate: Date, staffId: any, updates: any) => {
    const appointment = await mockStorage.updateAppointment(id, { startDate, endDate, ...updates });
    return { success: true, appointment };
  }),
}));

vi.mock('../services/jobBriefingService', () => ({
  generateJobBriefing: vi.fn().mockResolvedValue({
    summary: 'Test briefing summary',
    customerContext: 'Test customer context',
    jobHistory: 'No previous jobs',
    currentJob: 'Test job details',
    sentiment: 'neutral',
    suggestedApproach: 'Standard approach',
    followUpOpportunities: [],
    generatedAt: new Date().toISOString(),
  }),
}));

// ── Route sub-module mocks (mock out routes NOT being tested) ──
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

vi.mock('../utils/encryption', () => ({
  encryptField: vi.fn((val: string) => val),
  decryptField: vi.fn((val: string) => val),
}));

vi.mock('../utils/money', () => ({
  toMoney: vi.fn((val: any) => Number(val) || 0),
  roundMoney: vi.fn((val: number) => Math.round(val * 100) / 100),
}));

vi.mock('../utils/s3Upload', () => ({
  uploadBufferToS3: vi.fn().mockResolvedValue('https://s3.example.com/photo.jpg'),
  isS3Configured: vi.fn().mockReturnValue(true),
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
    vapiAssistantId: null,
    receptionistEnabled: true,
    provisioningStatus: 'pending',
    provisioningResult: null,
    provisioningCompletedAt: null,
    subscriptionStatus: 'trialing',
    trialEndsAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    autoInvoiceOnJobCompletion: false,
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
    zipcode: null,
    notes: null,
    birthday: null,
    smsOptIn: false,
    smsOptInDate: null,
    smsOptInMethod: null,
    marketingOptIn: false,
    marketingOptInDate: null,
    tags: null,
    isArchived: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard mock job */
function makeJob(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    customerId: 1,
    appointmentId: null,
    staffId: null,
    title: 'AC Repair',
    description: 'Fix the central air unit',
    scheduledDate: '2026-04-15',
    status: 'pending',
    estimatedCompletion: null,
    notes: null,
    photos: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard mock job line item */
function makeJobLineItem(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    jobId: 1,
    type: 'labor',
    description: 'Diagnostic fee',
    quantity: 1,
    unitPrice: '75.00',
    amount: '75.00',
    taxable: true,
    createdAt: new Date(),
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
    amount: '100.00',
    tax: '8.00',
    total: '108.00',
    dueDate: '2026-04-15',
    status: 'pending',
    notes: null,
    stripePaymentIntentId: null,
    accessToken: null,
    accessTokenExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
// 1. Customer CRUD
// ────────────────────────────────────────────────────────

describe('Customer CRUD', () => {
  describe('GET /api/customers', () => {
    it('returns empty array for new business', async () => {
      const { agent } = await createAuthenticatedAgent();

      mockStorage.getCustomers.mockResolvedValue([]);

      const res = await agent.get('/api/customers');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await supertest(app).get('/api/customers');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/customers', () => {
    it('creates a customer and returns 201', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const newCustomer = makeCustomer();
      mockStorage.createCustomer.mockResolvedValue(newCustomer);

      const res = await agent
        .post('/api/customers')
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+15559876543',
          email: 'jane@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('firstName', 'Jane');
      expect(res.body).toHaveProperty('lastName', 'Doe');
      expect(res.body).toHaveProperty('phone', '+15559876543');
      expect(mockStorage.createCustomer).toHaveBeenCalledOnce();
      // Verify businessId was auto-set from session
      expect(mockStorage.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 1 }),
      );
    });

    it('validates required fields (firstName, lastName, phone)', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      // Missing firstName
      const res1 = await agent
        .post('/api/customers')
        .set('x-csrf-token', csrfToken)
        .send({
          lastName: 'Doe',
          phone: '+15559876543',
          email: 'jane@example.com',
        });

      expect(res1.status).toBe(400);

      // Missing lastName
      const res2 = await agent
        .post('/api/customers')
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'Jane',
          phone: '+15559876543',
          email: 'jane@example.com',
        });

      expect(res2.status).toBe(400);

      // Missing phone
      const res3 = await agent
        .post('/api/customers')
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
        });

      expect(res3.status).toBe(400);
    });

    it('rejects invalid email format', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/customers')
        .set('x-csrf-token', csrfToken)
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+15559876543',
          email: 'not-an-email',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/customers/:id', () => {
    it('returns the created customer', async () => {
      const { agent } = await createAuthenticatedAgent();

      const customer = makeCustomer();
      mockStorage.getCustomer.mockResolvedValue(customer);

      const res = await agent.get('/api/customers/1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('firstName', 'Jane');
      expect(res.body).toHaveProperty('lastName', 'Doe');
      expect(res.body).toHaveProperty('phone', '+15559876543');
    });

    it('returns 404 for customer belonging to another business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const customer = makeCustomer({ businessId: 999 });
      mockStorage.getCustomer.mockResolvedValue(customer);

      const res = await agent.get('/api/customers/1');

      expect(res.status).toBe(404);
    });

    it('returns 404 for nonexistent customer', async () => {
      const { agent } = await createAuthenticatedAgent();

      mockStorage.getCustomer.mockResolvedValue(undefined);

      const res = await agent.get('/api/customers/999');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/customers/:id', () => {
    it('updates customer fields', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeCustomer();
      const updated = makeCustomer({
        firstName: 'Janet',
        smsOptIn: true,
        tags: '["VIP"]',
      });
      mockStorage.getCustomer.mockResolvedValue(existing);
      mockStorage.updateCustomer.mockResolvedValue(updated);

      const res = await agent
        .patch('/api/customers/1')
        .set('x-csrf-token', csrfToken)
        .send({ firstName: 'Janet', smsOptIn: true, tags: ['VIP'] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('firstName', 'Janet');
      expect(res.body).toHaveProperty('smsOptIn', true);
    });

    it('returns 404 for customer belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeCustomer({ businessId: 999 });
      mockStorage.getCustomer.mockResolvedValue(existing);

      const res = await agent
        .patch('/api/customers/1')
        .set('x-csrf-token', csrfToken)
        .send({ firstName: 'Hacked' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/customers/:id', () => {
    it('soft-deletes the customer and returns success', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeCustomer();
      mockStorage.getCustomer.mockResolvedValue(existing);
      mockStorage.deleteCustomer.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/customers/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(204);
      expect(mockStorage.deleteCustomer).toHaveBeenCalledWith(1, 1);
    });

    it('returns 404 for customer belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeCustomer({ businessId: 999 });
      mockStorage.getCustomer.mockResolvedValue(existing);

      const res = await agent
        .delete('/api/customers/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/customers/:id/restore', () => {
    it('restores a soft-deleted customer', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const deletedCustomer = makeCustomer({ deletedAt: new Date(), isArchived: true });
      const restoredCustomer = makeCustomer({ deletedAt: null, isArchived: false });
      mockStorage.getCustomer.mockResolvedValue(deletedCustomer);
      mockStorage.restoreCustomer.mockResolvedValue(restoredCustomer);

      const res = await agent
        .post('/api/customers/1/restore')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isArchived', false);
      expect(res.body.deletedAt).toBeNull();
      expect(mockStorage.restoreCustomer).toHaveBeenCalledWith(1, 1);
    });

    it('returns 404 for customer belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const customer = makeCustomer({ businessId: 999 });
      mockStorage.getCustomer.mockResolvedValue(customer);

      const res = await agent
        .post('/api/customers/1/restore')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN customer ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/customers/abc/restore')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/customers/import', () => {
    it('accepts CSV data and imports customers', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      mockStorage.getCustomerByPhone.mockResolvedValue(undefined);
      mockStorage.createCustomer.mockImplementation(async (data: any) => makeCustomer(data));

      const res = await agent
        .post('/api/customers/import')
        .set('x-csrf-token', csrfToken)
        .send({
          customers: [
            { firstName: 'Alice', lastName: 'Smith', phone: '+15551110001', email: 'alice@example.com' },
            { firstName: 'Bob', lastName: 'Jones', phone: '+15551110002', email: 'bob@example.com' },
            { firstName: 'Charlie', lastName: 'Brown', phone: '+15551110003', email: 'charlie@example.com' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('imported', 3);
      expect(res.body).toHaveProperty('skipped', 0);
      expect(res.body).toHaveProperty('errors');
      expect(res.body.errors).toHaveLength(0);
    });

    it('skips customers with duplicate phone numbers', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      // First phone number already exists
      mockStorage.getCustomerByPhone
        .mockResolvedValueOnce(makeCustomer({ phone: '+15551110001' }))
        .mockResolvedValueOnce(undefined);
      mockStorage.createCustomer.mockImplementation(async (data: any) => makeCustomer(data));

      const res = await agent
        .post('/api/customers/import')
        .set('x-csrf-token', csrfToken)
        .send({
          customers: [
            { firstName: 'Alice', lastName: 'Smith', phone: '+15551110001' },
            { firstName: 'Bob', lastName: 'Jones', phone: '+15551110002' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('imported', 1);
      expect(res.body).toHaveProperty('skipped', 1);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].reason).toMatch(/duplicate/i);
    });

    it('rejects empty customer list', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/customers/import')
        .set('x-csrf-token', csrfToken)
        .send({ customers: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/customers/:id/timeline', () => {
    it('returns empty communications initially', async () => {
      const { agent } = await createAuthenticatedAgent();

      const customer = makeCustomer();
      mockStorage.getCustomer.mockResolvedValue(customer);
      // pool.query is already mocked to return { rows: [] }

      const res = await agent.get('/api/customers/1/timeline');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('returns 404 for customer belonging to another business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const customer = makeCustomer({ businessId: 999 });
      mockStorage.getCustomer.mockResolvedValue(customer);

      const res = await agent.get('/api/customers/1/timeline');

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN customer ID', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/customers/abc/timeline');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/customers/:id/archive', () => {
    it('marks customer as archived', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const customer = makeCustomer();
      const archived = makeCustomer({ isArchived: true });
      mockStorage.getCustomer.mockResolvedValue(customer);
      mockStorage.archiveCustomer.mockResolvedValue(archived);

      const res = await agent
        .post('/api/customers/1/archive')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isArchived', true);
      expect(mockStorage.archiveCustomer).toHaveBeenCalledWith(1, 1);
    });

    it('returns 400 for NaN customer ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/customers/abc/archive')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(400);
    });
  });

  describe('NaN ID handling', () => {
    it('GET /api/customers/:id returns 400 for NaN', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/customers/abc');

      // isNaN guard returns 400 for invalid customer ID
      expect(res.status).toBe(400);
    });

    it('DELETE /api/customers/:id returns 400 for NaN', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .delete('/api/customers/abc')
        .set('x-csrf-token', csrfToken);

      // isNaN guard returns 400 for invalid customer ID
      expect(res.status).toBe(400);
    });
  });
});

// ────────────────────────────────────────────────────────
// 2. Job CRUD
// ────────────────────────────────────────────────────────

describe('Job CRUD', () => {
  describe('GET /api/jobs', () => {
    it('returns empty for new business', async () => {
      const { agent } = await createAuthenticatedAgent();

      mockStorage.getJobs.mockResolvedValue([]);

      const res = await agent.get('/api/jobs');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await supertest(app).get('/api/jobs');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/jobs', () => {
    it('creates a job linked to customer and returns 201', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const newJob = makeJob();
      mockStorage.createJob.mockResolvedValue(newJob);

      const res = await agent
        .post('/api/jobs')
        .set('x-csrf-token', csrfToken)
        .send({
          customerId: 1,
          title: 'AC Repair',
          description: 'Fix the central air unit',
          scheduledDate: '2026-04-15',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('title', 'AC Repair');
      expect(res.body).toHaveProperty('customerId', 1);
      expect(res.body).toHaveProperty('status', 'pending');
      expect(mockStorage.createJob).toHaveBeenCalledOnce();
      // Verify businessId was set from session
      expect(mockStorage.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 1, customerId: 1 }),
      );
    });

    it('validates required fields (title, customerId)', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      // Missing title
      const res1 = await agent
        .post('/api/jobs')
        .set('x-csrf-token', csrfToken)
        .send({
          customerId: 1,
          description: 'Some description',
        });

      expect(res1.status).toBe(400);

      // Missing customerId
      const res2 = await agent
        .post('/api/jobs')
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'AC Repair',
          description: 'Some description',
        });

      expect(res2.status).toBe(400);
    });
  });

  describe('GET /api/jobs/:id', () => {
    it('returns the created job with correct fields', async () => {
      const { agent } = await createAuthenticatedAgent();

      const job = makeJob();
      const customer = makeCustomer();
      mockStorage.getJob.mockResolvedValue(job);
      mockStorage.getCustomer.mockResolvedValue(customer);
      mockStorage.getStaffMember.mockResolvedValue(null);

      const res = await agent.get('/api/jobs/1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('title', 'AC Repair');
      expect(res.body).toHaveProperty('status', 'pending');
      expect(res.body).toHaveProperty('customerId', 1);
      expect(res.body).toHaveProperty('customer');
      expect(res.body.customer).toHaveProperty('firstName', 'Jane');
    });

    it('returns 404 for job belonging to another business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const job = makeJob({ businessId: 999 });
      mockStorage.getJob.mockResolvedValue(job);

      const res = await agent.get('/api/jobs/1');

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN job ID', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/jobs/abc');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid job id/i);
    });
  });

  describe('PUT /api/jobs/:id', () => {
    it('updates job status to in_progress', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeJob({ status: 'pending' });
      const updated = makeJob({ status: 'in_progress' });
      mockStorage.getJob.mockResolvedValue(existing);
      mockStorage.updateJob.mockResolvedValue(updated);

      const res = await agent
        .put('/api/jobs/1')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'in_progress');
    });

    it('updates job status to completed', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeJob({ status: 'in_progress' });
      const updated = makeJob({ status: 'completed' });
      mockStorage.getJob.mockResolvedValue(existing);
      mockStorage.updateJob.mockResolvedValue(updated);
      mockStorage.getJobLineItems.mockResolvedValue([]);
      mockStorage.getBusiness.mockResolvedValue(makeBusiness());

      const res = await agent
        .put('/api/jobs/1')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'completed');
    });

    it('returns 404 for job belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeJob({ businessId: 999 });
      mockStorage.getJob.mockResolvedValue(existing);

      const res = await agent
        .put('/api/jobs/1')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN job ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .put('/api/jobs/abc')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/jobs/:id', () => {
    it('deletes a job and returns 204', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeJob();
      mockStorage.getJob.mockResolvedValue(existing);
      mockStorage.deleteJob.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/jobs/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(204);
      expect(mockStorage.deleteJob).toHaveBeenCalledWith(1, 1);
    });

    it('returns 404 for job belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeJob({ businessId: 999 });
      mockStorage.getJob.mockResolvedValue(existing);

      const res = await agent
        .delete('/api/jobs/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN job ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .delete('/api/jobs/abc')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(400);
    });
  });

  describe('Job Line Items', () => {
    it('POST /api/jobs/:id/line-items adds a line item', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const job = makeJob();
      const lineItem = makeJobLineItem();
      mockStorage.getJob.mockResolvedValue(job);
      mockStorage.createJobLineItem.mockResolvedValue(lineItem);

      const res = await agent
        .post('/api/jobs/1/line-items')
        .set('x-csrf-token', csrfToken)
        .send({
          type: 'labor',
          description: 'Diagnostic fee',
          quantity: 1,
          unitPrice: 75.00,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('type', 'labor');
      expect(res.body).toHaveProperty('description', 'Diagnostic fee');
      expect(mockStorage.createJobLineItem).toHaveBeenCalledOnce();
    });

    it('GET /api/jobs/:id/line-items returns the line items', async () => {
      const { agent } = await createAuthenticatedAgent();

      const job = makeJob();
      const lineItems = [
        makeJobLineItem({ id: 1, description: 'Labor charge' }),
        makeJobLineItem({ id: 2, type: 'part', description: 'Filter replacement', unitPrice: '25.00', amount: '25.00' }),
      ];
      mockStorage.getJob.mockResolvedValue(job);
      mockStorage.getJobLineItems.mockResolvedValue(lineItems);

      const res = await agent.get('/api/jobs/1/line-items');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('description', 'Labor charge');
      expect(res.body[1]).toHaveProperty('type', 'part');
    });

    it('DELETE /api/jobs/:jobId/line-items/:id removes a line item', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const job = makeJob();
      mockStorage.getJob.mockResolvedValue(job);
      mockStorage.deleteJobLineItem.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/jobs/1/line-items/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(204);
      expect(mockStorage.deleteJobLineItem).toHaveBeenCalledWith(1);
    });

    it('returns 404 for line items on job belonging to another business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const job = makeJob({ businessId: 999 });
      mockStorage.getJob.mockResolvedValue(job);

      const res = await agent.get('/api/jobs/1/line-items');

      expect(res.status).toBe(404);
    });
  });

  describe('Auto-invoice on job completion', () => {
    it('creates an invoice when status changes to completed and autoInvoiceOnJobCompletion is enabled', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeJob({ status: 'in_progress' });
      const updated = makeJob({ status: 'completed' });
      const lineItems = [
        makeJobLineItem({ id: 1, amount: '75.00', taxable: true }),
        makeJobLineItem({ id: 2, type: 'part', description: 'Filter', amount: '25.00', taxable: true }),
      ];
      const newInvoice = makeInvoice({ jobId: 1, amount: '100.00', tax: '8.00', total: '108.00' });

      mockStorage.getJob.mockResolvedValue(existing);
      mockStorage.updateJob.mockResolvedValue(updated);
      mockStorage.getBusiness.mockResolvedValue(makeBusiness({ autoInvoiceOnJobCompletion: true }));
      mockStorage.getJobLineItems.mockResolvedValue(lineItems);
      mockStorage.createInvoice.mockResolvedValue(newInvoice);
      mockStorage.createInvoiceItem.mockResolvedValue({});

      const res = await agent
        .put('/api/jobs/1')
        .set('x-csrf-token', csrfToken)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'completed');
      // Verify invoice was created
      expect(mockStorage.createInvoice).toHaveBeenCalledOnce();
      expect(mockStorage.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 1,
          customerId: 1,
          jobId: 1,
          status: 'pending',
        }),
      );
    });
  });

  describe('GET /api/jobs/:id/briefing', () => {
    it('returns 200 with briefing data', async () => {
      const { agent } = await createAuthenticatedAgent();

      const job = makeJob();
      mockStorage.getJob.mockResolvedValue(job);

      const res = await agent.get('/api/jobs/1/briefing');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('generatedAt');
    });

    it('returns 404 for job belonging to another business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const job = makeJob({ businessId: 999 });
      mockStorage.getJob.mockResolvedValue(job);

      const res = await agent.get('/api/jobs/1/briefing');

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN job ID', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/jobs/abc/briefing');

      expect(res.status).toBe(400);
    });
  });
});

// ────────────────────────────────────────────────────────
// 3. Cross-entity Tests
// ────────────────────────────────────────────────────────

describe('Cross-entity Relationships', () => {
  it('GET /api/jobs populates customer data for each job', async () => {
    const { agent } = await createAuthenticatedAgent();

    const jobs = [makeJob({ id: 1, customerId: 1 })];
    const customer = makeCustomer({ id: 1, firstName: 'Jane', lastName: 'Doe' });

    mockStorage.getJobs.mockResolvedValue(jobs);
    mockStorage.getCustomer.mockResolvedValue(customer);
    mockStorage.getStaffMember.mockResolvedValue(null);
    mockStorage.getAppointment.mockResolvedValue(null);

    const res = await agent.get('/api/jobs');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('customer');
    expect(res.body[0].customer).toHaveProperty('firstName', 'Jane');
  });

  it('invoice created from job links back to customer via customerId', async () => {
    const { agent, csrfToken } = await createAuthenticatedAgent();

    const job = makeJob({ id: 5, customerId: 3 });
    const lineItems = [makeJobLineItem({ jobId: 5, amount: '50.00', taxable: true })];
    const newInvoice = makeInvoice({ id: 10, businessId: 1, customerId: 3, jobId: 5 });
    const customer = makeCustomer({ id: 3, firstName: 'Alice' });

    mockStorage.getJob.mockResolvedValue(job);
    mockStorage.getJobLineItems.mockResolvedValue(lineItems);
    mockStorage.createInvoice.mockResolvedValue(newInvoice);
    mockStorage.createInvoiceItem.mockResolvedValue({});
    mockStorage.getInvoiceItems.mockResolvedValue([]);
    mockStorage.getCustomer.mockResolvedValue(customer);

    const res = await agent
      .post('/api/jobs/5/generate-invoice')
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('customerId', 3);
    expect(res.body).toHaveProperty('jobId', 5);
    expect(res.body).toHaveProperty('customer');
    expect(res.body.customer).toHaveProperty('firstName', 'Alice');
  });

  it('generate-invoice returns 400 when job has no line items', async () => {
    const { agent, csrfToken } = await createAuthenticatedAgent();

    const job = makeJob({ id: 1 });
    mockStorage.getJob.mockResolvedValue(job);
    mockStorage.getJobLineItems.mockResolvedValue([]);

    const res = await agent
      .post('/api/jobs/1/generate-invoice')
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no line items/i);
  });

  it('soft-deleting a customer does not affect their jobs', async () => {
    const { agent, csrfToken } = await createAuthenticatedAgent();

    // First, soft-delete the customer
    const customer = makeCustomer({ id: 1 });
    mockStorage.getCustomer.mockResolvedValue(customer);
    mockStorage.deleteCustomer.mockResolvedValue(undefined);

    const deleteRes = await agent
      .delete('/api/customers/1')
      .set('x-csrf-token', csrfToken);

    expect(deleteRes.status).toBe(204);

    // Jobs should still be accessible
    const job = makeJob({ id: 1, customerId: 1 });
    mockStorage.getJob.mockResolvedValue(job);
    mockStorage.getCustomer.mockResolvedValue(makeCustomer({ id: 1, deletedAt: new Date() }));
    mockStorage.getStaffMember.mockResolvedValue(null);

    const jobRes = await agent.get('/api/jobs/1');

    expect(jobRes.status).toBe(200);
    expect(jobRes.body).toHaveProperty('title', 'AC Repair');
    expect(jobRes.body).toHaveProperty('customerId', 1);
    // deleteJob should NOT have been called
    expect(mockStorage.deleteJob).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────
// 4. CSRF Enforcement
// ────────────────────────────────────────────────────────

describe('CSRF enforcement on customer and job endpoints', () => {
  it('blocks POST /api/customers without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .post('/api/customers')
      .send({ firstName: 'Jane', lastName: 'Doe', phone: '+15551234567', email: 'jane@test.com' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/csrf/i);
  });

  it('blocks PATCH /api/customers/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .patch('/api/customers/1')
      .send({ firstName: 'Updated' });

    expect(res.status).toBe(403);
  });

  it('blocks DELETE /api/customers/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.delete('/api/customers/1');

    expect(res.status).toBe(403);
  });

  it('blocks POST /api/jobs without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .post('/api/jobs')
      .send({ customerId: 1, title: 'Test Job' });

    expect(res.status).toBe(403);
  });

  it('blocks PUT /api/jobs/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .put('/api/jobs/1')
      .send({ status: 'in_progress' });

    expect(res.status).toBe(403);
  });

  it('blocks DELETE /api/jobs/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.delete('/api/jobs/1');

    expect(res.status).toBe(403);
  });

  it('blocks POST /api/jobs/:id/line-items without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .post('/api/jobs/1/line-items')
      .send({ type: 'labor', description: 'Work', unitPrice: 50 });

    expect(res.status).toBe(403);
  });

  it('blocks DELETE /api/jobs/:id/line-items/:lineItemId without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.delete('/api/jobs/1/line-items/1');

    expect(res.status).toBe(403);
  });
});
