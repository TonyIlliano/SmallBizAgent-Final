import { Router } from "express";
import { storage } from "../storage";
import { eq, and, desc, like, ilike, or } from "drizzle-orm";
import { quotes, quoteItems, insertQuoteSchema, insertQuoteItemSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

// Get all quotes for the current business
router.get("/quotes", async (req, res) => {
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
    const status = req.query.status as string;
    const search = req.query.search as string;
    const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
    const jobId = req.query.jobId ? parseInt(req.query.jobId as string) : undefined;
    const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
    const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;

    const allQuotes = await storage.getAllQuotes(
      businessId,
      { status, search, customerId, jobId, fromDate, toDate }
    );

    res.json(allQuotes);
  } catch (error) {
    console.error("Error fetching quotes:", error);
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

// Get a specific quote by ID
router.get("/quotes/:id", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const quoteId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    const quote = await storage.getQuoteById(quoteId, businessId);
    
    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    res.json(quote);
  } catch (error) {
    console.error("Error fetching quote:", error);
    res.status(500).json({ error: "Failed to fetch quote" });
  }
});

// Create a new quote
router.post("/quotes", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Define the schema for the request body with a clear validUntil type
    const createQuoteSchema = insertQuoteSchema.extend({
      items: z.array(z.object({
        description: z.string().min(1, "Description is required"),
        quantity: z.number().min(1, "Quantity must be at least 1"),
        unitPrice: z.number().min(0, "Unit price cannot be negative"),
        amount: z.number().optional(),
      })).min(1, "At least one item is required"),
    });

    // Validate the request body
    const validatedData = createQuoteSchema.parse(req.body);

    // Create the quote
    const quoteData = {
      businessId,
      customerId: validatedData.customerId,
      jobId: validatedData.jobId,
      quoteNumber: validatedData.quoteNumber,
      amount: validatedData.amount,
      tax: validatedData.tax,
      total: validatedData.total,
      validUntil: validatedData.validUntil || null,
      notes: validatedData.notes || null,
    };

    const newQuote = await storage.createQuote(quoteData);

    // Create the quote items
    for (const item of validatedData.items) {
      await storage.createQuoteItem({
        quoteId: newQuote.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.quantity * item.unitPrice,
      });
    }

    // Fetch the complete quote with items
    const completeQuote = await storage.getQuoteById(newQuote.id, businessId);

    res.status(201).json(completeQuote);
  } catch (error: any) {
    console.error("Error creating quote:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid quote data", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to create quote" });
  }
});

// Update a quote
router.patch("/quotes/:id", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const quoteId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Check if the quote exists and belongs to the business
    const existingQuote = await storage.getQuoteById(quoteId, businessId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Check if the quote can be updated (not already converted)
    if (existingQuote.status === "converted") {
      return res.status(400).json({ error: "Cannot update a quote that has been converted to an invoice" });
    }

    // Define the schema for the request body with a clear validUntil type
    const updateQuoteSchema = insertQuoteSchema.extend({
      items: z.array(z.object({
        id: z.number().optional(), // Existing item ID if updating
        description: z.string().min(1, "Description is required"),
        quantity: z.number().min(1, "Quantity must be at least 1"),
        unitPrice: z.number().min(0, "Unit price cannot be negative"),
        amount: z.number().optional(),
      })).min(1, "At least one item is required"),
    });

    // Validate the request body
    const validatedData = updateQuoteSchema.parse(req.body);

    // Update the quote
    const quoteData = {
      customerId: validatedData.customerId,
      jobId: validatedData.jobId,
      quoteNumber: validatedData.quoteNumber,
      amount: validatedData.amount,
      tax: validatedData.tax,
      total: validatedData.total,
      validUntil: validatedData.validUntil || null,
      notes: validatedData.notes || null,
    };

    await storage.updateQuote(quoteId, quoteData);

    // Delete existing quote items and create new ones
    await storage.deleteQuoteItems(quoteId);

    // Create the quote items
    for (const item of validatedData.items) {
      await storage.createQuoteItem({
        quoteId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.quantity * item.unitPrice,
      });
    }

    // Fetch the updated quote with items
    const updatedQuote = await storage.getQuoteById(quoteId, businessId);

    res.json(updatedQuote);
  } catch (error: any) {
    console.error("Error updating quote:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid quote data", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to update quote" });
  }
});

// Update a quote's status
router.patch("/quotes/:id/status", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const quoteId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Check if the quote exists and belongs to the business
    const existingQuote = await storage.getQuoteById(quoteId, businessId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Define the schema for the request body
    const updateStatusSchema = z.object({
      status: z.enum(["pending", "accepted", "declined", "expired", "converted"]),
    });

    // Validate the request body
    const validatedData = updateStatusSchema.parse(req.body);

    // Update the quote status
    await storage.updateQuoteStatus(quoteId, validatedData.status);

    // Fetch the updated quote
    const updatedQuote = await storage.getQuoteById(quoteId, businessId);

    res.json(updatedQuote);
  } catch (error: any) {
    console.error("Error updating quote status:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid status", details: error.errors });
    }
    
    res.status(500).json({ error: "Failed to update quote status" });
  }
});

// Convert a quote to an invoice
router.post("/quotes/:id/convert", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const quoteId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Check if the quote exists and belongs to the business
    const existingQuote = await storage.getQuoteById(quoteId, businessId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Check if the quote can be converted (must be accepted and not already converted)
    if (existingQuote.status !== "accepted") {
      return res.status(400).json({ error: "Only accepted quotes can be converted to invoices" });
    }

    if (existingQuote.convertedToInvoiceId) {
      return res.status(400).json({ error: "Quote has already been converted to an invoice" });
    }

    // Convert the quote to an invoice
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Due in 30 days
    const invoiceData = {
      businessId,
      customerId: existingQuote.customerId,
      jobId: existingQuote.jobId,
      invoiceNumber: `INV-${Date.now()}`, // Generate a new invoice number
      amount: existingQuote.amount,
      tax: existingQuote.tax,
      total: existingQuote.total,
      dueDate: dueDate.toISOString().split('T')[0], // Format as 'YYYY-MM-DD'
      status: "pending",
    };

    const newInvoice = await storage.createInvoice(invoiceData);

    // Create invoice items from quote items
    for (const item of existingQuote.items) {
      await storage.createInvoiceItem({
        invoiceId: newInvoice.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      });
    }

    // Update the quote status to converted and store the invoice ID
    await storage.updateQuote(quoteId, {
      status: "converted",
      convertedToInvoiceId: newInvoice.id,
    });

    res.json({ success: true, invoiceId: newInvoice.id });
  } catch (error) {
    console.error("Error converting quote to invoice:", error);
    res.status(500).json({ error: "Failed to convert quote to invoice" });
  }
});

// Delete a quote
router.delete("/quotes/:id", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const quoteId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Check if the quote exists and belongs to the business
    const existingQuote = await storage.getQuoteById(quoteId, businessId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Check if the quote can be deleted (not already converted)
    if (existingQuote.status === "converted") {
      return res.status(400).json({ error: "Cannot delete a quote that has been converted to an invoice" });
    }

    // Delete quote items first
    await storage.deleteQuoteItems(quoteId);
    
    // Delete the quote
    await storage.deleteQuote(quoteId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting quote:", error);
    res.status(500).json({ error: "Failed to delete quote" });
  }
});

// Generate a shareable link for a quote
router.post("/quotes/:id/generate-link", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;
    const quoteId = parseInt(req.params.id);

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    // Check if the quote exists and belongs to the business
    const existingQuote = await storage.getQuoteById(quoteId, businessId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Generate a unique access token if one doesn't exist
    const crypto = require("crypto");
    const accessToken = existingQuote.accessToken || crypto.randomBytes(32).toString("hex");

    // Update the quote with the access token
    await storage.updateQuote(quoteId, { accessToken });

    // Generate the URL
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const quoteUrl = `${baseUrl}/portal/quote/${accessToken}`;

    res.json({
      success: true,
      url: quoteUrl,
      accessToken
    });
  } catch (error) {
    console.error("Error generating quote link:", error);
    res.status(500).json({ error: "Failed to generate quote link" });
  }
});

// Public route to get quote by access token (no auth required)
router.get("/portal/quote/:token", async (req, res) => {
  try {
    const { token } = req.params;

    // Find the quote by access token
    const quote = await storage.getQuoteByAccessToken(token);

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Get business info for the quote
    const business = await storage.getBusiness(quote.businessId);

    // Get customer info
    const customer = await storage.getCustomer(quote.customerId);

    // Get quote items
    const items = await storage.getQuoteItems(quote.id);

    res.json({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      amount: quote.amount,
      tax: quote.tax,
      total: quote.total,
      status: quote.status,
      validUntil: quote.validUntil,
      notes: quote.notes,
      createdAt: quote.createdAt,
      customer: customer ? {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
      } : null,
      business: business ? {
        name: business.name,
        address: business.address,
        phone: business.phone,
        email: business.email,
      } : null,
      items: items.map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      })),
    });
  } catch (error) {
    console.error("Error fetching quote by token:", error);
    res.status(500).json({ error: "Failed to fetch quote" });
  }
});

// Public route to accept/decline a quote (no auth required)
router.post("/portal/quote/:token/respond", async (req, res) => {
  try {
    const { token } = req.params;
    const { response } = req.body; // "accepted" or "declined"

    if (!["accepted", "declined"].includes(response)) {
      return res.status(400).json({ error: "Invalid response. Must be 'accepted' or 'declined'" });
    }

    // Find the quote by access token
    const quote = await storage.getQuoteByAccessToken(token);

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Can only respond to pending quotes
    if (quote.status !== "pending") {
      return res.status(400).json({ error: `Cannot respond to a quote that is ${quote.status}` });
    }

    // Check if quote has expired
    if (quote.validUntil) {
      const validUntilDate = new Date(quote.validUntil);
      if (validUntilDate < new Date()) {
        await storage.updateQuoteStatus(quote.id, "expired");
        return res.status(400).json({ error: "This quote has expired" });
      }
    }

    // Update the quote status
    await storage.updateQuoteStatus(quote.id, response);

    res.json({
      success: true,
      message: response === "accepted"
        ? "Quote accepted! The business will be in touch shortly."
        : "Quote declined."
    });
  } catch (error) {
    console.error("Error responding to quote:", error);
    res.status(500).json({ error: "Failed to respond to quote" });
  }
});

export default router;