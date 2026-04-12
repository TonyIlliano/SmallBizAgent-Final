import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { insertStaffSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated, hashPassword, validatePassword, ApiKeyRequest } from "../auth";
import { requireRole } from "../middleware/permissions";
import { dataCache } from "../services/callToolHandlers";

const router = Router();

// Helper to get businessId from authenticated request
const getBusinessId = (req: Request): number => {
  // If user is authenticated via session, use their businessId
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  // If authenticated via API key, use the attached businessId
  if ((req as ApiKeyRequest).apiKeyBusinessId) {
    return (req as ApiKeyRequest).apiKeyBusinessId!;
  }
  // No business associated - return 0 to indicate this
  // Callers should check for 0 and return appropriate error
  return 0;
};

// Helper to verify resource belongs to user's business
const verifyBusinessOwnership = (resource: { businessId: number } | null | undefined, req: Request): boolean => {
  if (!resource) return false;
  const userBusinessId = getBusinessId(req);
  return resource.businessId === userBusinessId;
};

// =================== STAFF API ===================

// Staff portal: Get my profile (staff only) — MUST be before /staff/:id
router.get("/staff/me", isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "staff") {
      return res.status(403).json({ message: "Staff access only" });
    }

    const staffMember = await storage.getStaffMemberByUserId(req.user.id);
    if (!staffMember) {
      return res.status(404).json({ message: "Staff profile not found" });
    }

    // Get the business info
    const business = await storage.getBusiness(staffMember.businessId);

    // Get staff hours
    const hours = await storage.getStaffHours(staffMember.id);

    res.json({
      ...staffMember,
      businessName: business?.name || "Unknown",
      hours,
    });
  } catch (error) {
    console.error("Error fetching staff profile:", error);
    res.status(500).json({ message: "Error fetching staff profile" });
  }
});

// Staff portal: Get my appointments (staff only) — MUST be before /staff/:id
router.get("/staff/me/appointments", isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "staff") {
      return res.status(403).json({ message: "Staff access only" });
    }

    const staffMember = await storage.getStaffMemberByUserId(req.user.id);
    if (!staffMember) {
      return res.status(404).json({ message: "Staff profile not found" });
    }

    const params: any = { staffId: staffMember.id };

    if (req.query.startDate) {
      params.startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      params.endDate = new Date(req.query.endDate as string);
    }

    const appointments = await storage.getAppointments(staffMember.businessId, params);

    // Populate with customer + service data
    const populatedAppointments = await Promise.all(
      appointments.map(async (appointment) => {
        const customer = await storage.getCustomer(appointment.customerId);
        const service = appointment.serviceId ? await storage.getService(appointment.serviceId) : null;
        return {
          ...appointment,
          customer: customer || null,
          service: service || null,
        };
      })
    );

    res.json(populatedAppointments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching staff appointments" });
  }
});

// Staff portal: Get my time-off entries (staff only) — MUST be before /staff/:id
router.get("/staff/me/time-off", isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "staff") {
      return res.status(403).json({ message: "Staff access only" });
    }
    const staffMember = await storage.getStaffMemberByUserId(req.user.id);
    if (!staffMember) {
      return res.status(404).json({ message: "Staff profile not found" });
    }
    const entries = await storage.getStaffTimeOff(staffMember.id);
    res.json(entries);
  } catch (error) {
    console.error("Error fetching staff time off:", error);
    res.status(500).json({ message: "Error fetching time off" });
  }
});

// Staff portal: Add my own time-off (staff only) — MUST be before /staff/:id
router.post("/staff/me/time-off", isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "staff") {
      return res.status(403).json({ message: "Staff access only" });
    }
    const staffMember = await storage.getStaffMemberByUserId(req.user.id);
    if (!staffMember) {
      return res.status(404).json({ message: "Staff profile not found" });
    }

    const { startDate, endDate, reason, allDay, note } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    if (end < start) {
      return res.status(400).json({ message: "End date must be on or after start date" });
    }

    const entry = await storage.createStaffTimeOff({
      staffId: staffMember.id,
      businessId: staffMember.businessId,
      startDate: start,
      endDate: end,
      reason: reason || null,
      allDay: allDay !== false,
      note: note || null,
    });

    // Invalidate availability cache
    dataCache.invalidate(staffMember.businessId);

    res.status(201).json(entry);
  } catch (error) {
    console.error("Error creating staff time off:", error);
    res.status(500).json({ message: "Error creating time off" });
  }
});

// Staff portal: Delete my own time-off (staff only) — MUST be before /staff/:id
router.delete("/staff/me/time-off/:timeOffId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "staff") {
      return res.status(403).json({ message: "Staff access only" });
    }
    const staffMember = await storage.getStaffMemberByUserId(req.user.id);
    if (!staffMember) {
      return res.status(404).json({ message: "Staff profile not found" });
    }
    const timeOffId = parseInt(req.params.timeOffId);
    if (isNaN(timeOffId)) {
      return res.status(400).json({ message: "Invalid time off ID" });
    }
    // Delete scoped to their businessId (ensures they can only delete their own)
    await storage.deleteStaffTimeOff(timeOffId, staffMember.businessId);

    // Invalidate availability cache
    dataCache.invalidate(staffMember.businessId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting staff time off:", error);
    res.status(500).json({ message: "Error deleting time off" });
  }
});

router.get("/staff", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const staff = await storage.getStaff(businessId);
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: "Error fetching staff" });
  }
});

router.get("/staff/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const staffMember = await storage.getStaffMember(id);
    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    res.json(staffMember);
  } catch (error) {
    res.status(500).json({ message: "Error fetching staff member" });
  }
});

router.post("/staff", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    console.log('Creating staff member:', { ...req.body, businessId });
    const validatedData = insertStaffSchema.parse({ ...req.body, businessId });
    console.log('Validated data:', validatedData);
    const staffMember = await storage.createStaffMember(validatedData);

    // Invalidate staff cache
    dataCache.invalidate(businessId, 'staff');

    res.status(201).json(staffMember);
  } catch (error) {
    console.error('Error creating staff member:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error creating staff member" });
  }
});

router.put("/staff/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const existing = await storage.getStaffMember(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    const validatedData = insertStaffSchema.partial().parse(req.body);
    const staffMember = await storage.updateStaffMember(id, validatedData);

    // Invalidate staff cache
    dataCache.invalidate(existing.businessId, 'staff');

    res.json(staffMember);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error updating staff member" });
  }
});

router.delete("/staff/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const existing = await storage.getStaffMember(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    const businessId = existing.businessId;
    await storage.deleteStaffMember(id);

    // Invalidate staff and staff hours cache
    dataCache.invalidate(businessId, 'staff');
    dataCache.invalidate(businessId, 'staffHours');

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: "Error deleting staff member" });
  }
});

// =================== STAFF HOURS API ===================
// Get hours for a staff member
router.get("/staff/:id/hours", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const staffId = parseInt(req.params.id);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const staffMember = await storage.getStaffMember(staffId);

    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    const hours = await storage.getStaffHours(staffId);
    res.json(hours);
  } catch (error) {
    res.status(500).json({ message: "Error getting staff hours" });
  }
});

// Set hours for a staff member (replaces all hours)
router.put("/staff/:id/hours", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const staffId = parseInt(req.params.id);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    console.log('Setting staff hours for staffId:', staffId, 'body:', JSON.stringify(req.body));
    const staffMember = await storage.getStaffMember(staffId);

    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      console.log('Staff member not found or ownership failed:', staffMember);
      return res.status(404).json({ message: "Staff member not found" });
    }

    const hours = req.body.hours || req.body;
    console.log('Hours to save:', JSON.stringify(hours));
    const savedHours = await storage.setStaffHours(staffId, hours);

    // Invalidate staff hours cache
    dataCache.invalidate(staffMember.businessId, 'staffHours');

    res.json(savedHours);
  } catch (error) {
    console.error('Error setting staff hours:', error);
    res.status(500).json({ message: "Error setting staff hours" });
  }
});

// Update hours for a specific day
router.put("/staff/:id/hours/:day", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const staffId = parseInt(req.params.id);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const day = req.params.day.toLowerCase();
    const staffMember = await storage.getStaffMember(staffId);

    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    const updatedHours = await storage.updateStaffHoursForDay(staffId, day, req.body);

    // Invalidate staff hours cache
    dataCache.invalidate(staffMember.businessId, 'staffHours');

    res.json(updatedHours);
  } catch (error) {
    console.error('Error updating staff hours:', error);
    res.status(500).json({ message: "Error updating staff hours" });
  }
});

// Get available staff for a specific time slot
router.get("/staff/available", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const dateStr = req.query.date as string;
    const time = req.query.time as string;

    if (!dateStr || !time) {
      return res.status(400).json({ message: "Date and time are required" });
    }

    const date = new Date(dateStr);
    const availableStaff = await storage.getAvailableStaffForSlot(businessId, date, time);
    res.json(availableStaff);
  } catch (error) {
    console.error('Error getting available staff:', error);
    res.status(500).json({ message: "Error getting available staff" });
  }
});

// =================== STAFF-SERVICE ASSIGNMENTS ===================

// Get services assigned to a staff member
router.get("/staff/:id/services", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const staffId = parseInt(req.params.id);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const staffMember = await storage.getStaffMember(staffId);
    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    const serviceIds = await storage.getStaffServices(staffId);
    res.json({ serviceIds });
  } catch (error) {
    console.error('Error getting staff services:', error);
    res.status(500).json({ message: "Error getting staff services" });
  }
});

// Set services for a staff member (replace all)
router.put("/staff/:id/services", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const staffId = parseInt(req.params.id);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const staffMember = await storage.getStaffMember(staffId);
    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    const { serviceIds } = req.body;
    if (!Array.isArray(serviceIds)) {
      return res.status(400).json({ message: "serviceIds must be an array" });
    }
    await storage.setStaffServices(staffId, serviceIds);
    dataCache.invalidate(staffMember.businessId, 'staffServiceMap');
    res.json({ success: true, serviceIds });
  } catch (error) {
    console.error('Error setting staff services:', error);
    res.status(500).json({ message: "Error setting staff services" });
  }
});

// =================== STAFF PORTAL API ===================

// Send invite to a staff member (owner only)
router.post("/staff/:id/invite", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const staffId = parseInt(req.params.id);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const staffMember = await storage.getStaffMember(staffId);
    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    const email = req.body.email || staffMember.email;
    if (!email) {
      return res.status(400).json({ message: "Email is required to send an invite" });
    }

    // Generate unique invite code
    const { randomBytes } = await import("crypto");
    const inviteCode = randomBytes(24).toString("hex");

    // Create invite with 7-day expiry
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await storage.createStaffInvite({
      businessId: staffMember.businessId,
      staffId: staffMember.id,
      email,
      inviteCode,
      status: "pending",
      expiresAt,
    });

    // Update staff email if provided
    if (req.body.email && req.body.email !== staffMember.email) {
      await storage.updateStaffMember(staffId, { email: req.body.email });
    }

    // Send invite email to staff member
    const business = await storage.getBusiness(staffMember.businessId);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fullInviteUrl = `${baseUrl}/staff/join/${inviteCode}`;
    const staffName = `${staffMember.firstName}${staffMember.lastName ? ` ${staffMember.lastName}` : ""}`;

    // Send invite via email
    try {
      const { sendStaffInviteEmail } = await import("../emailService");
      await sendStaffInviteEmail(email, staffName, business?.name || "Your Team", fullInviteUrl);
      console.log(`Staff invite email sent to ${email} for business ${staffMember.businessId}`);
    } catch (emailError) {
      console.error("Failed to send invite email (invite still created):", emailError);
    }

    // Also send invite via SMS if staff member has a phone number
    if (staffMember.phone) {
      try {
        const twilioService = await import("../services/twilioService");
        const businessName = business?.name || "Your Team";
        await twilioService.sendSms(
          staffMember.phone,
          `${businessName} has invited you to join their team on SmallBizAgent! Create your account here: ${fullInviteUrl}`
        );
        console.log(`Staff invite SMS sent to ${staffMember.phone}`);
      } catch (smsError) {
        console.error("Failed to send invite SMS (invite still created):", smsError);
      }
    }

    res.status(201).json({
      ...invite,
      inviteUrl: `/staff/join/${inviteCode}`,
    });
  } catch (error) {
    console.error("Error creating staff invite:", error);
    res.status(500).json({ message: "Error creating staff invite" });
  }
});

// Get invites for a business (owner only)
router.get("/staff-invites", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const invites = await storage.getStaffInvitesByBusiness(businessId);
    res.json(invites);
  } catch (error) {
    res.status(500).json({ message: "Error fetching invites" });
  }
});

// Validate invite code (public - no auth needed)
router.get("/staff-invite/:code", async (req: Request, res: Response) => {
  try {
    const invite = await storage.getStaffInviteByCode(req.params.code);
    if (!invite) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ message: "This invite has already been used" });
    }

    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ message: "This invite has expired" });
    }

    // Get business and staff info for the registration page
    const business = await storage.getBusiness(invite.businessId);
    const staffMember = await storage.getStaffMember(invite.staffId);

    res.json({
      valid: true,
      businessName: business?.name || "Unknown Business",
      staffName: staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : "Staff",
      email: invite.email,
    });
  } catch (error) {
    res.status(500).json({ message: "Error validating invite" });
  }
});

// Accept invite - register as staff member (public - no auth)
router.post("/staff-invite/:code/accept", async (req: Request, res: Response) => {
  try {
    const invite = await storage.getStaffInviteByCode(req.params.code);
    if (!invite) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({ message: "This invite has already been used" });
    }

    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ message: "This invite has expired" });
    }

    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        message: "Password does not meet security requirements",
        details: passwordValidation.errors,
      });
    }

    // Check if username already exists
    const existingUser = await storage.getUserByUsername(username.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Check if email already exists
    const existingEmail = await storage.getUserByEmail(email || invite.email);
    if (existingEmail) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // Create the user account with staff role
    const hashedPassword = await hashPassword(password);
    const user = await storage.createUser({
      username: username.toLowerCase(),
      email: email || invite.email,
      password: hashedPassword,
      role: "staff",
      businessId: invite.businessId,
    });

    // Mark email as verified (they accepted an invite, so we trust the email)
    await storage.updateUser(user.id, { emailVerified: true });

    // Link user to staff record
    await storage.updateStaffMember(invite.staffId, { userId: user.id });

    // Mark invite as accepted
    await storage.updateStaffInvite(invite.id, { status: "accepted" });

    // Log them in
    req.login(user, (err: Error | null) => {
      if (err) {
        return res.status(500).json({ message: "Account created but login failed" });
      }
      const { password: _, ...userWithoutPassword } = user;
      return res.status(201).json(userWithoutPassword);
    });
  } catch (error) {
    console.error("Error accepting staff invite:", error);
    res.status(500).json({ message: "Error creating staff account" });
  }
});

// =================== STAFF TIME OFF API ===================

// Get all time-off entries for a business
router.get("/staff/time-off", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const entries = await storage.getStaffTimeOffByBusiness(businessId);
    res.json(entries);
  } catch (error) {
    console.error("Error fetching staff time off:", error);
    res.status(500).json({ message: "Error fetching time off entries" });
  }
});

// Get time-off entries for a specific staff member
router.get("/staff/:id/time-off", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const staffId = parseInt(req.params.id);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const staffMember = await storage.getStaffMember(staffId);
    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }
    const entries = await storage.getStaffTimeOff(staffId);
    res.json(entries);
  } catch (error) {
    console.error("Error fetching staff time off:", error);
    res.status(500).json({ message: "Error fetching time off entries" });
  }
});

// Create a time-off entry
router.post("/staff/:id/time-off", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const staffId = parseInt(req.params.id);
    if (isNaN(staffId)) {
      return res.status(400).json({ message: "Invalid staff ID" });
    }
    const staffMember = await storage.getStaffMember(staffId);
    if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    const businessId = getBusinessId(req);
    const { startDate, endDate, reason, allDay, note } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    if (end < start) {
      return res.status(400).json({ message: "End date must be on or after start date" });
    }

    const entry = await storage.createStaffTimeOff({
      staffId,
      businessId,
      startDate: start,
      endDate: end,
      reason: reason || null,
      allDay: allDay !== false, // default to true
      note: note || null,
    });

    // Invalidate availability cache so Retell picks up time-off changes
    dataCache.invalidate(businessId);

    res.status(201).json(entry);
  } catch (error) {
    console.error("Error creating staff time off:", error);
    res.status(500).json({ message: "Error creating time off entry" });
  }
});

// Update a time-off entry
router.put("/staff/time-off/:timeOffId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const timeOffId = parseInt(req.params.timeOffId);
    if (isNaN(timeOffId)) {
      return res.status(400).json({ message: "Invalid time off ID" });
    }
    const businessId = getBusinessId(req);
    const { startDate, endDate, reason, allDay, note } = req.body;

    const updateData: any = {};
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (reason !== undefined) updateData.reason = reason;
    if (allDay !== undefined) updateData.allDay = allDay;
    if (note !== undefined) updateData.note = note;

    const updated = await storage.updateStaffTimeOff(timeOffId, businessId, updateData);
    if (!updated) {
      return res.status(404).json({ message: "Time off entry not found" });
    }

    // Invalidate availability cache so Retell picks up time-off changes
    dataCache.invalidate(businessId);

    res.json(updated);
  } catch (error) {
    console.error("Error updating staff time off:", error);
    res.status(500).json({ message: "Error updating time off entry" });
  }
});

// Delete a time-off entry
router.delete("/staff/time-off/:timeOffId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const timeOffId = parseInt(req.params.timeOffId);
    if (isNaN(timeOffId)) {
      return res.status(400).json({ message: "Invalid time off ID" });
    }
    const businessId = getBusinessId(req);
    await storage.deleteStaffTimeOff(timeOffId, businessId);

    // Invalidate availability cache so Retell picks up time-off changes
    dataCache.invalidate(businessId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting staff time off:", error);
    res.status(500).json({ message: "Error deleting time off entry" });
  }
});

// =================== TEAM MANAGEMENT API ===================

// GET /team — List all team members for the business
router.get("/team", isAuthenticated, requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) {
      return res.status(400).json({ message: "No business associated with this account" });
    }

    const members = await storage.getTeamMembers(businessId);
    res.json(members);
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ message: "Error fetching team members" });
  }
});

// POST /team/invite — Invite a team member
router.post("/team/invite", isAuthenticated, requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) {
      return res.status(400).json({ message: "No business associated with this account" });
    }

    const { email, role, staffId } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (!role || !['manager', 'staff'].includes(role)) {
      return res.status(400).json({ message: "Role must be 'manager' or 'staff'" });
    }

    // If staffId provided, verify staff belongs to this business
    if (staffId) {
      const staffIdNum = parseInt(staffId);
      if (isNaN(staffIdNum)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const staffMember = await storage.getStaffMember(staffIdNum);
      if (!staffMember || staffMember.businessId !== businessId) {
        return res.status(404).json({ message: "Staff member not found" });
      }
    }

    // Generate unique invite code
    const { randomBytes } = await import("crypto");
    const inviteCode = randomBytes(24).toString("hex");

    // Create invite with 7-day expiry
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await storage.createStaffInvite({
      businessId,
      staffId: staffId ? parseInt(staffId) : 0,
      email,
      inviteCode,
      status: "pending",
      expiresAt,
    });

    // Send invite email
    const business = await storage.getBusiness(businessId);
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const fullInviteUrl = `${baseUrl}/staff/join/${inviteCode}`;

    try {
      const { sendEmail } = await import("../emailService");
      await sendEmail({
        to: email,
        subject: `You're invited to join ${business?.name || 'a business'} on SmallBizAgent`,
        text: `You've been invited to join ${business?.name || 'a business'} on SmallBizAgent as a ${role}.\n\nClick the link below to create your account:\n${fullInviteUrl}\n\nThis invite link expires in 7 days.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">You're Invited!</h2>
            <p>You've been invited to join <strong>${business?.name || 'a business'}</strong> on SmallBizAgent as a <strong>${role}</strong>.</p>
            <p style="margin: 30px 0; text-align: center;">
              <a href="${fullInviteUrl}" style="display: inline-block; background-color: #000; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Accept Invite
              </a>
            </p>
            <p style="color: #888; font-size: 13px;">This invite link expires in 7 days.</p>
          </div>
        `,
      });
      console.log(`Team invite email sent to ${email} for business ${businessId} (role: ${role})`);
    } catch (emailError) {
      console.error("Failed to send team invite email (invite still created):", emailError);
    }

    res.status(201).json({
      inviteCode,
      expiresAt,
    });
  } catch (error) {
    console.error("Error inviting team member:", error);
    res.status(500).json({ message: "Error inviting team member" });
  }
});

// PUT /team/:userId/role — Change a team member's role
router.put("/team/:userId/role", isAuthenticated, requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) {
      return res.status(400).json({ message: "No business associated with this account" });
    }

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const { role } = req.body;
    if (!role || !['manager', 'staff'].includes(role)) {
      return res.status(400).json({ message: "Role must be 'manager' or 'staff'" });
    }

    // Owner can't change their own role
    if (userId === req.user!.id) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }

    // Verify the user has access to this business
    const hasAccess = await storage.hasBusinessAccess(userId, businessId);
    if (!hasAccess) {
      return res.status(404).json({ message: "Team member not found" });
    }

    await storage.updateTeamMemberRole(userId, businessId, role);
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating team member role:", error);
    res.status(500).json({ message: "Error updating team member role" });
  }
});

// DELETE /team/:userId — Remove a team member
router.delete("/team/:userId", isAuthenticated, requireRole('owner'), async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) {
      return res.status(400).json({ message: "No business associated with this account" });
    }

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Owner can't remove themselves
    if (userId === req.user!.id) {
      return res.status(400).json({ message: "You cannot remove yourself from the team" });
    }

    // Verify the user has access to this business
    const hasAccess = await storage.hasBusinessAccess(userId, businessId);
    if (!hasAccess) {
      return res.status(404).json({ message: "Team member not found" });
    }

    // Remove from user_business_access
    await storage.removeTeamMember(userId, businessId);

    // If user's primary businessId is this business, clear it
    const user = await storage.getUser(userId);
    if (user && user.businessId === businessId) {
      await storage.updateUser(userId, { businessId: null });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing team member:", error);
    res.status(500).json({ message: "Error removing team member" });
  }
});

export default router;
