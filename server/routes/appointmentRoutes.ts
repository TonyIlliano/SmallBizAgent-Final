import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { insertAppointmentSchema } from "@shared/schema";
import { isAuthenticated, ApiKeyRequest } from "../auth";
import { dataCache } from "../services/callToolHandlers";
import { fireEvent } from "../services/webhookService";
import notificationService from "../services/notificationService";

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

router.get("/appointments", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const params: any = {};

    if (req.query.startDate) {
      params.startDate = new Date(req.query.startDate as string);
    }

    if (req.query.endDate) {
      params.endDate = new Date(req.query.endDate as string);
    }

    if (req.query.customerId) {
      const customerId = parseInt(req.query.customerId as string);
      if (isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      params.customerId = customerId;
    }

    if (req.query.staffId) {
      const staffId = parseInt(req.query.staffId as string);
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      params.staffId = staffId;
    }

    const appointments = await storage.getAppointments(businessId, params);

    // Fetch related data for each appointment
    const populatedAppointments = await Promise.all(
      appointments.map(async (appointment) => {
        const customer = await storage.getCustomer(appointment.customerId);
        const staff = appointment.staffId ? await storage.getStaffMember(appointment.staffId) : null;
        const service = appointment.serviceId ? await storage.getService(appointment.serviceId) : null;

        return {
          ...appointment,
          customer,
          staff,
          service
        };
      })
    );

    res.json(populatedAppointments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

router.get("/appointments/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }
    const appointment = await storage.getAppointment(id);
    if (!appointment || !verifyBusinessOwnership(appointment, req)) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Fetch related data in parallel
    const [customer, staff, service] = await Promise.all([
      storage.getCustomer(appointment.customerId),
      appointment.staffId ? storage.getStaffMember(appointment.staffId) : null,
      appointment.serviceId ? storage.getService(appointment.serviceId) : null,
    ]);

    res.json({
      ...appointment,
      customer,
      staff,
      service
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching appointment" });
  }
});

router.post("/appointments", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    console.log('Creating appointment, businessId:', businessId, 'body:', JSON.stringify(req.body));
    const validatedData = insertAppointmentSchema.parse({ ...req.body, businessId });
    console.log('Validated data:', JSON.stringify(validatedData));

    // Use transactional booking with double-booking prevention
    const { createAppointmentSafely } = await import('../services/appointmentService');
    const safeResult = await createAppointmentSafely(validatedData);
    if (!safeResult.success) {
      return res.status(409).json({ message: safeResult.error || 'Time slot is not available' });
    }
    const appointment = safeResult.appointment;

    // Invalidate appointments cache
    dataCache.invalidate(businessId, 'appointments');

    // Queue reliable background jobs (retried on failure via pg-boss)
    const { enqueue } = await import('../services/jobQueue');
    await enqueue('send-appointment-confirmation', { appointmentId: appointment.id, businessId });
    await enqueue('sync-calendar', { action: 'sync', appointmentId: appointment.id });
    await enqueue('fire-webhook-event', { businessId, event: 'appointment.created', payload: { appointment } });
    await enqueue('notify-owner', { type: 'new-booking', appointmentId: appointment.id, businessId });

    res.status(201).json(appointment);
  } catch (error) {
    console.error('Error creating appointment:', error);
    if (error instanceof z.ZodError) {
      console.error('Zod validation errors:', JSON.stringify(error.format()));
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error creating appointment" });
  }
});

router.put("/appointments/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }
    console.log('Updating appointment:', id, 'body:', JSON.stringify(req.body));
    const existing = await storage.getAppointment(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      console.log('Appointment not found or ownership failed:', existing);
      return res.status(404).json({ message: "Appointment not found" });
    }
    const validatedData = insertAppointmentSchema.partial().parse(req.body);
    console.log('Validated update data:', JSON.stringify(validatedData));

    // If the time is being changed, use safe transactional update with overlap prevention
    let appointment;
    if (validatedData.startDate && validatedData.endDate) {
      const { updateAppointmentSafely } = await import('../services/appointmentService');
      const staffIdForCheck = validatedData.staffId ?? existing.staffId;
      const { startDate, endDate, ...otherUpdates } = validatedData;
      const safeResult = await updateAppointmentSafely(
        id,
        existing.businessId,
        new Date(startDate),
        new Date(endDate),
        staffIdForCheck,
        otherUpdates
      );
      if (!safeResult.success) {
        return res.status(409).json({ message: safeResult.error || 'Time slot is not available' });
      }
      appointment = safeResult.appointment;
    } else {
      // Non-time updates (status change, notes, etc.) — no overlap risk
      appointment = await storage.updateAppointment(id, validatedData);
    }

    // Invalidate appointments cache
    dataCache.invalidate(existing.businessId, 'appointments');

    // Re-sync to Google Calendar if connected (fire-and-forget)
    const { CalendarService } = await import("../services/calendarService");
    const calendarServiceUpdate = new CalendarService();
    calendarServiceUpdate.syncAppointment(appointment.id).catch(err =>
      console.error('Background calendar sync error:', err)
    );

    // Fire webhook events (fire-and-forget)
    fireEvent(existing.businessId, 'appointment.updated', { appointment })
      .catch(err => console.error('Webhook fire error:', err));

    if (validatedData.status === 'completed' && existing.status !== 'completed') {
      // Queue reliable background jobs
      const { enqueue } = await import('../services/jobQueue');
      await enqueue('fire-webhook-event', { businessId: existing.businessId, event: 'appointment.completed', payload: { appointment } });
      await enqueue('dispatch-orchestration-event', {
        eventType: 'appointment.completed',
        businessId: existing.businessId,
        customerId: appointment.customerId || undefined,
        referenceType: 'appointment',
        referenceId: appointment.id,
      });
    }

    // Queue no-show recovery (reliable retry)
    if (validatedData.status === 'no_show' && existing.status !== 'no_show') {
      const { enqueue } = await import('../services/jobQueue');
      await enqueue('dispatch-orchestration-event', {
        eventType: 'appointment.no_show',
        businessId: existing.businessId,
        customerId: appointment.customerId || undefined,
        referenceType: 'appointment',
        referenceId: appointment.id,
      });
    }

    // Queue cancelled insights recalculation
    if (validatedData.status === 'cancelled' && existing.status !== 'cancelled') {
      const { enqueue } = await import('../services/jobQueue');
      await enqueue('dispatch-orchestration-event', {
        eventType: 'appointment.cancelled',
        businessId: existing.businessId,
        customerId: appointment.customerId || undefined,
        referenceType: 'appointment',
        referenceId: appointment.id,
      });
    }

    res.json(appointment);
  } catch (error) {
    console.error('Error updating appointment:', error);
    if (error instanceof z.ZodError) {
      console.error('Zod validation errors:', JSON.stringify(error.format()));
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error updating appointment" });
  }
});

router.delete("/appointments/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid appointment ID" });
    }
    const existing = await storage.getAppointment(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    const businessId = existing.businessId;

    // Delete from Google Calendar if synced (fire-and-forget)
    if (existing.googleCalendarEventId) {
      const { CalendarService } = await import("../services/calendarService");
      const calendarServiceDel = new CalendarService();
      calendarServiceDel.deleteAppointment(id).catch(err =>
        console.error('Background calendar delete error:', err)
      );
    }

    await storage.deleteAppointment(id, businessId);

    // Invalidate appointments cache
    dataCache.invalidate(businessId, 'appointments');

    // Fire webhook event (fire-and-forget)
    fireEvent(businessId, 'appointment.deleted', { appointmentId: id })
      .catch(err => console.error('Webhook fire error:', err));

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: "Error deleting appointment" });
  }
});

export default router;
