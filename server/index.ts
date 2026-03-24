import "dotenv/config";
import * as Sentry from "@sentry/node";

// Initialize Sentry BEFORE importing other modules
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    sendDefaultPii: false,
  });
  console.log("✅ Sentry initialized for server error tracking");
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seed } from "./seed";
import runMigrations from "./migrations/runMigrations";
import schedulerService from "./services/schedulerService";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import compression from "compression";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { pool } from "./db";

/**
 * ===========================================
 * ENVIRONMENT VALIDATION
 * ===========================================
 * Fail fast if critical environment variables are missing
 */
function validateEnvironment() {
  const required = [
    'DATABASE_URL',
    'SESSION_SECRET',
  ];

  const recommended = [
    'BASE_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'VAPI_API_KEY',
  ];

  // In production, BASE_URL is critical for webhooks, password reset links, etc.
  if (process.env.NODE_ENV === 'production' && !process.env.BASE_URL && !process.env.APP_URL) {
    console.error('⚠️  CRITICAL WARNING: BASE_URL not set in production!');
    console.error('   Password reset, invoice sharing, Twilio webhooks will NOT work.');
    console.error('   Set BASE_URL to your public URL (e.g., https://your-app.railway.app)');
  }

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ CRITICAL: Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }

  // Check for weak/default secrets
  if (process.env.SESSION_SECRET === 'dev-only-secret-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL: Cannot use default SESSION_SECRET in production');
      process.exit(1);
    } else {
      console.warn('⚠️  WARNING: Using default SESSION_SECRET - change this for production');
    }
  }

  const missingRecommended = recommended.filter(key => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn('⚠️  WARNING: Missing recommended environment variables:', missingRecommended.join(', '));
    console.warn('   Some features may not work correctly.');
  }

  // Calendar integration validation
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const googleRedirect = process.env.GOOGLE_REDIRECT_URI ||
      (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/calendar/google/callback` : null);
    if (!googleRedirect || googleRedirect.startsWith('/')) {
      console.warn('⚠️  WARNING: GOOGLE_REDIRECT_URI is not an absolute URL. Google Calendar OAuth will fail.');
      console.warn('   Set GOOGLE_REDIRECT_URI or APP_URL to your public URL.');
    } else {
      console.log(`✅ Google Calendar: redirect URI = ${googleRedirect}`);
    }
  }
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    const msRedirect = process.env.MICROSOFT_REDIRECT_URI ||
      (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/calendar/microsoft/callback` : null);
    if (!msRedirect || msRedirect.startsWith('/')) {
      console.warn('⚠️  WARNING: MICROSOFT_REDIRECT_URI is not an absolute URL. Microsoft Calendar OAuth will fail.');
      console.warn('   Set MICROSOFT_REDIRECT_URI or APP_URL to your public URL.');
    } else {
      console.log(`✅ Microsoft Calendar: redirect URI = ${msRedirect}`);
    }
  }

  // Encryption key validation (needed for calendar token storage)
  if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: ENCRYPTION_KEY not set. Calendar tokens will not be securely encrypted.');
  }

  console.log('✅ Environment validation passed');
}

// Validate environment on startup
validateEnvironment();

const app = express();

// Trust proxy for Railway/Heroku/etc (needed for secure cookies over HTTPS)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

/**
 * ===========================================
 * SECURITY MIDDLEWARE
 * ===========================================
 */

// Helmet - Security headers (CSP, X-Frame-Options, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://maps.googleapis.com", "https://browser.sentry-cdn.com", "https://challenges.cloudflare.com", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://api.vapi.ai", "https://maps.googleapis.com", "wss:", "https://*.sentry.io", "https://*.ingest.sentry.io", "https://www.google-analytics.com", "https://analytics.google.com", "https://*.google-analytics.com", "https://*.analytics.google.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://challenges.cloudflare.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some external resources
}));

// Allow embedding booking pages in iframes on external websites
app.use('/book', (_req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors https: http://localhost:*");
  next();
});

// Allow generated websites to be previewed in dashboard iframe and embed booking
app.use('/sites', (_req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https: http://localhost:*");
  next();
});

// CORS - Configure allowed origins
// In production, BASE_URL / APP_URL should be set to your Railway custom domain
// localhost entries only used in development (see CORS handler below)
const allowedOrigins = [
  process.env.BASE_URL,
  process.env.APP_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
  // Derive www/bare domain variants from APP_URL for Cloudflare redirect compatibility
  ...(process.env.APP_URL ? [
    process.env.APP_URL.replace('://www.', '://'),   // bare domain variant
    process.env.APP_URL.replace('://', '://www.'),    // www variant
  ] : []),
  process.env.NODE_ENV !== 'production' ? 'http://localhost:5000' : null,
  process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : null,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, allow any localhost origin
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
}));

// Rate limiting - General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 minutes per IP
  message: { message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for webhooks (they have their own validation)
    return req.path.startsWith('/webhook') || req.path.startsWith('/twilio') || req.path.startsWith('/vapi');
  },
});

// Stricter rate limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login attempts per 15 minutes
  message: { message: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters
app.use('/api/', generalLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/forgot-password', authLimiter);
app.use('/api/reset-password', authLimiter);

// Stripe needs the raw body for webhook signature verification
// This MUST come BEFORE express.json() so the body isn't parsed
app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }));
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Compression - gzip responses for faster page loads
app.use(compression());

/**
 * CSRF Protection (Double-Submit Cookie Pattern)
 *
 * How it works:
 * 1. Server sets a `csrf-token` cookie with a random token on every response
 * 2. Client reads the cookie and sends the value as `X-CSRF-Token` header
 * 3. Server verifies cookie value === header value on state-changing requests
 *
 * This works because:
 * - A cross-site attacker can trigger requests that include cookies, but
 *   cannot read them (same-origin policy) to set the header
 * - CORS prevents cross-origin JS from reading the cookie value
 */
app.use((req, res, next) => {
  // Set the CSRF cookie if not already present
  if (!req.cookies?.['csrf-token']) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf-token', token, {
      httpOnly: false, // Client JS needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }

  // Skip CSRF check for safe methods and specific paths
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
    '/api/vapi/',
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

  // Validate CSRF token on state-changing requests
  const cookieToken = req.cookies?.['csrf-token'];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Run database migrations first
    await runMigrations();

    // Seed the database with initial data
    await seed();

    // Initialize Mem0 persistent memory (optional — graceful if API key not set)
    try {
      const { initMem0 } = await import('./services/mem0Service');
      initMem0();
    } catch (err) {
      console.warn('[Mem0] Init failed (non-fatal):', err);
    }

    // Initialize LangGraph agent state machine (optional — falls back to switch/case orchestration)
    try {
      const { initAgentGraph } = await import('./services/agentGraph');
      await initAgentGraph();
    } catch (err) {
      console.warn('[AgentGraph] Init failed (non-fatal) — orchestrator will use fallback:', err);
    }

    // Initialize Reply Intelligence Graph (SMS inbound AI — optional, falls back to existing router)
    try {
      const { initReplyIntelligenceGraph } = await import('./services/replyIntelligenceGraph');
      await initReplyIntelligenceGraph();
    } catch (err) {
      console.warn('[ReplyGraph] Init failed (non-fatal) — SMS replies will use existing router:', err);
    }

    // Health check endpoints (before auth middleware)
    app.get('/health', async (_req, res) => {
      try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        res.status(200).json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: 'Database connection failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    app.get('/health/live', (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      if (status >= 500) {
        console.error('Server error:', err);
        // Report 5xx errors to Sentry
        Sentry.captureException(err);
      }

      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Use PORT from environment (Railway sets this) or default to 5000 for local dev
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);

      // Start the reminder scheduler after server is running
      (async () => {
        try {
          await schedulerService.startAllSchedulers();
          log('Reminder schedulers started');
        } catch (schedulerErr) {
          console.error('Failed to start schedulers (non-fatal):', schedulerErr);
        }
      })();
    });
    // Graceful shutdown — wait for server.close() before exiting
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return; // Prevent double-shutdown
      isShuttingDown = true;
      console.log(`${signal} received. Starting graceful shutdown...`);

      // Force exit after 10 seconds if graceful shutdown stalls
      const forceTimer = setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
      forceTimer.unref(); // Don't keep process alive just for this timer

      schedulerService.stopAllSchedulers();
      console.log('Schedulers stopped');

      // Wait for HTTP server to finish in-flight requests
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('HTTP server closed');
          resolve();
        });
      });

      try {
        await pool.end();
        console.log('Database pool closed');
      } catch (err) {
        console.error('Error closing database pool:', err);
      }

      console.log('Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Server startup error:', error);
    Sentry.captureException(error);
    process.exit(1);
  }
})();
