import { Router, Request, Response } from "express";
import { createHmac } from "crypto";
import { storage } from "../storage";

const router = Router();

// =================== EMAIL UNSUBSCRIBE ===================
// One-click unsubscribe from drip/marketing emails (CAN-SPAM compliant)
// Uses HMAC token to prevent unauthenticated abuse (anyone forging businessId)
router.get("/email/unsubscribe", async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.query.bid as string);
    const token = req.query.token as string;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).send("<h2>Invalid unsubscribe link.</h2>");
    }

    // Verify HMAC token to prevent unauthorized unsubscribes
    if (!token) {
      return res.status(400).send("<h2>Invalid unsubscribe link.</h2>");
    }

    const secret = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || 'unsubscribe-secret';
    const expectedToken = createHmac('sha256', secret)
      .update(`unsubscribe:${businessId}`)
      .digest('hex')
      .substring(0, 32);

    if (token !== expectedToken) {
      return res.status(403).send("<h2>Invalid or expired unsubscribe link.</h2>");
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).send("<h2>Business not found.</h2>");
    }

    // Set email_opt_out to true
    await storage.updateBusiness(businessId, { emailOptOut: true } as any);

    res.send(`
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 60px auto; text-align: center; padding: 20px;">
        <h2 style="color: #333;">You've been unsubscribed</h2>
        <p style="color: #666;">You will no longer receive marketing emails from SmallBizAgent.</p>
        <p style="color: #999; font-size: 13px; margin-top: 30px;">If this was a mistake, you can re-subscribe from your <a href="${process.env.APP_URL || 'https://www.smallbizagent.ai'}/settings">account settings</a>.</p>
      </div>
    `);
  } catch (error) {
    console.error("Error processing unsubscribe:", error);
    res.status(500).send("<h2>Something went wrong. Please try again.</h2>");
  }
});

export default router;
