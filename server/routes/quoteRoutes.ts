import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { insertQuoteItemSchema, insertQuoteSchema } from "@shared/schema";

const router = Router();

// Get all quotes for a business
router.get("/quotes", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  const businessId = req.user.businessId;
  const status = req.query.status as string | undefined;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  
  try {
    const quotes = await storage.getQuotes(businessId, { status, customerId });
    res.json(quotes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific quote by ID
router.get("/quotes/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  const quoteId = parseInt(req.params.id);
  
  try {
    const quote = await storage.getQuote(quoteId);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    // Verify the quote belongs to the user's business
    if (quote.businessId !== req.user.businessId) {
      return res.status(403).json({ error: "Not authorized to access this quote" });
    }
    
    // Get quote items
    const quoteItems = await storage.getQuoteItems(quoteId);
    
    res.json({ ...quote, items: quoteItems });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new quote
router.post("/quotes", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  try {
    // Validate request body
    const quoteData = insertQuoteSchema.parse({
      ...req.body,
      businessId: req.user.businessId,
    });
    
    // Create the quote
    const quote = await storage.createQuote(quoteData);
    
    // Create quote items if provided
    if (req.body.items && Array.isArray(req.body.items)) {
      for (const item of req.body.items) {
        const quoteItem = insertQuoteItemSchema.parse({
          ...item,
          quoteId: quote.id,
        });
        await storage.createQuoteItem(quoteItem);
      }
    }
    
    // Get the complete quote with items
    const quoteItems = await storage.getQuoteItems(quote.id);
    
    res.status(201).json({ ...quote, items: quoteItems });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update a quote
router.patch("/quotes/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  const quoteId = parseInt(req.params.id);
  
  try {
    // Check if quote exists and belongs to the user's business
    const existingQuote = await storage.getQuote(quoteId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    if (existingQuote.businessId !== req.user.businessId) {
      return res.status(403).json({ error: "Not authorized to update this quote" });
    }
    
    // Update the quote
    const updatedQuote = await storage.updateQuote(quoteId, req.body);
    
    // Update quote items if provided
    if (req.body.items && Array.isArray(req.body.items)) {
      // Delete existing items
      const existingItems = await storage.getQuoteItems(quoteId);
      for (const item of existingItems) {
        await storage.deleteQuoteItem(item.id);
      }
      
      // Create new items
      for (const item of req.body.items) {
        const quoteItem = insertQuoteItemSchema.parse({
          ...item,
          quoteId: quoteId,
        });
        await storage.createQuoteItem(quoteItem);
      }
    }
    
    // Get the updated quote with items
    const quoteItems = await storage.getQuoteItems(quoteId);
    
    res.json({ ...updatedQuote, items: quoteItems });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete a quote
router.delete("/quotes/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  const quoteId = parseInt(req.params.id);
  
  try {
    // Check if quote exists and belongs to the user's business
    const existingQuote = await storage.getQuote(quoteId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    if (existingQuote.businessId !== req.user.businessId) {
      return res.status(403).json({ error: "Not authorized to delete this quote" });
    }
    
    // Delete the quote (this will also delete related items due to our storage implementation)
    await storage.deleteQuote(quoteId);
    
    res.sendStatus(204);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Convert a quote to an invoice
router.post("/quotes/:id/convert", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  const quoteId = parseInt(req.params.id);
  
  try {
    // Check if quote exists and belongs to the user's business
    const existingQuote = await storage.getQuote(quoteId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    if (existingQuote.businessId !== req.user.businessId) {
      return res.status(403).json({ error: "Not authorized to convert this quote" });
    }
    
    // Check if quote is already converted
    if (existingQuote.status === 'converted') {
      return res.status(400).json({ 
        error: "Quote already converted",
        invoiceId: existingQuote.convertedToInvoiceId
      });
    }
    
    // Convert the quote to an invoice
    const invoice = await storage.convertQuoteToInvoice(quoteId);
    
    res.json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get items for a specific quote
router.get("/quotes/:id/items", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  const quoteId = parseInt(req.params.id);
  
  try {
    // Check if quote exists and belongs to the user's business
    const existingQuote = await storage.getQuote(quoteId);
    if (!existingQuote) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    if (existingQuote.businessId !== req.user.businessId) {
      return res.status(403).json({ error: "Not authorized to access this quote" });
    }
    
    const quoteItems = await storage.getQuoteItems(quoteId);
    res.json(quoteItems);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;