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
  // We cannot call `new MemoryStore()` inside vi.hoisted (it runs
  // before imports), so we'll assign it in beforeAll instead.
  return {
    mockStorage: {
      getUserByUsername: vi.fn(),
      getUserByEmail: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      getUser: vi.fn(),
      updateUserLastLogin: vi.fn(),
      createPasswordResetToken: vi.fn(),
      getPasswordResetToken: vi.fn(),
      markPasswordResetTokenUsed: vi.fn(),
      getBusiness: vi.fn(),
      hasBusinessAccess: vi.fn(),
      sessionStore: null as any, // set in beforeAll
    },
  };
});

vi.mock('../storage', () => ({ storage: mockStorage }));

vi.mock('../db', () => ({
  db: {},
  pool: {
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  },
}));

vi.mock('../emailService', () => ({
  sendVerificationCodeEmail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
}));

vi.mock('../services/schedulerService', () => ({
  default: { startAllSchedulers: vi.fn(), stopAllSchedulers: vi.fn() },
  startAllSchedulers: vi.fn(),
  stopAllSchedulers: vi.fn(),
}));

// ────────────────────────────────────────────────────────
// Auth import (after mocks)
// ────────────────────────────────────────────────────────

import { setupAuth, hashPassword } from '../auth';

// ────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────

let app: express.Express;
let hashedTestPassword: string;

/** Standard mock user returned by storage */
function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password: hashedTestPassword,
    role: 'user',
    businessId: null,
    active: true,
    emailVerified: false,
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

/** Build the lightweight Express app that mirrors production auth stack */
function createTestApp() {
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

  // Auth routes (passport, login, register, verify-email, etc.)
  setupAuth(testApp);

  // A dummy CSRF-protected endpoint to verify CSRF enforcement
  testApp.post('/api/customers', (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    res.json({ id: 1, ...req.body });
  });

  return testApp;
}

// ────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────

beforeAll(async () => {
  hashedTestPassword = await hashPassword('TestPassword1!');
  mockStorage.sessionStore = new session.MemoryStore();
  app = createTestApp();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────
// 1. Registration
// ────────────────────────────────────────────────────────

describe('POST /api/register', () => {
  it('registers a new user and returns 201 without password', async () => {
    const newUser = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(undefined);
    mockStorage.getUserByEmail.mockResolvedValue(undefined);
    mockStorage.createUser.mockResolvedValue(newUser);
    mockStorage.updateUser.mockResolvedValue(newUser);
    // getUser for deserializeUser during req.login
    mockStorage.getUser.mockResolvedValue(newUser);

    const res = await supertest(app)
      .post('/api/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword1!',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('username', 'testuser');
    expect(res.body).toHaveProperty('email', 'test@example.com');
    expect(res.body).not.toHaveProperty('password');
    expect(mockStorage.createUser).toHaveBeenCalledOnce();
  });

  it('rejects weak passwords with 400 and error details', async () => {
    const res = await supertest(app)
      .post('/api/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'weak',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('details');
    expect(res.body.details.length).toBeGreaterThan(0);
    expect(mockStorage.createUser).not.toHaveBeenCalled();
  });

  it('rejects duplicate username with 400', async () => {
    mockStorage.getUserByUsername.mockResolvedValue(makeUser());

    const res = await supertest(app)
      .post('/api/register')
      .send({
        username: 'testuser',
        email: 'new@example.com',
        password: 'TestPassword1!',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username already exists/i);
    expect(mockStorage.createUser).not.toHaveBeenCalled();
  });

  it('rejects duplicate email with 400', async () => {
    mockStorage.getUserByUsername.mockResolvedValue(undefined);
    mockStorage.getUserByEmail.mockResolvedValue(makeUser());

    const res = await supertest(app)
      .post('/api/register')
      .send({
        username: 'newuser',
        email: 'test@example.com',
        password: 'TestPassword1!',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email already in use/i);
    expect(mockStorage.createUser).not.toHaveBeenCalled();
  });

  it('auto-logs in the user after registration (session set)', async () => {
    const newUser = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(undefined);
    mockStorage.getUserByEmail.mockResolvedValue(undefined);
    mockStorage.createUser.mockResolvedValue(newUser);
    mockStorage.updateUser.mockResolvedValue(newUser);
    mockStorage.getUser.mockResolvedValue(newUser);

    const agent = supertest.agent(app);

    // Register
    const regRes = await agent
      .post('/api/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword1!',
      });

    expect(regRes.status).toBe(201);

    // The session cookie should allow GET /api/user to succeed
    const userRes = await agent.get('/api/user');
    expect(userRes.status).toBe(200);
    expect(userRes.body).toHaveProperty('username', 'testuser');
    expect(userRes.body).not.toHaveProperty('password');
  });
});

// ────────────────────────────────────────────────────────
// 2. Email Verification
// ────────────────────────────────────────────────────────

describe('POST /api/verify-email', () => {
  it('verifies email with the correct code', async () => {
    const user = makeUser({
      emailVerified: false,
      emailVerificationCode: '123456',
      emailVerificationExpiry: new Date(Date.now() + 30 * 60 * 1000),
    });
    mockStorage.getUserByEmail.mockResolvedValue(user);
    mockStorage.updateUser.mockResolvedValue({ ...user, emailVerified: true });

    const res = await supertest(app)
      .post('/api/verify-email')
      .send({ email: 'test@example.com', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockStorage.updateUser).toHaveBeenCalledWith(user.id, {
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiry: null,
    });
  });

  it('rejects wrong verification code with 400', async () => {
    const user = makeUser({
      emailVerified: false,
      emailVerificationCode: '123456',
      emailVerificationExpiry: new Date(Date.now() + 30 * 60 * 1000),
    });
    mockStorage.getUserByEmail.mockResolvedValue(user);

    const res = await supertest(app)
      .post('/api/verify-email')
      .send({ email: 'test@example.com', code: '999999' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid verification code/i);
    expect(mockStorage.updateUser).not.toHaveBeenCalled();
  });

  it('rejects expired verification code with 400', async () => {
    const user = makeUser({
      emailVerified: false,
      emailVerificationCode: '123456',
      emailVerificationExpiry: new Date(Date.now() - 1000), // expired
    });
    mockStorage.getUserByEmail.mockResolvedValue(user);

    const res = await supertest(app)
      .post('/api/verify-email')
      .send({ email: 'test@example.com', code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
    expect(mockStorage.updateUser).not.toHaveBeenCalled();
  });
});

describe('POST /api/resend-verification', () => {
  it('sends a new verification code and returns 200', async () => {
    const user = makeUser({ emailVerified: false });
    mockStorage.getUserByEmail.mockResolvedValue(user);
    mockStorage.updateUser.mockResolvedValue(user);

    const { sendVerificationCodeEmail } = await import('../emailService');

    const res = await supertest(app)
      .post('/api/resend-verification')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({
        emailVerificationCode: expect.any(String),
        emailVerificationExpiry: expect.any(Date),
      }),
    );
    expect(sendVerificationCodeEmail).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────
// 3. Login
// ────────────────────────────────────────────────────────

describe('POST /api/login', () => {
  it('logs in with correct credentials and returns user', async () => {
    const user = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(user);
    mockStorage.updateUserLastLogin.mockResolvedValue(user);
    mockStorage.getUser.mockResolvedValue(user);

    const res = await supertest(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'TestPassword1!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username', 'testuser');
    expect(res.body).not.toHaveProperty('password');
  });

  it('rejects wrong password with 401', async () => {
    const user = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(user);

    const res = await supertest(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid username or password/i);
  });

  it('rejects nonexistent user with 401', async () => {
    mockStorage.getUserByUsername.mockResolvedValue(undefined);
    mockStorage.getUserByEmail.mockResolvedValue(undefined);

    const res = await supertest(app)
      .post('/api/login')
      .send({ username: 'nobody', password: 'TestPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid username or password/i);
  });
});

// ────────────────────────────────────────────────────────
// 4. Session (/api/user, /api/logout)
// ────────────────────────────────────────────────────────

describe('GET /api/user', () => {
  it('returns 200 with user data when authenticated', async () => {
    const user = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(user);
    mockStorage.updateUserLastLogin.mockResolvedValue(user);
    mockStorage.getUser.mockResolvedValue(user);

    const agent = supertest.agent(app);

    // Login first
    await agent
      .post('/api/login')
      .send({ username: 'testuser', password: 'TestPassword1!' });

    // Now hit /api/user
    const res = await agent.get('/api/user');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username', 'testuser');
    expect(res.body).not.toHaveProperty('password');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await supertest(app).get('/api/user');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/logout', () => {
  it('logs out and subsequent /api/user returns 401', async () => {
    const user = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(user);
    mockStorage.updateUserLastLogin.mockResolvedValue(user);
    mockStorage.getUser.mockResolvedValue(user);

    const agent = supertest.agent(app);

    // Login
    await agent
      .post('/api/login')
      .send({ username: 'testuser', password: 'TestPassword1!' });

    // Confirm logged in
    const authed = await agent.get('/api/user');
    expect(authed.status).toBe(200);

    // Logout
    const logoutRes = await agent.post('/api/logout');
    expect(logoutRes.status).toBe(200);

    // Subsequent request should be unauthenticated
    const afterLogout = await agent.get('/api/user');
    expect(afterLogout.status).toBe(401);
  });
});

// ────────────────────────────────────────────────────────
// 5. CSRF Protection
// ────────────────────────────────────────────────────────

describe('CSRF protection', () => {
  it('blocks CSRF-protected POST without token (403)', async () => {
    const user = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(user);
    mockStorage.updateUserLastLogin.mockResolvedValue(user);
    mockStorage.getUser.mockResolvedValue(user);

    const agent = supertest.agent(app);

    // Login (exempt from CSRF)
    await agent
      .post('/api/login')
      .send({ username: 'testuser', password: 'TestPassword1!' });

    // POST /api/customers is CSRF-protected — without CSRF header it should fail
    const res = await agent
      .post('/api/customers')
      .send({ firstName: 'Jane' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/csrf/i);
  });

  it('allows CSRF-protected POST when token is provided', async () => {
    const user = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(user);
    mockStorage.updateUserLastLogin.mockResolvedValue(user);
    mockStorage.getUser.mockResolvedValue(user);

    const agent = supertest.agent(app);

    // Login (CSRF-exempt, also sets csrf-token cookie)
    const loginRes = await agent
      .post('/api/login')
      .send({ username: 'testuser', password: 'TestPassword1!' });

    // Extract the csrf-token cookie from login response
    const cookies: string[] = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie']
      : [loginRes.headers['set-cookie']].filter(Boolean);
    let csrfToken = '';
    for (const cookie of cookies) {
      const match = cookie.match(/csrf-token=([^;]+)/);
      if (match) {
        csrfToken = match[1];
        break;
      }
    }

    // If no CSRF token from login, make a GET to trigger one
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

    // Now POST with the CSRF token header
    const res = await agent
      .post('/api/customers')
      .set('x-csrf-token', csrfToken)
      .send({ firstName: 'Jane' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('firstName', 'Jane');
  });

  it('allows CSRF-exempt endpoints without token (register)', async () => {
    const newUser = makeUser();
    mockStorage.getUserByUsername.mockResolvedValue(undefined);
    mockStorage.getUserByEmail.mockResolvedValue(undefined);
    mockStorage.createUser.mockResolvedValue(newUser);
    mockStorage.updateUser.mockResolvedValue(newUser);
    mockStorage.getUser.mockResolvedValue(newUser);

    // No CSRF header, register should still work
    const res = await supertest(app)
      .post('/api/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword1!',
      });

    expect(res.status).toBe(201);
  });
});
