/**
 * E2E Test Setup Helper
 *
 * Creates a fully-configured Express app with all middleware and routes
 * attached, without calling .listen(). This allows supertest to make
 * HTTP requests against the real middleware stack (CSRF, sessions, auth,
 * rate limiting) and route handlers.
 *
 * Database operations are mocked via vi.mock() so tests don't need
 * a real PostgreSQL connection.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import crypto from 'crypto';
import type { Server } from 'http';
import { createServer } from 'http';
import supertest from 'supertest';

// Re-export supertest for convenience
export { supertest };

/**
 * Creates a minimal Express app with the same middleware stack as production
 * but WITHOUT Vite, Sentry, Helmet (blocks tests), or schedulers.
 */
export function createTestApp() {
  const app = express();

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // CSRF middleware (matches production in server/index.ts)
  app.use((req, res, next) => {
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
      '/api/stripe-webhook',
      '/api/subscription/webhook',
      '/api/twilio/',
      '/api/retell/',
      '/api/clover-webhook',
      '/api/square-webhook',
      '/api/config/public',
      '/health',
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

  return app;
}

/**
 * Helper: Extract CSRF token from response cookies, then use it in subsequent requests.
 * Supertest doesn't automatically manage cookies, so we need to extract and replay them.
 */
export function extractCsrfToken(res: supertest.Response): string {
  const cookies = res.headers['set-cookie'];
  if (!cookies) return '';

  const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
  for (const cookie of cookieArray) {
    const match = cookie.match(/csrf-token=([^;]+)/);
    if (match) return match[1];
  }
  return '';
}

/**
 * Helper: Extract all cookies from a response as a string for replay.
 */
export function extractCookies(res: supertest.Response): string {
  const cookies = res.headers['set-cookie'];
  if (!cookies) return '';

  const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
  return cookieArray
    .map((c: string) => c.split(';')[0])
    .join('; ');
}

/**
 * Helper: Create an authenticated agent that maintains cookies across requests.
 * This simulates a real browser session.
 */
export function createAgent(server: Server) {
  return supertest.agent(server);
}

/**
 * Standard test user data that meets password requirements.
 */
export const TEST_USER = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPassword1!',
};

export const TEST_ADMIN = {
  username: 'admin',
  email: 'admin@example.com',
  password: 'AdminPassword1!',
  role: 'admin',
};

/**
 * Standard test business data.
 */
export const TEST_BUSINESS = {
  id: 1,
  name: 'Test Barber Shop',
  industry: 'barber',
  type: 'salon',
  phone: '+15551234567',
  timezone: 'America/New_York',
  bookingSlug: 'test-barber',
  bookingEnabled: true,
};
