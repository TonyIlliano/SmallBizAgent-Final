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
      getInvoiceItems: vi.fn(),
      createInvoiceItem: vi.fn(),
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
const mockRouter = {
  get: vi.fn().mockReturnThis(),
  post: vi.fn().mockReturnThis(),
  put: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  patch: vi.fn().mockReturnThis(),
  use: vi.fn().mockReturnThis(),
  route: vi.fn().mockReturnThis(),
};

// We need an actual express.Router for the sub-routes that get .use()'d
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

/** Standard mock business hours */
function makeBusinessHours(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    day: 'monday',
    open: '09:00',
    close: '17:00',
    isClosed: false,
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
  // Re-set the hashed password and session store so mocks are clean
  // but sessionStore is preserved across tests
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
// 1. Business Onboarding
// ────────────────────────────────────────────────────────

describe('Business Onboarding', () => {
  describe('POST /api/business', () => {
    it('creates a business and returns 201 with sanitized data', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const newBusiness = makeBusiness();
      mockStorage.createBusiness.mockResolvedValue(newBusiness);
      mockStorage.updateBusiness.mockResolvedValue({
        ...newBusiness,
        subscriptionStatus: 'trialing',
      });

      const res = await agent
        .post('/api/business')
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'Test Barber Shop',
          email: 'shop@test.com',
          phone: '+15551234567',
          industry: 'barber',
          type: 'salon',
          timezone: 'America/New_York',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('name', 'Test Barber Shop');
      expect(res.body).toHaveProperty('provisioning');
      expect(mockStorage.createBusiness).toHaveBeenCalledOnce();
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/business')
        .send({
          name: 'Test Shop',
          email: 'shop@test.com',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/csrf/i);
    });

    it('returns 403 (CSRF) or 401 when not authenticated without valid session', async () => {
      // Without a valid session, the CSRF cookie won't match the header,
      // so the CSRF middleware rejects the request with 403 before auth runs
      const res = await supertest(app)
        .post('/api/business')
        .set('x-csrf-token', 'fake-token')
        .send({
          name: 'Test Shop',
          email: 'shop@test.com',
        });

      // CSRF middleware runs first and rejects with 403
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/business', () => {
    it('returns the current user business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const business = makeBusiness();
      mockStorage.getBusiness.mockResolvedValue(business);

      const res = await agent.get('/api/business');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'Test Barber Shop');
    });

    it('returns 404 when user has no business', async () => {
      const user = makeUser({ businessId: null });
      mockStorage.getUserByUsername.mockResolvedValue(undefined);
      mockStorage.getUserByEmail.mockResolvedValue(undefined);
      mockStorage.createUser.mockResolvedValue(user);
      mockStorage.updateUser.mockResolvedValue(user);
      mockStorage.getUser.mockResolvedValue(user);

      const agent = supertest.agent(app);
      await agent.post('/api/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword1!',
      acceptTerms: true,
      acceptPrivacy: true
      });

      const res = await agent.get('/api/business');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('needsBusinessSetup', true);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await supertest(app).get('/api/business');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/business/:id', () => {
    it('updates a business and returns sanitized data', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const updatedBusiness = makeBusiness({ name: 'Updated Barber' });
      mockStorage.updateBusiness.mockResolvedValue(updatedBusiness);

      const res = await agent
        .put('/api/business/1')
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Updated Barber' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'Updated Barber');
      expect(mockStorage.updateBusiness).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'Updated Barber' }),
      );
    });

    it('rejects NaN business ID with 400', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .put('/api/business/abc')
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Updated Barber' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid business id/i);
    });

    it('rejects updates to another business with 403', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      // User belongs to business 1, trying to update business 999
      const res = await agent
        .put('/api/business/999')
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(403);
    });
  });
});

// ────────────────────────────────────────────────────────
// 2. Business Hours
// ────────────────────────────────────────────────────────

describe('Business Hours', () => {
  describe('GET /api/business/:businessId/hours', () => {
    it('returns hours array for the business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const hours = [
        makeBusinessHours({ day: 'monday' }),
        makeBusinessHours({ id: 2, day: 'tuesday' }),
      ];
      mockStorage.getBusinessHours.mockResolvedValue(hours);

      const res = await agent.get('/api/business/1/hours');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('day', 'monday');
    });

    it('rejects access to another business hours with 403', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/business/999/hours');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/business-hours', () => {
    it('creates business hours and returns 201', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const newHours = makeBusinessHours();
      mockStorage.createBusinessHours.mockResolvedValue(newHours);
      mockStorage.getBusiness.mockResolvedValue(makeBusiness());
      mockStorage.getBusinessHours.mockResolvedValue([newHours]);

      const res = await agent
        .post('/api/business-hours')
        .set('x-csrf-token', csrfToken)
        .send({
          businessId: 1,
          day: 'monday',
          open: '09:00',
          close: '17:00',
          isClosed: false,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('day', 'monday');
      expect(res.body).toHaveProperty('open', '09:00');
      expect(mockStorage.createBusinessHours).toHaveBeenCalledOnce();
    });

    it('rejects creating hours for another business with 403', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/business-hours')
        .set('x-csrf-token', csrfToken)
        .send({
          businessId: 999,
          day: 'monday',
          open: '09:00',
          close: '17:00',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/business-hours/:id', () => {
    it('updates business hours', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const updatedHours = makeBusinessHours({ open: '08:00' });
      mockStorage.updateBusinessHours.mockResolvedValue(updatedHours);
      mockStorage.getBusiness.mockResolvedValue(makeBusiness());
      mockStorage.getBusinessHours.mockResolvedValue([updatedHours]);

      const res = await agent
        .put('/api/business-hours/1')
        .set('x-csrf-token', csrfToken)
        .send({ open: '08:00' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('open', '08:00');
    });
  });
});

// ────────────────────────────────────────────────────────
// 3. Services CRUD
// ────────────────────────────────────────────────────────

describe('Services CRUD', () => {
  describe('GET /api/services', () => {
    it('returns services list for the user business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const services = [
        makeService({ id: 1, name: 'Haircut' }),
        makeService({ id: 2, name: 'Beard Trim', price: 15.0 }),
      ];
      mockStorage.getServices.mockResolvedValue(services);

      const res = await agent.get('/api/services');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('name', 'Haircut');
      expect(res.body[1]).toHaveProperty('name', 'Beard Trim');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await supertest(app).get('/api/services');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/services/:id', () => {
    it('returns a single service by ID', async () => {
      const { agent } = await createAuthenticatedAgent();

      const service = makeService();
      mockStorage.getService.mockResolvedValue(service);

      const res = await agent.get('/api/services/1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'Haircut');
      expect(res.body).toHaveProperty('price', 25.0);
    });

    it('returns 404 for service belonging to another business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const service = makeService({ businessId: 999 });
      mockStorage.getService.mockResolvedValue(service);

      const res = await agent.get('/api/services/1');

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN service ID', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/services/abc');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/services', () => {
    it('creates a service and returns 201', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const newService = makeService();
      mockStorage.createService.mockResolvedValue(newService);

      const res = await agent
        .post('/api/services')
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'Haircut',
          price: 25.0,
          duration: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('name', 'Haircut');
      expect(res.body).toHaveProperty('price', 25.0);
      expect(mockStorage.createService).toHaveBeenCalledOnce();
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/services')
        .send({ name: 'Haircut' });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/services/:id', () => {
    it('updates a service owned by the business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeService();
      const updated = makeService({ name: 'Premium Haircut', price: 35.0 });
      mockStorage.getService.mockResolvedValue(existing);
      mockStorage.updateService.mockResolvedValue(updated);

      const res = await agent
        .put('/api/services/1')
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Premium Haircut', price: 35.0 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'Premium Haircut');
      expect(res.body).toHaveProperty('price', 35.0);
    });

    it('returns 404 for service belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeService({ businessId: 999 });
      mockStorage.getService.mockResolvedValue(existing);

      const res = await agent
        .put('/api/services/1')
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/services/:id', () => {
    it('deletes a service and returns 204', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeService();
      mockStorage.getService.mockResolvedValue(existing);
      mockStorage.deleteService.mockResolvedValue(undefined);

      const res = await agent
        .delete('/api/services/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(204);
      expect(mockStorage.deleteService).toHaveBeenCalledWith(1, 1);
    });

    it('returns 404 for service belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeService({ businessId: 999 });
      mockStorage.getService.mockResolvedValue(existing);

      const res = await agent
        .delete('/api/services/1')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.delete('/api/services/1');

      expect(res.status).toBe(403);
    });
  });
});

// ────────────────────────────────────────────────────────
// 4. Customer CRM
// ────────────────────────────────────────────────────────

describe('Customer CRM', () => {
  describe('GET /api/customers', () => {
    it('returns customer list for the business', async () => {
      const { agent } = await createAuthenticatedAgent();

      const customers = [
        makeCustomer({ id: 1, firstName: 'Jane' }),
        makeCustomer({ id: 2, firstName: 'John', lastName: 'Smith' }),
      ];
      mockStorage.getCustomers.mockResolvedValue(customers);

      const res = await agent.get('/api/customers');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('firstName', 'Jane');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await supertest(app).get('/api/customers');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/customers/:id', () => {
    it('returns a single customer', async () => {
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

    it('returns 400 for NaN customer ID', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.get('/api/customers/abc');

      expect(res.status).toBe(400);
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
      expect(mockStorage.createCustomer).toHaveBeenCalledOnce();
      // Verify businessId was auto-set from session
      expect(mockStorage.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 1 }),
      );
    });

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent
        .post('/api/customers')
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+15559876543',
        });

      expect(res.status).toBe(403);
    });

    it('returns 403 (CSRF) when not authenticated without valid session', async () => {
      // Without a valid session, the CSRF cookie won't match the header,
      // so the CSRF middleware rejects the request with 403 before auth runs
      const res = await supertest(app)
        .post('/api/customers')
        .set('x-csrf-token', 'fake-token')
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+15559876543',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/customers/:id', () => {
    it('updates customer fields (smsOptIn, tags)', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeCustomer();
      const updated = makeCustomer({
        smsOptIn: true,
        tags: '["VIP"]',
      });
      mockStorage.getCustomer.mockResolvedValue(existing);
      mockStorage.updateCustomer.mockResolvedValue(updated);

      const res = await agent
        .put('/api/customers/1')
        .set('x-csrf-token', csrfToken)
        .send({ smsOptIn: true, tags: '["VIP"]' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('smsOptIn', true);
      expect(res.body).toHaveProperty('tags', '["VIP"]');
    });

    it('returns 404 for customer belonging to another business', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const existing = makeCustomer({ businessId: 999 });
      mockStorage.getCustomer.mockResolvedValue(existing);

      const res = await agent
        .put('/api/customers/1')
        .set('x-csrf-token', csrfToken)
        .send({ firstName: 'Hacked' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for NaN customer ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .put('/api/customers/abc')
        .set('x-csrf-token', csrfToken)
        .send({ firstName: 'Test' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/customers/:id', () => {
    it('deletes a customer and returns 204', async () => {
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

    it('returns 403 without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const res = await agent.delete('/api/customers/1');

      expect(res.status).toBe(403);
    });

    it('returns 400 for NaN customer ID', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .delete('/api/customers/abc')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(400);
    });
  });
});

// ────────────────────────────────────────────────────────
// 5. Full Onboarding Flow (end-to-end)
// ────────────────────────────────────────────────────────

describe('Full Onboarding Flow', () => {
  it('register -> create business -> add hours -> add service -> add customer', async () => {
    // Step 1: Register a user
    const user = makeUser({ businessId: null });
    mockStorage.getUserByUsername.mockResolvedValue(undefined);
    mockStorage.getUserByEmail.mockResolvedValue(undefined);
    mockStorage.createUser.mockResolvedValue(user);
    mockStorage.updateUser.mockResolvedValue(user);
    mockStorage.getUser.mockResolvedValue(user);

    const agent = supertest.agent(app);

    const regRes = await agent.post('/api/register').send({
      username: 'onboarduser',
      email: 'onboard@example.com',
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

    // Step 2: Create a business
    const business = makeBusiness({ id: 10 });
    mockStorage.createBusiness.mockResolvedValue(business);
    mockStorage.updateBusiness.mockResolvedValue(business);
    // After creating business, update user mock to have businessId
    const userWithBusiness = makeUser({ businessId: 10 });
    mockStorage.updateUser.mockResolvedValue(userWithBusiness);
    // Subsequent getUser calls should return user with businessId
    mockStorage.getUser.mockResolvedValue(userWithBusiness);
    mockStorage.getBusiness.mockResolvedValue(business);
    mockStorage.getServices.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([]);
    mockStorage.getCustomers.mockResolvedValue([]);
    mockStorage.getBusinessHours.mockResolvedValue([]);
    mockStorage.getAllAgentSettings.mockResolvedValue([]);

    const bizRes = await agent
      .post('/api/business')
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Onboarding Barbershop',
        email: 'onboard@shop.com',
        phone: '+15551112222',
        industry: 'barber',
        type: 'salon',
      });
    expect(bizRes.status).toBe(201);
    expect(bizRes.body).toHaveProperty('name', 'Test Barber Shop');

    // Step 3: Add business hours
    const hours = makeBusinessHours({ businessId: 10 });
    mockStorage.createBusinessHours.mockResolvedValue(hours);
    mockStorage.getBusinessHours.mockResolvedValue([hours]);

    const hoursRes = await agent
      .post('/api/business-hours')
      .set('x-csrf-token', csrfToken)
      .send({
        businessId: 10,
        day: 'monday',
        open: '09:00',
        close: '17:00',
        isClosed: false,
      });
    expect(hoursRes.status).toBe(201);
    expect(hoursRes.body).toHaveProperty('day', 'monday');

    // Step 4: Add a service
    const service = makeService({ businessId: 10 });
    mockStorage.createService.mockResolvedValue(service);

    const svcRes = await agent
      .post('/api/services')
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Haircut',
        price: 25.0,
        duration: 30,
      });
    expect(svcRes.status).toBe(201);
    expect(svcRes.body).toHaveProperty('name', 'Haircut');

    // Step 5: Add a customer
    const customer = makeCustomer({ businessId: 10 });
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
    expect(custRes.body).toHaveProperty('firstName', 'Jane');
  });
});

// ────────────────────────────────────────────────────────
// 6. CSRF enforcement on business/service/customer endpoints
// ────────────────────────────────────────────────────────

describe('CSRF enforcement', () => {
  it('blocks POST /api/business without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .post('/api/business')
      .send({ name: 'Test', email: 'x@x.com' });

    expect(res.status).toBe(403);
  });

  it('blocks PUT /api/business/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .put('/api/business/1')
      .send({ name: 'Updated' });

    expect(res.status).toBe(403);
  });

  it('blocks POST /api/services without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .post('/api/services')
      .send({ name: 'Haircut' });

    expect(res.status).toBe(403);
  });

  it('blocks DELETE /api/services/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.delete('/api/services/1');

    expect(res.status).toBe(403);
  });

  it('blocks POST /api/customers without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent
      .post('/api/customers')
      .send({ firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' });

    expect(res.status).toBe(403);
  });

  it('blocks DELETE /api/customers/:id without CSRF token', async () => {
    const { agent } = await createAuthenticatedAgent();

    const res = await agent.delete('/api/customers/1');

    expect(res.status).toBe(403);
  });
});
