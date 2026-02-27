import { Router } from "express";
import { storage } from "../storage";
import { eq, and, desc, like, ilike, or } from "drizzle-orm";
import { customers, insertCustomerSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

// Get all customers for the current business
router.get("/customers", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Get query parameters for filtering and searching
    const search = req.query.search as string;

    let query = storage.getCustomers(businessId);
    
    if (search) {
      // TODO: Implement search if needed
    }

    const allCustomers = await query;

    res.json(allCustomers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// Get a specific customer by ID
router.get("/customers/:id", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const customerId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    const customer = await storage.getCustomer(customerId);
    
    if (!customer || customer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
});

// Create a new customer
router.post("/customers", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Define the schema for the request body
    const createCustomerSchema = z.object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      email: z.string().email("Invalid email address"),
      phone: z.string().min(1, "Phone number is required"),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipcode: z.string().optional(),
      birthday: z.string().optional(), // MM-DD format
      // SMS consent fields (TCPA compliance)
      smsOptIn: z.boolean().optional(),
      smsOptInDate: z.string().optional(),
      smsOptInMethod: z.string().optional(),
      marketingOptIn: z.boolean().optional(),
      marketingOptInDate: z.string().optional(),
    });

    // Validate the request body
    const validatedData = createCustomerSchema.parse(req.body);

    // Create the customer
    const customerData: any = {
      businessId,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      email: validatedData.email,
      phone: validatedData.phone,
      address: validatedData.address || null,
      city: validatedData.city || null,
      state: validatedData.state || null,
      zipcode: validatedData.zipcode || null,
      birthday: validatedData.birthday || null,
    };

    // Add SMS consent fields if provided
    if (validatedData.smsOptIn !== undefined) {
      customerData.smsOptIn = validatedData.smsOptIn;
      if (validatedData.smsOptIn) {
        customerData.smsOptInDate = validatedData.smsOptInDate ? new Date(validatedData.smsOptInDate) : new Date();
        customerData.smsOptInMethod = validatedData.smsOptInMethod || 'manual';
      }
    }
    if (validatedData.marketingOptIn !== undefined) {
      customerData.marketingOptIn = validatedData.marketingOptIn;
      if (validatedData.marketingOptIn) {
        customerData.marketingOptInDate = validatedData.marketingOptInDate ? new Date(validatedData.marketingOptInDate) : new Date();
      }
    }

    const newCustomer = await storage.createCustomer(customerData);

    res.status(201).json(newCustomer);
  } catch (error: any) {
    console.error("Error creating customer:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid customer data", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to create customer" });
  }
});

// Update a customer
router.patch("/customers/:id", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const customerId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Check if the customer exists and belongs to the business
    const existingCustomer = await storage.getCustomer(customerId);
    if (!existingCustomer || existingCustomer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Define the schema for the request body
    const updateCustomerSchema = z.object({
      firstName: z.string().min(1, "First name is required").optional(),
      lastName: z.string().min(1, "Last name is required").optional(),
      email: z.string().email("Invalid email address").optional(),
      phone: z.string().min(1, "Phone number is required").optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipcode: z.string().optional(),
      birthday: z.string().optional(), // MM-DD format
      // SMS consent fields (TCPA compliance)
      smsOptIn: z.boolean().optional(),
      smsOptInDate: z.string().optional(),
      smsOptInMethod: z.string().optional(),
      marketingOptIn: z.boolean().optional(),
      marketingOptInDate: z.string().optional(),
    });

    // Validate the request body
    const validatedData = updateCustomerSchema.parse(req.body);

    // Build update data with consent timestamps
    const updateData: any = { ...validatedData };
    if (validatedData.smsOptIn === true && !existingCustomer.smsOptIn) {
      updateData.smsOptInDate = validatedData.smsOptInDate ? new Date(validatedData.smsOptInDate) : new Date();
      updateData.smsOptInMethod = validatedData.smsOptInMethod || 'manual';
    }
    if (validatedData.marketingOptIn === true && !existingCustomer.marketingOptIn) {
      updateData.marketingOptInDate = validatedData.marketingOptInDate ? new Date(validatedData.marketingOptInDate) : new Date();
    }

    // Update the customer
    const updatedCustomer = await storage.updateCustomer(customerId, updateData);

    res.json(updatedCustomer);
  } catch (error: any) {
    console.error("Error updating customer:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid customer data", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// Delete a customer
router.delete("/customers/:id", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const customerId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Check if the customer exists and belongs to the business
    const existingCustomer = await storage.getCustomer(customerId);
    if (!existingCustomer || existingCustomer.businessId !== businessId) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Delete the customer
    await storage.deleteCustomer(customerId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;