import "dotenv/config";
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
  if (process.env.NODE_ENV === 'production' && !process.env.BASE_URL) {
    console.error('⚠️  CRITICAL WARNING: BASE_URL not set in production!');
    console.error('   Password reset, invoice sharing, Twilio webhooks will NOT work.');
    console.error('   Set BASE_URL to your Railway URL (e.g., https://web-production-76c5e.up.railway.app)');
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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://maps.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://api.vapi.ai", "https://maps.googleapis.com", "wss:"],
      frameSrc: ["'self'", "https://js.stripe.com"],
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

// CORS - Configure allowed origins
// In production, BASE_URL should be set to your Railway URL
// localhost entries only used in development (see CORS handler below)
const allowedOrigins = [
  process.env.BASE_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting - General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes per IP
  message: { message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for webhooks (they have their own validation)
    return req.path.includes('/webhook') || req.path.includes('/twilio');
  },
});

// Stricter rate limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes
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

// Compression - gzip responses for faster page loads
app.use(compression());

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
      schedulerService.startAllSchedulers();
      log('Reminder schedulers started');
    });
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Starting graceful shutdown...`);

      server.close(() => {
        console.log('HTTP server closed');
      });

      schedulerService.stopAllSchedulers();
      console.log('Schedulers stopped');

      try {
        await pool.end();
        console.log('Database pool closed');
      } catch (err) {
        console.error('Error closing database pool:', err);
      }

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
})();
