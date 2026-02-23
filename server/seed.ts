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
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    // No admin env vars configured — skip silently
    return;
  }

  const adminUsername = process.env.ADMIN_USERNAME || "admin";

  try {
    // Check if a user with this email already exists
    const existingUser = await storage.getUserByEmail(adminEmail);

    if (existingUser) {
      // User exists — ensure they have admin role
      if (existingUser.role !== "admin") {
        await db.update(users)
          .set({ role: "admin" })
          .where(eq(users.id, existingUser.id));
        console.log(`[Admin] Promoted existing user "${existingUser.username}" (${adminEmail}) to admin role`);
      } else {
        console.log(`[Admin] Admin account already exists: ${adminEmail}`);
      }
    } else {
      // Create new admin account
      const hashedPassword = await hashPassword(adminPassword);
      await storage.createUser({
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        active: true,
      });
      console.log(`[Admin] Created new admin account: ${adminUsername} (${adminEmail})`);
    }
  } catch (error) {
    console.error("[Admin] Error ensuring admin account:", error);
  }
}