import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User, InsertUser } from "@shared/schema";
import { sendPasswordResetEmail } from "./emailService";

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
      lastLogin: Date | null;
      createdAt: Date | null;
      updatedAt: Date | null;
    }
  }
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

  // Configure passport to use local strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
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
      // Validate password strength
      const passwordValidation = validatePassword(req.body.password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: "Password does not meet security requirements",
          details: passwordValidation.errors
        });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use" });
      }

      // Create new user with hashed password
      const hashedPassword = await hashPassword(req.body.password);
      const userData: InsertUser = {
        ...req.body,
        password: hashedPassword,
      };

      const user = await storage.createUser(userData);

      // Log the user in
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Don't send the password back to the client
        const { password, ...userWithoutPassword } = user;
        return res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message: string }) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      req.login(user, (err: Error | null) => {
        if (err) return next(err);
        
        // Don't send the password back to the client
        const { password, ...userWithoutPassword } = user;
        return res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err: Error | null) => {
      if (err) {
        return res.status(500).json({ error: "Error during logout" });
      }
      return res.status(200).json({ message: "Logout successful" });
    });
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
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      // Fallback to session user if database fetch fails
      const { password, ...userWithoutPassword } = req.user as User;
      res.json(userWithoutPassword);
    }
  });

  // Forgot Password - Request password reset
  app.post("/api/forgot-password", async (req, res) => {
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

      // Generate a secure random token
      const token = randomBytes(32).toString("hex");

      // Set expiration to 1 hour from now
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Store the token
      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
        used: false,
      });

      // Build the reset link
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const resetLink = `${baseUrl}/reset-password?token=${token}`;

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
  app.post("/api/reset-password", async (req, res) => {
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

      // Find the token
      const resetToken = await storage.getPasswordResetToken(token);

      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
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

      const resetToken = await storage.getPasswordResetToken(token);

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
}

// Middleware to check for authentication
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
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
export function checkBelongsToBusiness(req: Request, businessId: number): boolean {
  return req.isAuthenticated() && 
         req.user && 
         (req.user.businessId === businessId || req.user.role === "admin");
}

// Middleware to check if user belongs to a business
export function belongsToBusiness(req: Request, res: Response, next: NextFunction) {
  const businessId = parseInt(req.params.businessId || req.query.businessId as string || "0");
  
  if (checkBelongsToBusiness(req, businessId)) {
    return next();
  }
  res.status(403).json({ error: "Not authorized for this business" });
}