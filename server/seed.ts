import { storage } from "./storage";
import { hashPassword } from "./auth";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seed() {
  // Always run admin bootstrap (works in both dev and production)
  await ensureAdminAccount();

  // Skip demo seeding in production - each user creates their own business during registration
  if (process.env.NODE_ENV === 'production') {
    console.log("Skipping demo seed in production");
    return;
  }

  try {
    // Check if demo user already exists
    const existingUser = await storage.getUserByUsername("demo");
    if (!existingUser) {
      console.log("Creating demo user...");
      // Create a demo user
      await storage.createUser({
        username: "demo",
        email: "demo@example.com",
        password: await hashPassword("password123"),
        role: "admin",
        businessId: 1,
        active: true,
      });
      console.log("Demo user created successfully");
    } else {
      console.log("Demo user already exists");
    }

    // Check if there's already a business
    const existingBusiness = await storage.getBusiness(1);
    if (!existingBusiness) {
      console.log("Creating demo business...");
      // Create a demo business
      await storage.createBusiness({
        name: "Precision Auto Repair",
        email: "info@precisionauto.example.com",
        address: "123 Main St",
        city: "Springfield",
        state: "IL",
        zip: "62701",
        phone: "555-123-4567",
        website: "https://precisionauto.example.com",
      });
      console.log("Demo business created successfully");
    } else {
      console.log("Demo business already exists");
    }

  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

/**
 * Ensure a platform admin account exists.
 *
 * Set these environment variables in Railway (or .env):
 *   ADMIN_EMAIL=your@email.com
 *   ADMIN_PASSWORD=your-secure-password
 *   ADMIN_USERNAME=admin          (optional, defaults to "admin")
 *
 * On each server start:
 * - If a user with that email already exists → promotes them to admin role
 * - If no user with that email exists → creates a new admin account
 * - If env vars are not set → silently skips (no admin created)
 */
async function ensureAdminAccount(): Promise<void> {
  const rawAdminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!rawAdminEmail || !adminPassword) {
    // No admin env vars configured — skip silently
    return;
  }

  const adminEmail = rawAdminEmail.toLowerCase(); // Normalize email to lowercase
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const hashedPassword = await hashPassword(adminPassword);

  try {
    // Check if a user with this email already exists
    const existingByEmail = await storage.getUserByEmail(adminEmail);

    if (existingByEmail) {
      // User exists by email — sync username, role, password, and mark as verified
      await db.update(users)
        .set({ username: adminUsername, role: "admin", password: hashedPassword, emailVerified: true })
        .where(eq(users.id, existingByEmail.id));
      console.log(`[Admin] Synced admin account: username="${adminUsername}", email=${adminEmail}`);
      return;
    }

    // Check if the username is already taken by someone else
    const existingByUsername = await storage.getUserByUsername(adminUsername);

    if (existingByUsername) {
      // Username taken but email doesn't match — update that user's email, role, and password
      await db.update(users)
        .set({ email: adminEmail, role: "admin", password: hashedPassword, emailVerified: true })
        .where(eq(users.id, existingByUsername.id));
      console.log(`[Admin] Updated existing "${adminUsername}" user to admin with email ${adminEmail}`);
      return;
    }

    // Neither email nor username exists — create fresh admin account
    const newAdmin = await storage.createUser({
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
      active: true,
    });
    // Mark admin as email-verified (skip verification flow)
    await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, newAdmin.id));
    console.log(`[Admin] Created new admin account: ${adminUsername} (${adminEmail})`);
  } catch (error: any) {
    console.error("[Admin] Error ensuring admin account:", error?.message || error);

    // Last resort: try to force-upsert via direct SQL
    try {
      const existingAny = await storage.getUserByEmail(adminEmail) || await storage.getUserByUsername(adminUsername);
      if (existingAny) {
        await db.update(users)
          .set({ email: adminEmail, username: adminUsername, role: "admin", password: hashedPassword })
          .where(eq(users.id, existingAny.id));
        console.log(`[Admin] Force-updated admin account after error recovery`);
      }
    } catch (retryError: any) {
      console.error("[Admin] Failed even on retry:", retryError?.message || retryError);
    }
  }
}