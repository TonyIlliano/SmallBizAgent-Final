import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import { scrypt, randomBytes, timingSafeEqual, randomInt, createHash } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User, InsertUser } from "@shared/schema";
import { sendPasswordResetEmail, sendVerificationCodeEmail } from "./emailService";
import { getUserPermissions } from './middleware/permissions';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { pool } from './db';
import jwt from 'jsonwebtoken';

// JWT secret — reuse SESSION_SECRET. NEVER fall back to a hardcoded value.
// SECURITY: A hardcoded fallback would allow any attacker with knowledge of the
// default string to forge tokens. We refuse to sign or verify tokens if the
// secret is missing or matches any known dev string.
const KNOWN_WEAK_SECRETS = new Set([
  'dev-only-jwt-secret',
  'dev-only-secret-change-in-production',
  'changeme',
  'secret',
]);

function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16 || KNOWN_WEAK_SECRETS.has(secret)) {
    throw new Error(
      'SESSION_SECRET is not configured or is using a known weak/default value. ' +
      'Set SESSION_SECRET to a strong random string (32+ chars) before using JWT tokens.'
    );
  }
  return secret;
}
const JWT_EXPIRES_IN = '30d'; // Mobile tokens last 30 days

/** Sign a JWT for mobile auth */
export function signMobileToken(payload: { userId: number; businessId: number | null; role: string }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN, issuer: 'smallbizagent' });
}

/** Verify and decode a JWT mobile token */
export function verifyMobileToken(token: string): { userId: number; businessId: number | null; role: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { issuer: 'smallbizagent' }) as any;
    return { userId: decoded.userId, businessId: decoded.businessId, role: decoded.role };
  } catch {
    return null;
  }
}

/** Middleware: authenticate via JWT Bearer token (for mobile app) */
export async function authenticateJwt(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer jwt_')) {
    return res.status(401).json({ error: 'Invalid or missing JWT token' });
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const decoded = verifyMobileToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Fetch the full user from DB
  const user = await storage.getUser(decoded.userId);
  if (!user || user.active === false) {
    return res.status(401).json({ error: 'User not found or disabled' });
  }

  // Attach user to request (same shape as session auth)
  (req as any).user = user;
  (req as any).isAuthenticated = () => true;
  next();
}

declare module 'express-session' {
  interface SessionData {
    pending2FA?: { userId: number; timestamp: number };
    onboarding?: {
      selectedPlanId?: number;
      promoCode?: string;
    };
    impersonating?: {
      businessId: number;
      businessName: string;
      originalBusinessId: number;
    };
    userAgent?: string;
    ip?: string;
    lastActive?: string;
  }
}

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      email: string;
      password: string;
      role: string | null;
      businessId: number | null;
      active: boolean | null;
      emailVerified: boolean | null;
      emailVerificationCode: string | null;
      emailVerificationExpiry: Date | null;
      twoFactorSecret: string | null;
      twoFactorEnabled: boolean | null;
      twoFactorBackupCodes: string | null;
      lastLogin: Date | null;
      createdAt: Date | null;
      updatedAt: Date | null;
      impersonating?: {
        businessId: number;
        businessName: string;
        originalBusinessId: number;
      };
    }
  }
}

// Extended request type for API key authentication
export interface ApiKeyRequest extends Request {
  apiKeyAuth?: boolean;
  apiKeyBusinessId?: number;
  apiKeyBusinessName?: string;
}

// Convert callback-based scrypt to Promise-based
const scryptAsync = promisify(scrypt);

/**
 * ===========================================
 * PASSWORD SECURITY REQUIREMENTS
 * ===========================================
 * Enforces strong password policy:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < 12) {
    errors.push("Password must be at least 12 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;':\",./<>?)");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Hash a password with a salt
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// Compare a supplied password to a stored hashed password
export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  try {
    // Check if the stored password has the expected format (hash.salt)
    if (!stored || !stored.includes('.')) {
      console.error('Invalid stored password format');
      return false;
    }
    
    const [hashed, salt] = stored.split(".");
    
    // Validate that both hash and salt exist and are valid hex
    if (!hashed || !salt) {
      console.error('Missing hash or salt component');
      return false;
    }
    
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    
    // Ensure both buffers have the same length
    if (hashedBuf.length !== suppliedBuf.length) {
      console.error(`Buffer length mismatch: ${hashedBuf.length} vs ${suppliedBuf.length}`);
      return false;
    }
    
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;
  }
}

// Set up authentication middleware
export function setupAuth(app: Express) {
  // Validate session secret in production
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  // Create session options
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret || "dev-only-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
    store: storage.sessionStore,
  };

  // Set up session middleware
  app.use(session(sessionSettings));

  // Initialize passport and session
  app.use(passport.initialize());
  app.use(passport.session());

  // Impersonation middleware: override businessId for impersonating admins
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const impersonating = req.session?.impersonating;
    if (impersonating && req.user && req.user.role === 'admin') {
      req.user.businessId = impersonating.businessId;
      req.user.impersonating = impersonating;
    }
    next();
  });

  // Configure passport to use local strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Try username first, then fall back to email lookup
        let user = await storage.getUserByUsername(username.toLowerCase());
        if (!user) {
          user = await storage.getUserByEmail(username.toLowerCase());
        }
        if (!user) {
          console.log(`[Auth] Login failed: no user found for "${username.toLowerCase()}"`);
          return done(null, false);
        }
        const passwordMatch = await comparePasswords(password, user.password);
        if (!passwordMatch) {
          console.log(`[Auth] Login failed: wrong password for user "${user.username}" (id=${user.id}, email=${user.email})`);
          return done(null, false);
        }
        // Update last login time
        await storage.updateUserLastLogin(user.id);
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Setup API routes for authentication
  app.post("/api/register", async (req, res, next) => {
    try {
      // Verify Turnstile token (skip if not configured)
      const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
      if (turnstileSecret && req.body.turnstileToken) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret: turnstileSecret,
              response: req.body.turnstileToken,
              remoteip: req.headers['x-forwarded-for'] || req.ip,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const turnstileData = await turnstileRes.json() as { success: boolean; 'error-codes'?: string[] };
          if (!turnstileData.success) {
            console.warn('[Auth] Registration turnstile failed:', turnstileData['error-codes']);
            return res.status(403).json({ error: 'CAPTCHA verification failed. Please try again.' });
          }
        } catch (err: any) {
          console.error('[Auth] Registration turnstile error (allowing):', err.message || err);
        }
      }

      // Validate password strength
      const passwordValidation = validatePassword(req.body.password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: "Password does not meet security requirements",
          details: passwordValidation.errors
        });
      }

      // SECURITY/LEGAL: Require Terms of Service + Privacy Policy acceptance
      // Required for Stripe Connect, Twilio A2P 10DLC, CAN-SPAM, and general SaaS consent.
      if (!req.body.acceptTerms || !req.body.acceptPrivacy) {
        return res.status(400).json({
          error: "You must accept the Terms of Service and Privacy Policy to create an account.",
        });
      }

      // Normalize username to lowercase for case-insensitive login
      const normalizedUsername = req.body.username.toLowerCase();

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(normalizedUsername);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use" });
      }

      // Create new user with hashed password
      // SECURITY: Only pick safe fields from req.body — never spread req.body directly
      // to prevent privilege escalation (e.g., setting role: "admin" or businessId)
      const hashedPassword = await hashPassword(req.body.password);
      const now = new Date();
      const tosVersion = process.env.TOS_VERSION || '2026-04-16';
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';

      const userData: InsertUser = {
        username: normalizedUsername,
        email: req.body.email,
        password: hashedPassword,
        role: 'user', // Always force 'user' role for public registration
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        tosVersion,
        termsAcceptedIp: clientIp,
      } as InsertUser;

      const user = await storage.createUser(userData);

      // Generate 6-digit verification code
      const verificationCode = randomInt(100000, 999999).toString();
      const verificationExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes (gives time for spam folder checks)

      // Save verification code to user record
      await storage.updateUser(user.id, {
        emailVerificationCode: verificationCode,
        emailVerificationExpiry: verificationExpiry,
      });

      // Send verification email (don't block registration if email fails)
      try {
        await sendVerificationCodeEmail(user.email, user.username, verificationCode);
        console.log(`Verification code sent to ${user.email}`);
      } catch (emailError) {
        console.error(`Failed to send verification email to ${user.email}:`, emailError);
      }

      // Regenerate session before login to prevent session fixation
      req.session.regenerate((regenErr) => {
        if (regenErr) return next(regenErr);

        req.login(user, (err) => {
          if (err) return next(err);

          // Store session metadata for device/IP tracking
          req.session.userAgent = req.headers['user-agent'] || '';
          req.session.ip = req.ip || req.headers['x-forwarded-for'] as string || '';
          req.session.lastActive = new Date().toISOString();

          // Don't send the password back to the client
          const { password, ...userWithoutPassword } = user;
          return res.status(201).json(userWithoutPassword);
        });
      });
    } catch (error) {
      next(error);
    }
  });

  // ── Rate Limiters ──────────────────────────────────────────────
  // Login: 10 attempts per 15 minutes per IP (Turnstile also protects, but this is defense-in-depth)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Password reset request: 5 per hour per IP (prevents email bombing)
  const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password reset requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Password reset execution: 5 per 15 minutes per IP (prevents brute-forcing reset tokens)
  const resetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many reset attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // 2FA validation: 5 per 15 minutes per IP (prevents brute-forcing 6-digit TOTP codes)
  const twoFactorLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many two-factor attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Email verification: 5 per 15 minutes per IP
  const verifyEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many verification attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Verify email with 6-digit code
  app.post("/api/verify-email", verifyEmailLimiter, async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: "Email and verification code are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.emailVerified) {
        return res.json({ success: true, message: "Email already verified" });
      }

      if (!user.emailVerificationCode || !user.emailVerificationExpiry) {
        return res.status(400).json({ error: "No verification code found. Please request a new one." });
      }

      if (new Date() > new Date(user.emailVerificationExpiry)) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      if (user.emailVerificationCode !== String(code).trim()) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Mark email as verified and clear the code
      await storage.updateUser(user.id, {
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      });

      return res.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
      console.error("Error verifying email:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Resend verification code
  app.post("/api/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.emailVerified) {
        return res.json({ success: true, message: "Email already verified" });
      }

      // Generate new code
      const verificationCode = randomInt(100000, 999999).toString();
      const verificationExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await storage.updateUser(user.id, {
        emailVerificationCode: verificationCode,
        emailVerificationExpiry: verificationExpiry,
      });

      try {
        await sendVerificationCodeEmail(user.email, user.username, verificationCode);
        console.log(`Resent verification code to ${user.email}`);
      } catch (emailError) {
        console.error(`Failed to resend verification email:`, emailError);
        return res.status(500).json({ error: "Failed to send verification email" });
      }

      return res.json({ success: true, message: "Verification code sent" });
    } catch (error) {
      console.error("Error resending verification:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/login", loginLimiter, async (req, res, next) => {
    // Verify Turnstile token (skip if not configured)
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret && req.body.turnstileToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
        const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: turnstileSecret,
            response: req.body.turnstileToken,
            remoteip: req.headers['x-forwarded-for'] || req.ip,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const turnstileData = await turnstileRes.json() as { success: boolean; 'error-codes'?: string[] };
        if (!turnstileData.success) {
          console.warn('[Auth] Turnstile verification failed:', turnstileData['error-codes']);
          return res.status(403).json({ error: 'CAPTCHA verification failed. Please try again.' });
        }
      } catch (err: any) {
        // If Turnstile API is unreachable or times out, allow login (graceful degradation)
        console.error('[Auth] Turnstile verification error (allowing login):', err.message || err);
      }
    }
    // Note: If turnstileSecret is set but no token provided, still allow login.
    // The captcha widget may not have loaded. Better to allow than to block.

    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message: string }) => {
      if (err) {
        console.error('[Auth] Login passport error:', err);
        return res.status(500).json({ error: "An error occurred during login. Please try again." });
      }
      if (!user) {
        console.log(`[Auth] Login rejected for: "${req.body.username}"`);
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // If user has 2FA enabled, don't complete login yet
      if (user.twoFactorEnabled === true) {
        req.session.pending2FA = { userId: user.id, timestamp: Date.now() };
        req.session.save((err) => {
          if (err) return next(err);
          return res.status(200).json({ requiresTwoFactor: true });
        });
        return;
      }

      // Regenerate session ID to prevent session fixation attacks.
      // The old (pre-login) session ID is destroyed so an attacker who
      // obtained it cannot hijack the now-authenticated session.
      req.session.regenerate((regenErr) => {
        if (regenErr) return next(regenErr);

        req.login(user, (err: Error | null) => {
          if (err) return next(err);

          // Store session metadata for device/IP tracking
          req.session.userAgent = req.headers['user-agent'] || '';
          req.session.ip = req.ip || req.headers['x-forwarded-for'] as string || '';
          req.session.lastActive = new Date().toISOString();

          // Don't send the password back to the client
          const { password, ...userWithoutPassword } = user;
          return res.json(userWithoutPassword);
        });
      });
    })(req, res, next);
  });

  // ── Mobile Login (JWT-based, no session) ──
  app.post("/api/auth/mobile-login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      // Find user by email (the login field is stored as "username" but could be email)
      const user = await storage.getUserByUsername(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Check if account is active
      if (user.active === false) {
        return res.status(403).json({ error: "Account is disabled" });
      }

      // Verify password
      const valid = await comparePasswords(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Check if 2FA is enabled — mobile app needs to handle this
      if (user.twoFactorEnabled) {
        return res.status(200).json({ requiresTwoFactor: true, userId: user.id });
      }

      // Fetch business info
      let business = null;
      if (user.businessId) {
        business = await storage.getBusiness(user.businessId);
      }

      // Sign JWT token (prefix with jwt_ so middleware can identify it)
      const token = 'jwt_' + signMobileToken({
        userId: user.id,
        businessId: user.businessId || null,
        role: user.role || 'user',
      });

      // Update last login
      await storage.updateUser(user.id, { lastLogin: new Date() });

      const { password: _, twoFactorSecret: __, twoFactorBackupCodes: ___, ...safeUser } = user;

      res.json({
        token,
        user: safeUser,
        business: business ? {
          id: business.id,
          name: business.name,
          industry: business.industry,
          timezone: business.timezone,
          phone: business.phone,
          logoUrl: business.logoUrl,
          brandColor: business.brandColor,
        } : null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Auth] Mobile login error:', message);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ── Mobile Token Refresh ──
  app.post("/api/auth/mobile-refresh", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer jwt_')) {
        return res.status(401).json({ error: "No token provided" });
      }

      const token = authHeader.substring(7); // Remove "Bearer "
      const decoded = verifyMobileToken(token);
      if (!decoded) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      // Verify user still exists and is active
      const user = await storage.getUser(decoded.userId);
      if (!user || user.active === false) {
        return res.status(401).json({ error: "User not found or disabled" });
      }

      // Issue fresh token
      const newToken = 'jwt_' + signMobileToken({
        userId: user.id,
        businessId: user.businessId || null,
        role: user.role || 'user',
      });

      res.json({ token: newToken });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Auth] Token refresh error:', message);
      res.status(500).json({ error: "Refresh failed" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err: Error | null) => {
      if (err) {
        return res.status(500).json({ error: "Error during logout" });
      }
      return res.status(200).json({ message: "Logout successful" });
    });
  });

  // ============================================
  // Two-Factor Authentication (2FA) Endpoints
  // ============================================

  // POST /api/2fa/setup - Generate TOTP secret and QR code
  app.post("/api/2fa/setup", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user!;

      const totp = new OTPAuth.TOTP({
        issuer: "SmallBizAgent",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: new OTPAuth.Secret(),
      });

      // Store the secret but don't enable 2FA yet
      await storage.updateUser(user.id, {
        twoFactorSecret: totp.secret.base32,
      });

      // Generate QR code data URI
      const qrCode = await QRCode.toDataURL(totp.toString());

      return res.json({
        qrCode,
        secret: totp.secret.base32,
        otpauthUrl: totp.toString(),
      });
    } catch (error) {
      console.error("Error setting up 2FA:", error);
      return res.status(500).json({ error: "Failed to set up 2FA" });
    }
  });

  // POST /api/2fa/verify-setup - Verify TOTP token and enable 2FA
  app.post("/api/2fa/verify-setup", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      // Fetch fresh user data to get the stored secret
      const freshUser = await storage.getUser(user.id);
      if (!freshUser || !freshUser.twoFactorSecret) {
        return res.status(400).json({ error: "2FA setup not initiated. Please start setup first." });
      }

      const totp = new OTPAuth.TOTP({
        issuer: "SmallBizAgent",
        label: freshUser.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(freshUser.twoFactorSecret),
      });

      const delta = totp.validate({ token, window: 1 });

      if (delta === null) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Generate 10 backup codes (random 8-char hex strings)
      const backupCodes: string[] = [];
      const hashedBackupCodes: string[] = [];
      for (let i = 0; i < 10; i++) {
        const code = randomBytes(4).toString("hex"); // 4 bytes = 8 hex chars
        backupCodes.push(code);
        hashedBackupCodes.push(createHash("sha256").update(code).digest("hex"));
      }

      // Enable 2FA and store hashed backup codes
      await storage.updateUser(user.id, {
        twoFactorEnabled: true,
        twoFactorBackupCodes: JSON.stringify(hashedBackupCodes),
      });

      return res.json({
        success: true,
        backupCodes,
      });
    } catch (error) {
      console.error("Error verifying 2FA setup:", error);
      return res.status(500).json({ error: "Failed to verify 2FA setup" });
    }
  });

  // POST /api/2fa/disable - Disable 2FA
  app.post("/api/2fa/disable", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const { password, token } = req.body;

      if (!password || !token) {
        return res.status(400).json({ error: "Password and token are required" });
      }

      // Verify password
      const freshUser = await storage.getUser(user.id);
      if (!freshUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const passwordValid = await comparePasswords(password, freshUser.password);
      if (!passwordValid) {
        return res.status(401).json({ error: "Invalid password" });
      }

      // Verify TOTP token
      if (!freshUser.twoFactorSecret) {
        return res.status(400).json({ error: "2FA is not enabled" });
      }

      const totp = new OTPAuth.TOTP({
        issuer: "SmallBizAgent",
        label: freshUser.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(freshUser.twoFactorSecret),
      });

      const delta = totp.validate({ token, window: 1 });
      if (delta === null) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Disable 2FA
      await storage.updateUser(user.id, {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
      });

      return res.json({ success: true, message: "Two-factor authentication disabled" });
    } catch (error) {
      console.error("Error disabling 2FA:", error);
      return res.status(500).json({ error: "Failed to disable 2FA" });
    }
  });

  // POST /api/2fa/validate - Validate TOTP during login (unauthenticated)
  app.post("/api/2fa/validate", twoFactorLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      // Check pending 2FA session
      const pending = req.session.pending2FA;
      if (!pending || !pending.userId || !pending.timestamp) {
        return res.status(401).json({ error: "No pending two-factor authentication" });
      }

      // Check timestamp is less than 5 minutes old
      const fiveMinutes = 5 * 60 * 1000;
      if (Date.now() - pending.timestamp > fiveMinutes) {
        delete req.session.pending2FA;
        return res.status(401).json({ error: "Two-factor authentication session expired. Please log in again." });
      }

      // Fetch user from database
      const user = await storage.getUser(pending.userId);
      if (!user || !user.twoFactorSecret) {
        return res.status(401).json({ error: "Invalid two-factor authentication session" });
      }

      const totp = new OTPAuth.TOTP({
        issuer: "SmallBizAgent",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
      });

      let isValid = false;

      // Try TOTP token first
      const delta = totp.validate({ token, window: 1 });
      if (delta !== null) {
        isValid = true;
      }

      // If TOTP failed, try backup codes
      if (!isValid && user.twoFactorBackupCodes) {
        const hashedToken = createHash("sha256").update(token).digest("hex");
        const backupCodes: string[] = JSON.parse(user.twoFactorBackupCodes);
        const codeIndex = backupCodes.indexOf(hashedToken);

        if (codeIndex !== -1) {
          isValid = true;
          // Remove the used backup code (one-time use)
          backupCodes.splice(codeIndex, 1);
          await storage.updateUser(user.id, {
            twoFactorBackupCodes: JSON.stringify(backupCodes),
          });
        }
      }

      if (!isValid) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      // Regenerate session before login to prevent session fixation
      req.session.regenerate((regenErr) => {
        if (regenErr) return next(regenErr);

        req.login(user, (err: Error | null) => {
          if (err) return next(err);

          // Store session metadata for device/IP tracking
          req.session.userAgent = req.headers['user-agent'] || '';
          req.session.ip = req.ip || req.headers['x-forwarded-for'] as string || '';
          req.session.lastActive = new Date().toISOString();

          // Don't send the password back to the client
          const { password, ...userWithoutPassword } = user;
          return res.json(userWithoutPassword);
        });
      });
    } catch (error) {
      console.error("Error validating 2FA:", error);
      return res.status(500).json({ error: "Failed to validate two-factor authentication" });
    }
  });

  // ============================================
  // Session Management Endpoints
  // ============================================

  // POST /api/logout-all-devices - Invalidate all sessions for this user
  app.post("/api/logout-all-devices", isAuthenticated, async (req: Request, res: Response) => {
    try {
      await pool.query(
        "DELETE FROM session WHERE sess::jsonb -> 'passport' ->> 'user' = $1",
        [req.user!.id.toString()]
      );
      return res.json({ success: true, message: "Logged out from all devices" });
    } catch (error) {
      console.error("Error logging out all devices:", error);
      return res.status(500).json({ error: "Failed to log out from all devices" });
    }
  });

  // GET /api/sessions - List active sessions for this user with device/IP details
  app.get("/api/sessions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT sid, sess, expire FROM session
         WHERE sess::jsonb -> 'passport' ->> 'user' = $1 AND expire > NOW()
         ORDER BY expire DESC`,
        [req.user!.id.toString()]
      );

      const currentSessionId = req.sessionID;

      const sessions = result.rows.map((row: any) => {
        const sess = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
        const userAgent = sess.userAgent || sess.cookie?.userAgent || '';
        const ip = sess.ip || sess.clientIp || '';

        // Parse user agent for device info
        let device = 'Unknown';
        let browser = 'Unknown';
        if (userAgent) {
          if (/iPhone|iPad/i.test(userAgent)) device = 'iOS';
          else if (/Android/i.test(userAgent)) device = 'Android';
          else if (/Mac/i.test(userAgent)) device = 'macOS';
          else if (/Windows/i.test(userAgent)) device = 'Windows';
          else if (/Linux/i.test(userAgent)) device = 'Linux';

          if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) browser = 'Chrome';
          else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = 'Safari';
          else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
          else if (/Edg/i.test(userAgent)) browser = 'Edge';
        }

        return {
          id: row.sid,
          isCurrent: row.sid === currentSessionId,
          device,
          browser,
          ip: ip || 'Unknown',
          expiresAt: row.expire,
          lastActive: sess.lastActive || row.expire,
        };
      });

      return res.json({ sessions, activeSessions: sessions.length });
    } catch (error) {
      console.error("Error fetching sessions:", error);
      return res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      // Fetch fresh user data from database to get latest businessId
      const freshUser = await storage.getUser(req.user!.id);
      if (!freshUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Update session with fresh data
      req.user = freshUser;

      // Don't send the password back to the client
      const { password, ...userWithoutPassword } = freshUser;

      // Compute effective role and permissions for the frontend
      const { role: effectiveRole, permissions } = getUserPermissions(freshUser);

      // If admin is impersonating a business, override businessId in response
      const impersonating = req.session?.impersonating;
      const effectiveBusinessId = (impersonating && freshUser.role === 'admin')
        ? impersonating.businessId
        : freshUser.businessId;

      // Pull subscription fields so the global trial banner / modal can render
      // on every page without an extra round-trip. Founder accounts (businesses
      // created before the subscription system launch) are flagged so the UI
      // can suppress trial nudges entirely.
      const SUBSCRIPTION_LAUNCH_DATE = new Date('2026-02-23T00:00:00Z');
      let subscriptionStatus: string | null = null;
      let trialEndsAt: Date | null = null;
      let isTrialActive = false;
      let isFounder = false;
      if (effectiveBusinessId) {
        try {
          const biz = await storage.getBusiness(effectiveBusinessId);
          if (biz) {
            subscriptionStatus = biz.subscriptionStatus ?? null;
            trialEndsAt = biz.trialEndsAt ?? null;
            isTrialActive = !!(biz.trialEndsAt && new Date(biz.trialEndsAt).getTime() > Date.now());
            isFounder = !!(biz.createdAt && new Date(biz.createdAt) < SUBSCRIPTION_LAUNCH_DATE);
          }
        } catch (err) {
          console.error('Failed to load business subscription fields for /api/user:', err);
        }
      }

      const subscriptionFields = {
        subscriptionStatus,
        trialEndsAt,
        isTrialActive,
        isFounder,
      };

      if (impersonating && freshUser.role === 'admin') {
        res.json({
          ...userWithoutPassword,
          effectiveRole,
          permissions,
          businessId: impersonating.businessId,
          impersonating: {
            businessId: impersonating.businessId,
            businessName: impersonating.businessName,
            originalBusinessId: impersonating.originalBusinessId,
          },
          ...subscriptionFields,
        });
      } else {
        res.json({
          ...userWithoutPassword,
          effectiveRole,
          permissions,
          ...subscriptionFields,
        });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      // Fallback to session user if database fetch fails
      const { password, ...userWithoutPassword } = req.user as User;
      res.json(userWithoutPassword);
    }
  });

  // ── Onboarding Session Storage ──
  // Store selected plan and promo code in server-side session (not localStorage)

  // Save onboarding selections (plan + promo) to session
  app.post("/api/onboarding/save-selection", isAuthenticated, (req: Request, res: Response) => {
    const { selectedPlanId, promoCode } = req.body;
    if (!req.session.onboarding) {
      req.session.onboarding = {};
    }
    if (selectedPlanId !== undefined) {
      req.session.onboarding.selectedPlanId = parseInt(selectedPlanId);
    }
    if (promoCode !== undefined) {
      req.session.onboarding.promoCode = promoCode;
    }
    res.json({ success: true });
  });

  // Get onboarding selections from session
  app.get("/api/onboarding/selection", isAuthenticated, (req: Request, res: Response) => {
    res.json({
      selectedPlanId: req.session.onboarding?.selectedPlanId || null,
      promoCode: req.session.onboarding?.promoCode || null,
    });
  });

  // Clear onboarding selections from session
  app.post("/api/onboarding/clear-selection", isAuthenticated, (req: Request, res: Response) => {
    if (req.session.onboarding) {
      delete req.session.onboarding;
    }
    res.json({ success: true });
  });

  // Save onboarding wizard progress to database (persists across page reloads)
  app.post("/api/onboarding/progress", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { currentStep, stepStatuses } = req.body;
      if (!currentStep || !stepStatuses) {
        return res.status(400).json({ error: 'currentStep and stepStatuses are required' });
      }
      const progressData = { currentStep, stepStatuses, lastUpdated: Date.now() };
      await pool.query('UPDATE users SET onboarding_progress = $1 WHERE id = $2', [JSON.stringify(progressData), userId]);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error saving onboarding progress:', error);
      res.status(500).json({ error: 'Failed to save onboarding progress' });
    }
  });

  // Load onboarding wizard progress from database
  app.get("/api/onboarding/progress", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const result = await pool.query('SELECT onboarding_progress FROM users WHERE id = $1', [userId]);
      const progress = result.rows[0]?.onboarding_progress || null;
      res.json({ progress });
    } catch (error: any) {
      console.error('Error loading onboarding progress:', error);
      res.status(500).json({ error: 'Failed to load onboarding progress' });
    }
  });

  // Mark onboarding as complete in database
  app.post("/api/onboarding/complete", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      await pool.query('UPDATE users SET onboarding_complete = true WHERE id = $1', [userId]);
      // Clear onboarding session data
      if (req.session.onboarding) {
        delete req.session.onboarding;
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ error: 'Failed to complete onboarding' });
    }
  });

  // Forgot Password - Request password reset
  app.post("/api/forgot-password", forgotPasswordLimiter, async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);

      // Always return success to prevent email enumeration attacks
      if (!user) {
        return res.json({ message: "If an account exists with that email, a password reset link will be sent." });
      }

      // Generate a secure random token and hash it before storage
      // The raw token goes in the email link; only the hash is stored in DB
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");

      // Set expiration to 1 hour from now
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Store the hashed token (never store plaintext reset tokens)
      await storage.createPasswordResetToken({
        userId: user.id,
        token: tokenHash,
        expiresAt,
        used: false,
      });

      // Build the reset link — use APP_URL for production, fallback to BASE_URL or localhost
      const baseUrl = process.env.APP_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const resetLink = `${baseUrl}/reset-password?token=${token}`;
      console.log(`[Auth] Password reset link generated for ${user.email} (base: ${baseUrl})`);

      // Send the email
      try {
        const result = await sendPasswordResetEmail(user.email, user.username, resetLink);
        console.log("Password reset email sent:", result.messageId);
        if (result.previewUrl) {
          console.log("Preview URL:", result.previewUrl);
        }
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
        // Don't reveal the error to the user
      }

      return res.json({ message: "If an account exists with that email, a password reset link will be sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      return res.status(500).json({ error: "An error occurred. Please try again." });
    }
  });

  // Reset Password - Use token to set new password
  app.post("/api/reset-password", resetPasswordLimiter, async (req, res) => {
    try {
      const { token, password: newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      // Validate password strength
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: "Password does not meet security requirements",
          details: passwordValidation.errors
        });
      }

      // Hash the incoming token to match against the stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const resetToken = await storage.getPasswordResetToken(tokenHash);

      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      // Prevent token reuse (race condition protection)
      if (resetToken.used) {
        return res.status(400).json({ error: "This reset token has already been used. Please request a new one." });
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        await storage.markPasswordResetTokenUsed(resetToken.id);
        return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
      }

      // Get the user
      const user = await storage.getUser(resetToken.userId);
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);

      // Update the user's password
      await storage.updateUser(user.id, { password: hashedPassword });

      // Mark the token as used
      await storage.markPasswordResetTokenUsed(resetToken.id);

      return res.json({ message: "Password has been reset successfully. You can now log in with your new password." });
    } catch (error) {
      console.error("Reset password error:", error);
      return res.status(500).json({ error: "An error occurred. Please try again." });
    }
  });

  // Validate reset token
  app.get("/api/validate-reset-token", async (req, res) => {
    try {
      const token = req.query.token as string;

      if (!token) {
        return res.status(400).json({ valid: false, error: "Token is required" });
      }

      // Hash the incoming token to match against stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const resetToken = await storage.getPasswordResetToken(tokenHash);

      if (!resetToken) {
        return res.json({ valid: false, error: "Invalid or expired reset token" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.json({ valid: false, error: "Reset token has expired" });
      }

      return res.json({ valid: true });
    } catch (error) {
      console.error("Validate reset token error:", error);
      return res.status(500).json({ valid: false, error: "An error occurred" });
    }
  });

  // Middleware to check if user is authenticated
  app.use("/api/protected", (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ error: "Not authenticated" });
  });

  // === Account Data Export (GDPR / Privacy compliance) ===
  app.post("/api/account/export", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const businessId = req.user!.businessId;

      // Compile all user data
      const userData = await storage.getUser(userId);
      if (!userData) {
        return res.status(404).json({ error: 'User not found' });
      }
      const { password: _, twoFactorSecret: __, twoFactorBackupCodes: ___, ...safeUserData } = userData;

      let businessData: Record<string, unknown> | null = null;
      let customers: Awaited<ReturnType<typeof storage.getCustomers>> | null = null;
      let appointments: Awaited<ReturnType<typeof storage.getAppointmentsByBusinessId>> | null = null;
      let callLogData: Awaited<ReturnType<typeof storage.getCallLogs>> | null = null;
      let invoiceData: Awaited<ReturnType<typeof storage.getInvoices>> | null = null;

      if (businessId) {
        const rawBusiness = await storage.getBusiness(businessId);
        // Remove sensitive credentials from export
        if (rawBusiness) {
          const { quickbooksAccessToken, quickbooksRefreshToken, cloverAccessToken, cloverRefreshToken, squareAccessToken, squareRefreshToken, heartlandApiKey, ...safeBiz } = rawBusiness;
          businessData = safeBiz;
        }
        customers = await storage.getCustomers(businessId);
        appointments = await storage.getAppointmentsByBusinessId(businessId);
        callLogData = await storage.getCallLogs(businessId);
        invoiceData = await storage.getInvoices(businessId);
      }

      // Log the export
      const { logAudit, getRequestContext } = await import('./services/auditService');
      const ctx = getRequestContext(req);
      await logAudit({
        userId,
        businessId: businessId || undefined,
        action: 'data_export',
        resource: 'account',
        ...ctx,
      });

      const exportData = {
        exportDate: new Date().toISOString(),
        user: safeUserData,
        business: businessData,
        customers,
        appointments,
        callLogs: callLogData,
        invoices: invoiceData,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="smallbizagent-export-${userId}-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting account data:', error);
      res.status(500).json({ error: 'Error exporting account data' });
    }
  });

  // === Account Deletion (GDPR / Privacy compliance) ===
  app.post("/api/account/delete", isAuthenticated, async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password confirmation required' });
      }

      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify password
      const passwordMatch = await comparePasswords(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      const businessId = user.businessId;

      // Log deletion before we delete everything
      const { logAudit, getRequestContext } = await import('./services/auditService');
      const ctx = getRequestContext(req);
      await logAudit({
        userId,
        businessId: businessId || undefined,
        action: 'account_deleted',
        resource: 'account',
        details: { username: user.username, email: user.email },
        ...ctx,
      });

      // Delete business data if exists
      if (businessId) {
        try {
          // Try to release provisioned resources
          const business = await storage.getBusiness(businessId);
          if (business?.twilioPhoneNumber) {
            try {
              const { deprovisionBusiness } = await import('./services/businessProvisioningService');
              await deprovisionBusiness(businessId);
            } catch (e) {
              console.error('Error deprovisioning during account deletion:', e);
            }
          }

          // Cancel subscription if active
          if (business?.stripeSubscriptionId) {
            try {
              const { subscriptionService } = await import('./services/subscriptionService');
              await subscriptionService.cancelSubscription(businessId);
            } catch (e) {
              console.error('Error cancelling subscription during account deletion:', e);
            }
          }
        } catch (e) {
          console.error('Error during business cleanup:', e);
        }

        // Delete all business-related data
        const { db: database } = await import('./db');
        const schema = await import('@shared/schema');
        const { eq: eqOp } = await import('drizzle-orm');

        // Delete in order (child tables first)
        const tablesToClean = [
          schema.callLogs, schema.appointments, schema.customers,
          schema.invoiceItems, schema.invoices, schema.jobLineItems, schema.jobs,
          schema.quoteItems, schema.quotes, schema.services, schema.businessHours,
          schema.staff, schema.staffHours, schema.staffServices, schema.staffInvites,
          schema.receptionistConfig, schema.calendarIntegrations,
          schema.notificationSettings, schema.notificationLog,
          schema.reviewSettings, schema.reviewRequests,
          schema.recurringSchedules, schema.recurringScheduleItems, schema.recurringJobHistory,
          schema.businessKnowledge, schema.unansweredQuestions, schema.websiteScrapeCache,
          schema.webhooks, schema.webhookDeliveries, schema.apiKeys,
          schema.marketingCampaigns, schema.businessPhoneNumbers,
          schema.overageCharges,
        ];

        for (const table of tablesToClean) {
          try {
            // All tables in tablesToClean have a businessId column; use index access
            // to avoid union type issues with drizzle table types
            const tableRecord = table as unknown as Record<string, unknown>;
            const bizIdCol = tableRecord['businessId'];
            if (bizIdCol) {
              await database.delete(table).where(eqOp(bizIdCol as typeof schema.callLogs.businessId, businessId));
            }
          } catch (e) {
            // Some tables might not have businessId column, skip those
          }
        }

        // Delete the business itself
        try {
          await database.delete(schema.businesses).where(eqOp(schema.businesses.id, businessId));
        } catch (e) {
          console.error('Error deleting business record:', e);
        }
      }

      // Delete user_business_access entries
      try {
        const { db: database } = await import('./db');
        const schema = await import('@shared/schema');
        const { eq: eqOp } = await import('drizzle-orm');
        await database.delete(schema.userBusinessAccess).where(eqOp(schema.userBusinessAccess.userId, userId));
      } catch (e) {
        console.error('Error deleting user business access:', e);
      }

      // Destroy all sessions for this user
      const { pool: dbPool } = await import('./db');
      await dbPool.query("DELETE FROM session WHERE sess::jsonb -> 'passport' ->> 'user' = $1", [userId.toString()]);

      // Delete the user
      try {
        const { db: database } = await import('./db');
        const schema = await import('@shared/schema');
        const { eq: eqOp } = await import('drizzle-orm');
        await database.delete(schema.users).where(eqOp(schema.users.id, userId));
      } catch (e) {
        console.error('Error deleting user record:', e);
      }

      res.json({ success: true, message: 'Account and all associated data have been permanently deleted' });
    } catch (error) {
      console.error('Error deleting account:', error);
      res.status(500).json({ error: 'Error deleting account' });
    }
  });
}

// Middleware to check for authentication
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  // Session auth (web app)
  if (req.isAuthenticated()) {
    return next();
  }

  // JWT auth (mobile app)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer jwt_')) {
    return authenticateJwt(req, res, next);
  }

  // API key auth (integrations)
  if (authHeader && authHeader.startsWith('Bearer sbz_')) {
    return authenticateApiKey(req, res, next);
  }

  res.status(401).json({ error: "Not authenticated" });
}

// Check if user is admin (utility function)
export function checkIsAdmin(req: Request): boolean {
  return req.isAuthenticated() && req.user && req.user.role === "admin";
}

// Middleware to check for admin role
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (checkIsAdmin(req)) {
    return next();
  }
  res.status(403).json({ error: "Not authorized" });
}

// Utility function to check if user belongs to a business
// Supports multi-location: checks user_business_access table as fallback
export function checkBelongsToBusiness(req: Request, businessId: number): boolean {
  if (!req.isAuthenticated() || !req.user) return false;
  if (req.user.role === "admin") return true;
  if (req.user.businessId === businessId) return true;
  // Multi-location access is checked asynchronously via checkBelongsToBusinessAsync
  return false;
}

// Async version that checks user_business_access table for multi-location support
export async function checkBelongsToBusinessAsync(req: Request, businessId: number): Promise<boolean> {
  if (!req.isAuthenticated() || !req.user) return false;
  if (req.user.role === "admin") return true;
  if (req.user.businessId === businessId) return true;
  // Check user_business_access table for multi-location access
  try {
    const { storage } = await import('./storage');
    return await storage.hasBusinessAccess(req.user.id, businessId);
  } catch {
    return false;
  }
}

// Middleware to check if user belongs to a business (supports multi-location)
export async function belongsToBusiness(req: Request, res: Response, next: NextFunction) {
  const businessId = parseInt(req.params.businessId || req.params.id || req.query.businessId as string || "0");

  if (await checkBelongsToBusinessAsync(req, businessId)) {
    return next();
  }
  res.status(403).json({ error: "Not authorized for this business" });
}

/**
 * API Key Authentication Middleware
 * Checks for "Authorization: Bearer sbz_..." header
 * Hashes the key with SHA-256 and looks it up in api_keys table
 * Attaches businessId to req for downstream use
 */
export async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer sbz_')) {
      return res.status(401).json({ error: 'Missing or invalid API key' });
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer " prefix
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    // Dynamic import to avoid circular dependency
    const { pool } = await import('./db');
    const result = await pool.query(
      `SELECT ak.id, ak.business_id, ak.active, b.name as business_name
       FROM api_keys ak
       JOIN businesses b ON ak.business_id = b.id
       WHERE ak.key_hash = $1 AND ak.active = true`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const keyRecord = result.rows[0];

    // Attach business info to request
    (req as ApiKeyRequest).apiKeyAuth = true;
    (req as ApiKeyRequest).apiKeyBusinessId = keyRecord.business_id;
    (req as ApiKeyRequest).apiKeyBusinessName = keyRecord.business_name;

    // Update last_used_at (fire-and-forget)
    pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyRecord.id])
      .catch((err: any) => console.error('[Auth] Error updating API key last_used_at:', err));

    next();
  } catch (error: any) {
    console.error('[Auth] API key authentication error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Dual Authentication Middleware
 * Allows either session-based auth OR API key auth
 * Tries session first, falls back to API key
 */
export async function isAuthenticatedOrApiKey(req: Request, res: Response, next: NextFunction) {
  // Try session auth first
  if (req.isAuthenticated()) {
    return next();
  }

  // Fall back to API key auth
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer sbz_')) {
    return authenticateApiKey(req, res, next);
  }

  return res.status(401).json({ error: 'Authentication required' });
}