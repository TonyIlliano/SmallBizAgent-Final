import { storage } from "./storage";
import { hashPassword } from "./auth";

export async function seed() {
  // Skip seeding in production - each user creates their own business during registration
  if (process.env.NODE_ENV === 'production') {
    console.log("Skipping seed in production - users create businesses during registration");
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