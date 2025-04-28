import { Request, Response } from "express";
import { z } from "zod";
import * as lexTrainingService from "../services/lexTrainingService";
import * as lexService from "../services/lexService";
import * as intentTemplateService from "../services/intentTemplateService";
import { isAuthenticated } from "../auth";

// Define schemas for validation
export const intentSchema = z.object({
  name: z.string().min(3, "Intent name must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  sampleUtterances: z.array(
    z.string().min(3, "Each utterance must be at least 3 characters")
  ).min(1, "At least one sample utterance is required"),
});

export type IntentFormData = z.infer<typeof intentSchema>;

// Register training routes
export function registerTrainingRoutes(app: any) {
  /**
   * Get training status
   */
  app.get("/api/training/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const status = await lexTrainingService.getTrainingStatus();
      res.json(status);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error getting training status:", errorMessage);
      res.status(500).json({ 
        message: "Error getting training status", 
        error: errorMessage 
      });
    }
  });

  /**
   * Get all intents
   */
  app.get("/api/training/intents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      let intents;
      
      // Try to get real intents from AWS Lex
      try {
        intents = await lexTrainingService.listIntents();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn("Using simulated intents due to AWS error:", errorMessage);
        intents = null;
      }
      
      // If no AWS credentials or error occurred, use simulated intents
      if (!intents) {
        intents = lexTrainingService.getSimulatedIntents();
      }
      
      res.json(intents);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error listing intents:", errorMessage);
      res.status(500).json({ 
        message: "Error listing intents", 
        error: errorMessage 
      });
    }
  });

  /**
   * Get specific intent
   */
  app.get("/api/training/intents/:intentId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const intentId = req.params.intentId;
      const intent = await lexTrainingService.getIntent(intentId);
      
      if (!intent) {
        return res.status(404).json({ message: "Intent not found" });
      }
      
      res.json(intent);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error getting intent:", errorMessage);
      res.status(500).json({ 
        message: "Error getting intent", 
        error: errorMessage 
      });
    }
  });

  /**
   * Create new intent
   */
  app.post("/api/training/intents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate request data
      const validatedData = intentSchema.parse(req.body);
      
      // Create intent in AWS Lex
      const result = await lexTrainingService.createIntent(validatedData);
      
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.format() 
        });
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error creating intent:", errorMessage);
      res.status(500).json({ 
        message: "Error creating intent", 
        error: errorMessage 
      });
    }
  });

  /**
   * Update existing intent
   */
  app.put("/api/training/intents/:intentId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const intentId = req.params.intentId;
      
      // Validate request data
      const validatedData = intentSchema.parse(req.body);
      
      // Update intent in AWS Lex
      const result = await lexTrainingService.updateIntent(intentId, validatedData);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.format() 
        });
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error updating intent:", errorMessage);
      res.status(500).json({ 
        message: "Error updating intent", 
        error: errorMessage 
      });
    }
  });

  /**
   * Delete intent
   */
  app.delete("/api/training/intents/:intentId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const intentId = req.params.intentId;
      
      // Delete intent from AWS Lex
      const result = await lexTrainingService.deleteIntent(intentId);
      
      res.json({ message: "Intent deleted successfully", result });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error deleting intent:", errorMessage);
      res.status(500).json({ 
        message: "Error deleting intent", 
        error: errorMessage 
      });
    }
  });

  /**
   * Build bot to apply changes
   */
  app.post("/api/training/build", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Build the bot to apply changes
      const result = await lexTrainingService.buildBotLocale();
      
      res.json({ 
        message: "Bot build initiated successfully", 
        result 
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error building bot:", errorMessage);
      res.status(500).json({ 
        message: "Error building bot", 
        error: errorMessage 
      });
    }
  });

  /**
   * Test utterance against the trained bot
   */
  app.post("/api/training/test", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate request
      const testSchema = z.object({
        utterance: z.string().min(1, "Utterance cannot be empty")
      });
      
      const { utterance } = testSchema.parse(req.body);
      
      // Generate a unique user ID and session ID for this test
      const userId = `test-${req.user?.id || 'user'}-${Date.now()}`;
      const sessionId = `test-session-${Date.now()}`;
      
      // Process the utterance through Lex
      let response;
      try {
        // Try to use the real Lex service
        response = await lexService.sendTextInput(userId, utterance, sessionId);
      } catch (error) {
        // Fallback to simulation if real Lex call fails
        console.warn("Using simulated response for test:", error);
        response = null;
      }
      
      // If we couldn't get a real response, use the analyzer
      if (!response) {
        const analysis = lexService.analyzeText(utterance);
        response = {
          intentName: analysis.intent,
          confidence: analysis.confidence,
          dialogState: 'ReadyForFulfillment',
          message: "This is a simulated response."
        };
      }
      
      // Format the response for the client
      res.json({
        intent: response.intentName || 'Unknown',
        confidence: typeof response.confidence === 'number' ? response.confidence : 0.5,
        message: response.message || "",
        dialogState: response.dialogState || "Unknown",
        isSimulated: !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.format() 
        });
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error testing utterance:", errorMessage);
      res.status(500).json({ 
        message: "Error testing utterance", 
        error: errorMessage 
      });
    }
  });

  /**
   * Get all common intent templates
   */
  app.get("/api/training/templates/common", isAuthenticated, (req: Request, res: Response) => {
    try {
      const templates = intentTemplateService.getCommonIntents();
      res.json(templates);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error getting common intent templates:", errorMessage);
      res.status(500).json({ 
        message: "Error getting common intent templates", 
        error: errorMessage 
      });
    }
  });

  /**
   * Get all available industry types
   */
  app.get("/api/training/templates/industries", isAuthenticated, (req: Request, res: Response) => {
    try {
      const industries = intentTemplateService.getAvailableIndustryTypes();
      res.json(industries);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error getting industry types:", errorMessage);
      res.status(500).json({ 
        message: "Error getting industry types", 
        error: errorMessage 
      });
    }
  });
  
  /**
   * Get available intent templates for a specific industry
   */
  app.get("/api/training/templates/:industry", isAuthenticated, (req: Request, res: Response) => {
    try {
      const industry = req.params.industry;
      const templates = intentTemplateService.getAllIntentTemplates(industry);
      res.json(templates);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error getting intent templates:", errorMessage);
      res.status(500).json({ 
        message: "Error getting intent templates", 
        error: errorMessage 
      });
    }
  });

  /**
   * Apply a template to create a new intent
   */
  app.post("/api/training/templates/apply", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate request
      const applyTemplateSchema = z.object({
        templateId: z.string(),
        industry: z.string()
      });
      
      const { templateId, industry } = applyTemplateSchema.parse(req.body);
      
      // Get the templates for the industry
      const templates = intentTemplateService.getAllIntentTemplates(industry);
      
      // Find the specific template
      const template = templates.find(t => t.id === templateId);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Convert to bot intent format
      const botIntent = intentTemplateService.templateToBotIntent(template);
      
      // Create the intent
      const result = await lexTrainingService.createIntent(botIntent);
      
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.format() 
        });
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error applying template:", errorMessage);
      res.status(500).json({ 
        message: "Error applying template", 
        error: errorMessage 
      });
    }
  });
}