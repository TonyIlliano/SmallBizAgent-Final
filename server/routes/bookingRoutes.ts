import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import crypto from "crypto";
import { fireEvent } from "../services/webhookService";
import notificationService from "../services/notificationService";
import { createDateInTimezone, getTimezoneAbbreviation, formatTimeWithTimezone } from "../utils/timezone";

const router = Router();

// Get business info for booking page (public route, no auth required)
router.get("/book/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // Find the business by booking slug
    const business = await storage.getBusinessByBookingSlug(slug);

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Check if booking is enabled for this business
    if (!business.bookingEnabled) {
      return res.status(400).json({ error: "Online booking is not available for this business" });
    }

    // Get active services for this business
    const allServices = await storage.getServices(business.id);
    const activeServices = allServices.filter(s => s.active);

    // Get active staff for this business
    const allStaff = await storage.getStaff(business.id);
    const activeStaff = allStaff.filter(s => s.active);

    // Get business hours
    const hours = await storage.getBusinessHours(business.id);

    // Get staff-service assignments (for filtering on booking page)
    const staffServiceAssignments = await storage.getStaffServicesForBusiness(business.id);
    // Build a map: staffId → serviceId[] (empty array = can do all services)
    const staffServicesMap: Record<number, number[]> = {};
    for (const assignment of staffServiceAssignments) {
      if (!staffServicesMap[assignment.staffId]) {
        staffServicesMap[assignment.staffId] = [];
      }
      staffServicesMap[assignment.staffId].push(assignment.serviceId);
    }

    // Return public business info (no sensitive data)
    res.json({
      business: {
        id: business.id,
        name: business.name,
        address: business.address,
        city: business.city,
        state: business.state,
        zip: business.zip,
        phone: business.phone,
        email: business.email,
        website: business.website,
        logoUrl: business.logoUrl,
        timezone: business.timezone,
        timezoneAbbr: getTimezoneAbbreviation(business.timezone || 'America/New_York'),
        industry: business.industry,
        description: business.description || null,
        bookingLeadTimeHours: business.bookingLeadTimeHours || 24,
        bookingBufferMinutes: business.bookingBufferMinutes || 15,
      },
      services: activeServices.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        price: s.price,
        duration: s.duration,
      })),
      staff: activeStaff.map(s => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        specialty: s.specialty,
        bio: s.bio,
        photoUrl: s.photoUrl,
      })),
      businessHours: hours,
      // Staff-service map: staffId → serviceId[] (empty/missing = all services)
      staffServices: staffServicesMap,
      // Reservation config (restaurants only)
      reservation: (business.industry === 'restaurant' && business.reservationEnabled) ? {
        enabled: true,
        maxPartySize: business.reservationMaxPartySize || 10,
        slotDurationMinutes: business.reservationSlotDurationMinutes || 90,
        maxCapacityPerSlot: business.reservationMaxCapacityPerSlot || 40,
        leadTimeHours: business.reservationLeadTimeHours || 2,
        maxDaysAhead: business.reservationMaxDaysAhead || 30,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching booking info:", error);
    res.status(500).json({ error: "Failed to fetch booking information" });
  }
});

// Get available time slots for a specific date and service (public route)
router.get("/book/:slug/slots", async (req, res) => {
  try {
    const { slug } = req.params;
    const { date, serviceId, staffId } = req.query;

    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }

    // Find the business
    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business || !business.bookingEnabled) {
      return res.status(404).json({ error: "Business not found or booking not available" });
    }

    const requestedDate = new Date(date as string);
    const now = new Date();
    const businessTimezone = business.timezone || 'America/New_York';

    // Check lead time (minimum hours notice required)
    const leadTimeMs = (business.bookingLeadTimeHours || 24) * 60 * 60 * 1000;
    const minBookingTime = new Date(now.getTime() + leadTimeMs);

    if (requestedDate < minBookingTime) {
      return res.status(400).json({
        error: `Bookings require at least ${business.bookingLeadTimeHours || 24} hours notice`
      });
    }

    // Get service duration (default to 60 minutes if not specified)
    let serviceDuration = 60;
    if (serviceId) {
      const service = await storage.getService(parseInt(serviceId as string));
      if (service && service.duration) {
        serviceDuration = service.duration;
      }
    }

    // Get the day of week in business timezone
    const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: businessTimezone }).toLowerCase();

    // Get business hours for this day
    const hours = await storage.getBusinessHours(business.id);
    const dayHours = hours.find(h => h.day.toLowerCase() === dayName);

    if (!dayHours || dayHours.isClosed || !dayHours.open || !dayHours.close) {
      return res.json({ slots: [], message: "Business is closed on this day" });
    }

    // Generate time slots based on business hours
    const slots: { time: string; available: boolean; staffAvailable: number[] }[] = [];
    const bufferMinutes = business.bookingBufferMinutes || 15;
    const slotInterval = business.bookingSlotIntervalMinutes || 30; // Configurable slot interval

    const [openHour, openMin] = dayHours.open.split(':').map(Number);
    const [closeHour, closeMin] = dayHours.close.split(':').map(Number);

    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;

    // Get existing appointments for this day (use timezone-aware boundaries)
    const [rYear, rMonth, rDay] = (date as string).split('-').map(Number);
    const startOfDay = createDateInTimezone(rYear, rMonth - 1, rDay, 0, 0, businessTimezone);
    const endOfDay = createDateInTimezone(rYear, rMonth - 1, rDay, 23, 59, businessTimezone);

    const existingAppointments = await storage.getAppointments(business.id, {
      startDate: startOfDay,
      endDate: endOfDay,
    });

    // Get staff to check availability
    const allStaff = await storage.getStaff(business.id);
    const activeStaff = allStaff.filter(s => s.active);

    // If a specific staff member is requested, filter to just them
    let staffToCheck = activeStaff;
    if (staffId) {
      staffToCheck = activeStaff.filter(s => s.id === parseInt(staffId as string));
    }

    // Filter staff by service assignments — only staff who can do this service should count
    // Backward compat: staff with NO assignments can do ALL services
    if (serviceId) {
      const parsedServiceId = parseInt(serviceId as string);
      const eligibleStaff: typeof staffToCheck = [];
      for (const s of staffToCheck) {
        const assignedServices = await storage.getStaffServices(s.id);
        if (assignedServices.length === 0 || assignedServices.includes(parsedServiceId)) {
          eligibleStaff.push(s);
        }
      }
      staffToCheck = eligibleStaff;
    }

    // Generate slots
    for (let minutes = openMinutes; minutes + serviceDuration <= closeMinutes; minutes += slotInterval) {
      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

      // Check which staff members are available for this slot
      const availableStaffIds: number[] = [];

      for (const staffMember of staffToCheck) {
        // Check staff's individual hours for this day
        const staffDayHours = await storage.getStaffHoursByDay(staffMember.id, dayName);

        if (staffDayHours?.isOff) continue; // Staff has day off

        // If staff has specific hours, check if slot is within them
        if (staffDayHours?.startTime && staffDayHours?.endTime) {
          const [staffStartH, staffStartM] = staffDayHours.startTime.split(':').map(Number);
          const [staffEndH, staffEndM] = staffDayHours.endTime.split(':').map(Number);
          const staffStartMinutes = staffStartH * 60 + staffStartM;
          const staffEndMinutes = staffEndH * 60 + staffEndM;

          if (minutes < staffStartMinutes || minutes + serviceDuration > staffEndMinutes) {
            continue; // Outside staff's working hours
          }
        }

        // Check for conflicting appointments
        const hasConflict = existingAppointments.some(apt => {
          if (apt.staffId !== staffMember.id) return false;
          if (apt.status === 'cancelled') return false;

          const aptStart = new Date(apt.startDate);
          const aptEnd = new Date(apt.endDate);
          const slotStart = createDateInTimezone(rYear, rMonth - 1, rDay, hour, min, businessTimezone);
          const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);

          // Check for overlap (including buffer time)
          const aptStartWithBuffer = aptStart.getTime() - bufferMinutes * 60 * 1000;
          const aptEndWithBuffer = aptEnd.getTime() + bufferMinutes * 60 * 1000;

          return (slotStart.getTime() < aptEndWithBuffer && slotEnd.getTime() > aptStartWithBuffer);
        });

        if (!hasConflict) {
          availableStaffIds.push(staffMember.id);
        }
      }

      // Check if the slot is in the past (for today)
      const slotDateTime = new Date(requestedDate);
      slotDateTime.setHours(hour, min, 0, 0);
      const isInPast = slotDateTime <= minBookingTime;

      slots.push({
        time: timeStr,
        available: !isInPast && availableStaffIds.length > 0,
        staffAvailable: availableStaffIds,
      });
    }

    // Include timezone abbreviation so frontend can show "2:30 PM EST"
    const timezoneAbbr = getTimezoneAbbreviation(businessTimezone, requestedDate);

    res.json({ slots, timezone: businessTimezone, timezoneAbbr });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    res.status(500).json({ error: "Failed to fetch available time slots" });
  }
});

// Create a booking (public route)
router.post("/book/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // Validate request body
    const bookingSchema = z.object({
      serviceId: z.number(),
      staffId: z.number().optional(),
      date: z.string(), // YYYY-MM-DD
      time: z.string(), // HH:MM
      customer: z.object({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        email: z.string().email("Valid email is required"),
        phone: z.string().min(1, "Phone number is required"),
      }),
      notes: z.string().optional(),
    });

    const validatedData = bookingSchema.parse(req.body);

    // Find the business
    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business || !business.bookingEnabled) {
      return res.status(404).json({ error: "Business not found or booking not available" });
    }

    // Get service to determine duration
    const service = await storage.getService(validatedData.serviceId);
    if (!service || service.businessId !== business.id) {
      return res.status(400).json({ error: "Invalid service" });
    }

    // Parse date and time in business timezone
    // CRITICAL: On Railway (UTC server), new Date(year,month,day,hour,min) creates UTC dates.
    // We need to create dates in the business's timezone so 1:00 PM ET is stored as 5:00 PM UTC.
    const [year, month, day] = validatedData.date.split('-').map(Number);
    const [hour, min] = validatedData.time.split(':').map(Number);
    const businessTimezone = business.timezone || 'America/New_York';

    const startDate = createDateInTimezone(year, month - 1, day, hour, min, businessTimezone);
    const endDate = new Date(startDate.getTime() + (service.duration || 60) * 60 * 1000);

    // Verify the slot is still available
    const now = new Date();
    const leadTimeMs = (business.bookingLeadTimeHours || 24) * 60 * 60 * 1000;
    const minBookingTime = new Date(now.getTime() + leadTimeMs);

    if (startDate < minBookingTime) {
      return res.status(400).json({
        error: `Bookings require at least ${business.bookingLeadTimeHours || 24} hours notice`
      });
    }

    // Find or create customer
    let customer = await storage.getCustomerByPhone(validatedData.customer.phone, business.id);

    if (!customer) {
      // Create new customer
      customer = await storage.createCustomer({
        businessId: business.id,
        firstName: validatedData.customer.firstName,
        lastName: validatedData.customer.lastName,
        email: validatedData.customer.email,
        phone: validatedData.customer.phone,
      });
    } else {
      // Update existing customer info
      customer = await storage.updateCustomer(customer.id, {
        firstName: validatedData.customer.firstName,
        lastName: validatedData.customer.lastName,
        email: validatedData.customer.email,
      });
    }

    // Prevent duplicate bookings — check if this customer already has an active appointment today
    const dayStart = createDateInTimezone(year, month - 1, day, 0, 0, businessTimezone);
    const dayEnd = createDateInTimezone(year, month - 1, day, 23, 59, businessTimezone);
    const existingAppointments = await storage.getAppointments(business.id, {
      startDate: dayStart,
      endDate: dayEnd,
    });
    const duplicateBooking = existingAppointments.find(apt =>
      apt.customerId === customer!.id &&
      apt.status !== 'cancelled'
    );
    if (duplicateBooking) {
      return res.status(409).json({
        error: "You already have an appointment booked for this day. Please cancel your existing appointment first or choose a different day."
      });
    }

    // Determine staff member
    let staffId = validatedData.staffId;

    // Validate staff-service compatibility if a specific staff was chosen
    if (staffId) {
      const staffServiceIds = await storage.getStaffServices(staffId);
      if (staffServiceIds.length > 0 && !staffServiceIds.includes(validatedData.serviceId)) {
        const staffMember = await storage.getStaffMember(staffId);
        return res.status(400).json({
          error: `${staffMember?.firstName || 'That team member'} doesn't perform ${service.name}. Please choose a different staff member.`
        });
      }
    }

    if (!staffId) {
      // Auto-assign to an available staff member (who can do this service)
      const availableStaff = await storage.getAvailableStaffForSlot(
        business.id,
        startDate,
        validatedData.time
      );
      // Filter by service compatibility
      const eligibleAvailableStaff: typeof availableStaff = [];
      for (const s of availableStaff) {
        const assignedServices = await storage.getStaffServices(s.id);
        if (assignedServices.length === 0 || assignedServices.includes(validatedData.serviceId)) {
          eligibleAvailableStaff.push(s);
        }
      }
      if (eligibleAvailableStaff.length > 0) {
        staffId = eligibleAvailableStaff[0].id;
      } else if (availableStaff.length > 0) {
        // Fallback: if no service-eligible staff found, use first available
        staffId = availableStaff[0].id;
      }
    }

    // Re-verify time slot is still available (prevent race condition double-booking)
    if (staffId) {
      const bufferMinutes = business.bookingBufferMinutes || 15;
      const slotEnd = new Date(startDate.getTime() + (service.duration || 60) * 60 * 1000);
      const dayAppointments = existingAppointments.filter(apt =>
        apt.staffId === staffId &&
        apt.status !== 'cancelled'
      );
      const hasConflict = dayAppointments.some(apt => {
        const aptStart = new Date(apt.startDate);
        const aptEnd = new Date(apt.endDate);
        const aptStartWithBuffer = aptStart.getTime() - bufferMinutes * 60 * 1000;
        const aptEndWithBuffer = aptEnd.getTime() + bufferMinutes * 60 * 1000;
        return (startDate.getTime() < aptEndWithBuffer && slotEnd.getTime() > aptStartWithBuffer);
      });
      if (hasConflict) {
        return res.status(409).json({
          error: "Sorry, that time slot was just booked. Please select a different time."
        });
      }
    }

    // Create the appointment (same pattern as VAPI/AI receptionist)
    const appointment = await storage.createAppointment({
      businessId: business.id,
      customerId: customer.id,
      staffId: staffId || null,
      serviceId: validatedData.serviceId,
      startDate,
      endDate,
      status: 'scheduled',
      notes: validatedData.notes
        ? `Online booking: ${validatedData.notes}`
        : 'Online booking',
    });

    // Set manage token after creation (non-blocking, so appointment creation never fails)
    const manageToken = crypto.randomBytes(24).toString('hex');
    try {
      await storage.updateAppointment(appointment.id, { manageToken });
    } catch (tokenErr) {
      console.error('Failed to set manage token (column may not exist yet):', tokenErr);
    }

    // Auto-create a linked Job (matches AI receptionist behavior)
    let createdJob: any = null;
    try {
      const customerDisplayName = `${validatedData.customer.firstName} ${validatedData.customer.lastName}`.trim();
      const jobTitle = customerDisplayName ? `${service.name} - ${customerDisplayName}` : service.name;

      createdJob = await storage.createJob({
        businessId: business.id,
        customerId: customer.id,
        appointmentId: appointment.id,
        staffId: staffId || null,
        title: jobTitle,
        description: `Service: ${service.name}${validatedData.notes ? `\nNotes: ${validatedData.notes}` : ''}`,
        scheduledDate: validatedData.date,
        status: 'pending',
        notes: 'Auto-created from online booking',
      });

      fireEvent(business.id, 'job.created', { job: createdJob }).catch(err =>
        console.error('Webhook fire error (job.created):', err));
    } catch (jobError: any) {
      console.error('Failed to auto-create job for online booking:', { appointmentId: appointment.id, error: jobError.message });
    }

    // Fire appointment webhook event
    fireEvent(business.id, 'appointment.created', { appointment }).catch(err =>
      console.error('Webhook fire error (appointment.created):', err));

    // Send email/SMS confirmation (fire-and-forget)
    notificationService.sendAppointmentConfirmation(appointment.id, business.id).catch(err =>
      console.error('Failed to send booking confirmation:', err));

    // Google Calendar sync (fire-and-forget)
    try {
      const { CalendarService } = await import("../services/calendarService");
      const calendarService = new CalendarService();
      calendarService.syncAppointment(appointment.id).catch(err =>
        console.error('Background calendar sync error (booking):', err));
    } catch (calErr) {
      // Calendar service may not be available
    }

    // Build manage URL
    const manageUrl = `/book/${slug}/manage/${manageToken}`;

    res.status(201).json({
      success: true,
      appointment: {
        id: appointment.id,
        startDate: appointment.startDate,
        endDate: appointment.endDate,
        serviceName: service.name,
      },
      manageUrl,
      manageToken,
      jobId: createdJob?.id || null,
      timezoneAbbr: getTimezoneAbbreviation(businessTimezone, startDate),
      message: `Your appointment has been booked for ${startDate.toLocaleDateString('en-US', { timeZone: businessTimezone, weekday: 'long', month: 'long', day: 'numeric' })} at ${formatTimeWithTimezone(startDate, businessTimezone)}. You will receive a confirmation shortly.`,
    });
  } catch (error: any) {
    console.error("Error creating booking:", error);

    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid booking data", details: error.errors });
    }

    res.status(500).json({ error: "Failed to create booking" });
  }
});

// ========================================
// MANAGE APPOINTMENT (Customer self-service)
// ========================================

// GET appointment details by manage token (public)
router.get("/book/:slug/manage/:token", async (req, res) => {
  try {
    const { slug, token } = req.params;

    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const appointment = await storage.getAppointmentByManageToken(token);
    if (!appointment || appointment.businessId !== business.id) {
      return res.status(404).json({ error: "Appointment not found. This link may have expired or is invalid." });
    }

    // Get related data
    const customer = await storage.getCustomer(appointment.customerId);
    let serviceName = 'Appointment';
    let serviceDuration = 60;
    let servicePrice: number | string | null = null;
    if (appointment.serviceId) {
      const service = await storage.getService(appointment.serviceId);
      if (service) {
        serviceName = service.name;
        serviceDuration = service.duration || 60;
        servicePrice = service.price;
      }
    }

    let staffName: string | null = null;
    if (appointment.staffId) {
      const staff = await storage.getStaffMember(appointment.staffId);
      if (staff) staffName = `${staff.firstName} ${staff.lastName}`.trim();
    }

    res.json({
      appointment: {
        id: appointment.id,
        startDate: appointment.startDate,
        endDate: appointment.endDate,
        status: appointment.status,
        notes: appointment.notes,
      },
      service: { name: serviceName, duration: serviceDuration, price: servicePrice },
      staff: staffName,
      customer: customer ? { firstName: customer.firstName, lastName: customer.lastName, email: customer.email, phone: customer.phone } : null,
      business: {
        name: business.name,
        phone: business.phone,
        email: business.email,
        address: business.address,
        city: business.city,
        state: business.state,
        timezone: business.timezone || 'America/New_York',
        logoUrl: business.logoUrl,
        bookingSlug: business.bookingSlug,
      },
    });
  } catch (error) {
    console.error("Error fetching managed appointment:", error);
    res.status(500).json({ error: "Failed to load appointment" });
  }
});

// POST cancel appointment (public, requires manage token)
router.post("/book/:slug/manage/:token/cancel", async (req, res) => {
  try {
    const { slug, token } = req.params;

    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const appointment = await storage.getAppointmentByManageToken(token);
    if (!appointment || appointment.businessId !== business.id) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: "This appointment has already been cancelled." });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({ error: "This appointment has already been completed and cannot be cancelled." });
    }

    // Cancel the appointment
    const updated = await storage.updateAppointment(appointment.id, {
      status: 'cancelled',
      notes: (appointment.notes || '') + '\n[Cancelled by customer via self-service]',
    });

    // Also cancel linked job if exists
    try {
      const jobs = await storage.getJobs(business.id, { customerId: appointment.customerId });
      const linkedJob = jobs.find((j: any) => j.appointmentId === appointment.id && j.status !== 'cancelled');
      if (linkedJob) {
        await storage.updateJob(linkedJob.id, { status: 'cancelled' });
      }
    } catch (e) { /* non-blocking */ }

    // Fire webhook
    fireEvent(business.id, 'appointment.cancelled', { appointment: updated }).catch(() => {});

    res.json({ success: true, message: "Your appointment has been cancelled." });
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    res.status(500).json({ error: "Failed to cancel appointment" });
  }
});

// POST reschedule appointment (public, requires manage token)
router.post("/book/:slug/manage/:token/reschedule", async (req, res) => {
  try {
    const { slug, token } = req.params;
    const { date, time } = req.body;

    if (!date || !time) {
      return res.status(400).json({ error: "New date and time are required" });
    }

    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const appointment = await storage.getAppointmentByManageToken(token);
    if (!appointment || appointment.businessId !== business.id) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: "This appointment has been cancelled and cannot be rescheduled." });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({ error: "This appointment has been completed and cannot be rescheduled." });
    }

    // Calculate new dates in business timezone
    const businessTimezone = business.timezone || 'America/New_York';
    const [year, month, day] = date.split('-').map(Number);
    const [hour, min] = time.split(':').map(Number);

    // Get service duration
    let serviceDuration = 60;
    if (appointment.serviceId) {
      const service = await storage.getService(appointment.serviceId);
      if (service?.duration) serviceDuration = service.duration;
    }

    const newStartDate = createDateInTimezone(year, month - 1, day, hour, min, businessTimezone);
    const newEndDate = new Date(newStartDate.getTime() + serviceDuration * 60 * 1000);

    // Verify the new slot is in the future
    const now = new Date();
    const leadTimeMs = (business.bookingLeadTimeHours || 24) * 60 * 60 * 1000;
    if (newStartDate.getTime() < now.getTime() + leadTimeMs) {
      return res.status(400).json({
        error: `Bookings require at least ${business.bookingLeadTimeHours || 24} hours notice`
      });
    }

    // Update the appointment
    const updated = await storage.updateAppointment(appointment.id, {
      startDate: newStartDate,
      endDate: newEndDate,
      notes: (appointment.notes || '') + `\n[Rescheduled by customer from ${new Date(appointment.startDate).toLocaleDateString()} to ${newStartDate.toLocaleDateString()}]`,
    });

    // Update linked job if exists
    try {
      const jobs = await storage.getJobs(business.id, { customerId: appointment.customerId });
      const linkedJob = jobs.find((j: any) => j.appointmentId === appointment.id && j.status !== 'cancelled');
      if (linkedJob) {
        await storage.updateJob(linkedJob.id, { scheduledDate: date });
      }
    } catch (e) { /* non-blocking */ }

    // Fire webhook
    fireEvent(business.id, 'appointment.updated', { appointment: updated }).catch(() => {});

    // Send updated confirmation
    notificationService.sendAppointmentConfirmation(appointment.id, business.id).catch(() => {});

    res.json({
      success: true,
      appointment: {
        id: updated.id,
        startDate: updated.startDate,
        endDate: updated.endDate,
        status: updated.status,
      },
      message: "Your appointment has been rescheduled.",
    });
  } catch (error) {
    console.error("Error rescheduling appointment:", error);
    res.status(500).json({ error: "Failed to reschedule appointment" });
  }
});

// ========================================
// RESTAURANT RESERVATIONS (Public Routes)
// ========================================

// GET available reservation slots for a date and party size
router.get("/book/:slug/reservation-slots", async (req, res) => {
  try {
    const { slug } = req.params;
    const { date, partySize } = req.query;

    if (!date) {
      return res.status(400).json({ error: "Date is required (YYYY-MM-DD)" });
    }

    const partySizeNum = parseInt(partySize as string) || 2;

    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business || !business.bookingEnabled) {
      return res.status(404).json({ error: "Business not found or booking not available" });
    }

    if (!business.reservationEnabled) {
      return res.status(400).json({ error: "Reservations are not enabled for this business" });
    }

    const maxPartySize = business.reservationMaxPartySize || 10;
    if (partySizeNum > maxPartySize) {
      return res.status(400).json({ error: `Maximum party size is ${maxPartySize}. For larger parties, please call us.` });
    }

    const businessTimezone = business.timezone || 'America/New_York';
    const slotDuration = business.reservationSlotDurationMinutes || 90;
    const slotInterval = business.bookingSlotIntervalMinutes || 30;
    const leadTimeHours = business.reservationLeadTimeHours || 2;
    const maxDaysAhead = business.reservationMaxDaysAhead || 30;

    // Parse the requested date
    const requestedDate = new Date(date as string + 'T00:00:00');
    const now = new Date();

    // Check if date is too far ahead
    const maxFutureDate = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);
    if (requestedDate > maxFutureDate) {
      return res.status(400).json({ error: `Reservations can only be made up to ${maxDaysAhead} days in advance.` });
    }

    // Get business hours for the day of the week
    const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: businessTimezone }).toLowerCase();
    const allHours = await storage.getBusinessHours(business.id);
    const dayHours = allHours.find(h => h.day.toLowerCase() === dayOfWeek);

    if (!dayHours || dayHours.isClosed) {
      return res.json({ slots: [], message: "The restaurant is closed on this day." });
    }

    // Parse open/close hours
    const [openHour, openMin] = (dayHours.open || '09:00').split(':').map(Number);
    const [closeHour, closeMin] = (dayHours.close || '21:00').split(':').map(Number);

    // Minimum booking time (lead time from now)
    const leadTimeMs = leadTimeHours * 60 * 60 * 1000;
    const minBookingTime = new Date(now.getTime() + leadTimeMs);

    // Generate time slots
    const slots: { time: string; available: boolean; remainingSeats: number }[] = [];

    let currentHour = openHour;
    let currentMin = openMin;

    while (true) {
      // Check if the slot end would go past closing time
      const slotEndMinutes = currentHour * 60 + currentMin + slotDuration;
      const closeMinutes = closeHour * 60 + closeMin;

      if (slotEndMinutes > closeMinutes) break;

      const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

      // Check if this slot is past the lead time minimum
      const [year, month, day] = (date as string).split('-').map(Number);
      const slotDateTime = createDateInTimezone(year, month - 1, day, currentHour, currentMin, businessTimezone);

      let available = false;
      let remainingSeats = 0;

      if (slotDateTime > minBookingTime) {
        // Check capacity
        const capacity = await storage.getReservationSlotCapacity(business.id, date as string, timeStr, slotDuration);
        remainingSeats = capacity.remainingSeats;
        available = remainingSeats >= partySizeNum;
      }

      slots.push({ time: timeStr, available, remainingSeats });

      // Advance by slot interval
      currentMin += slotInterval;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
    }

    res.json({
      slots,
      date: date as string,
      partySize: partySizeNum,
      slotDuration,
      timezone: businessTimezone,
      timezoneAbbr: getTimezoneAbbreviation(businessTimezone),
    });
  } catch (error) {
    console.error("Error fetching reservation slots:", error);
    res.status(500).json({ error: "Failed to fetch reservation slots" });
  }
});

// POST create a reservation
router.post("/book/:slug/reserve", async (req, res) => {
  try {
    const { slug } = req.params;

    const reserveSchema = z.object({
      partySize: z.number().min(1),
      date: z.string(), // YYYY-MM-DD
      time: z.string(), // HH:MM
      customer: z.object({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        email: z.string().email("Valid email is required"),
        phone: z.string().min(1, "Phone number is required"),
      }),
      specialRequests: z.string().optional(),
    });

    const validatedData = reserveSchema.parse(req.body);

    // Find the business
    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business || !business.bookingEnabled) {
      return res.status(404).json({ error: "Business not found or booking not available" });
    }

    if (!business.reservationEnabled) {
      return res.status(400).json({ error: "Reservations are not enabled for this business" });
    }

    const maxPartySize = business.reservationMaxPartySize || 10;
    if (validatedData.partySize > maxPartySize) {
      return res.status(400).json({ error: `Maximum party size is ${maxPartySize}. For larger parties, please call us.` });
    }

    const businessTimezone = business.timezone || 'America/New_York';
    const slotDuration = business.reservationSlotDurationMinutes || 90;
    const leadTimeHours = business.reservationLeadTimeHours || 2;

    // Parse date/time in business timezone
    const [year, month, day] = validatedData.date.split('-').map(Number);
    const [hour, min] = validatedData.time.split(':').map(Number);

    const startDate = createDateInTimezone(year, month - 1, day, hour, min, businessTimezone);
    const endDate = new Date(startDate.getTime() + slotDuration * 60 * 1000);

    // Verify lead time
    const now = new Date();
    const leadTimeMs = leadTimeHours * 60 * 60 * 1000;
    if (startDate.getTime() < now.getTime() + leadTimeMs) {
      return res.status(400).json({
        error: `Reservations require at least ${leadTimeHours} hours notice.`
      });
    }

    // Verify capacity is still available (race condition prevention)
    const capacity = await storage.getReservationSlotCapacity(business.id, validatedData.date, validatedData.time, slotDuration);
    if (capacity.remainingSeats < validatedData.partySize) {
      return res.status(409).json({
        error: "Sorry, there isn't enough capacity for your party size at this time. Please choose a different time."
      });
    }

    // Find or create customer
    let customer = await storage.getCustomerByPhone(validatedData.customer.phone, business.id);
    if (!customer) {
      customer = await storage.createCustomer({
        businessId: business.id,
        firstName: validatedData.customer.firstName,
        lastName: validatedData.customer.lastName,
        email: validatedData.customer.email,
        phone: validatedData.customer.phone,
      });
    } else {
      customer = await storage.updateCustomer(customer.id, {
        firstName: validatedData.customer.firstName,
        lastName: validatedData.customer.lastName,
        email: validatedData.customer.email,
      });
    }

    // Check for duplicate reservation (same customer, same date)
    const existingReservations = await storage.getRestaurantReservations(business.id, {
      date: validatedData.date,
      customerId: customer.id,
    });
    const activeDuplicate = existingReservations.find(r => r.status !== 'cancelled' && r.status !== 'no_show');
    if (activeDuplicate) {
      return res.status(409).json({
        error: "You already have a reservation for this day. Please cancel your existing reservation first or choose a different day."
      });
    }

    // Create the reservation
    const manageToken = crypto.randomBytes(24).toString('hex');
    const reservation = await storage.createRestaurantReservation({
      businessId: business.id,
      customerId: customer.id,
      partySize: validatedData.partySize,
      reservationDate: validatedData.date,
      reservationTime: validatedData.time,
      startDate,
      endDate,
      status: 'confirmed',
      specialRequests: validatedData.specialRequests || null,
      manageToken,
      source: 'online',
    });

    // Fire webhook event
    fireEvent(business.id, 'reservation.created', { reservation }).catch(err =>
      console.error('Webhook fire error (reservation.created):', err));

    // Send confirmation notification (fire-and-forget)
    notificationService.sendReservationConfirmation(reservation.id, business.id).catch(err =>
      console.error('Failed to send reservation confirmation:', err));

    // Build manage URL
    const manageUrl = `/book/${slug}/manage-reservation/${manageToken}`;

    res.status(201).json({
      success: true,
      reservation: {
        id: reservation.id,
        partySize: reservation.partySize,
        date: reservation.reservationDate,
        time: reservation.reservationTime,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        specialRequests: reservation.specialRequests,
        status: reservation.status,
      },
      manageUrl,
      manageToken,
      timezoneAbbr: getTimezoneAbbreviation(businessTimezone, startDate),
      message: `Your reservation for ${validatedData.partySize} ${validatedData.partySize === 1 ? 'guest' : 'guests'} is confirmed for ${startDate.toLocaleDateString('en-US', { timeZone: businessTimezone, weekday: 'long', month: 'long', day: 'numeric' })} at ${formatTimeWithTimezone(startDate, businessTimezone)}. You will receive a confirmation shortly.`,
    });
  } catch (error: any) {
    console.error("Error creating reservation:", error);

    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid reservation data", details: error.errors });
    }

    res.status(500).json({ error: "Failed to create reservation" });
  }
});

// ========================================
// MANAGE RESERVATION (Customer self-service)
// ========================================

// GET reservation details by manage token (public)
router.get("/book/:slug/manage-reservation/:token", async (req, res) => {
  try {
    const { slug, token } = req.params;

    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const reservation = await storage.getRestaurantReservationByManageToken(token);
    if (!reservation || reservation.businessId !== business.id) {
      return res.status(404).json({ error: "Reservation not found. This link may have expired or is invalid." });
    }

    const customer = await storage.getCustomer(reservation.customerId);
    const businessTimezone = business.timezone || 'America/New_York';

    res.json({
      reservation: {
        id: reservation.id,
        partySize: reservation.partySize,
        date: reservation.reservationDate,
        time: reservation.reservationTime,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        status: reservation.status,
        specialRequests: reservation.specialRequests,
        source: reservation.source,
      },
      customer: customer ? {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
      } : null,
      business: {
        name: business.name,
        phone: business.phone,
        email: business.email,
        address: business.address,
        city: business.city,
        state: business.state,
        timezone: businessTimezone,
        timezoneAbbr: getTimezoneAbbreviation(businessTimezone),
        logoUrl: business.logoUrl,
        bookingSlug: business.bookingSlug,
      },
    });
  } catch (error) {
    console.error("Error fetching managed reservation:", error);
    res.status(500).json({ error: "Failed to load reservation" });
  }
});

// POST cancel reservation (public, requires manage token)
router.post("/book/:slug/manage-reservation/:token/cancel", async (req, res) => {
  try {
    const { slug, token } = req.params;

    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const reservation = await storage.getRestaurantReservationByManageToken(token);
    if (!reservation || reservation.businessId !== business.id) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (reservation.status === 'cancelled') {
      return res.status(400).json({ error: "This reservation has already been cancelled." });
    }

    if (reservation.status === 'completed' || reservation.status === 'seated') {
      return res.status(400).json({ error: "This reservation cannot be cancelled." });
    }

    const updated = await storage.updateRestaurantReservation(reservation.id, {
      status: 'cancelled',
    });

    fireEvent(business.id, 'reservation.cancelled', { reservation: updated }).catch(() => {});

    res.json({ success: true, message: "Your reservation has been cancelled." });
  } catch (error) {
    console.error("Error cancelling reservation:", error);
    res.status(500).json({ error: "Failed to cancel reservation" });
  }
});

// POST modify reservation (public, requires manage token)
router.post("/book/:slug/manage-reservation/:token/modify", async (req, res) => {
  try {
    const { slug, token } = req.params;

    const modifySchema = z.object({
      partySize: z.number().min(1).optional(),
      date: z.string().optional(), // YYYY-MM-DD
      time: z.string().optional(), // HH:MM
      specialRequests: z.string().optional(),
    });

    const validatedData = modifySchema.parse(req.body);

    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const reservation = await storage.getRestaurantReservationByManageToken(token);
    if (!reservation || reservation.businessId !== business.id) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (reservation.status === 'cancelled') {
      return res.status(400).json({ error: "This reservation has been cancelled and cannot be modified." });
    }

    if (reservation.status === 'completed' || reservation.status === 'seated') {
      return res.status(400).json({ error: "This reservation cannot be modified." });
    }

    const businessTimezone = business.timezone || 'America/New_York';
    const slotDuration = business.reservationSlotDurationMinutes || 90;
    const maxPartySize = business.reservationMaxPartySize || 10;

    const newPartySize = validatedData.partySize || reservation.partySize;
    const newDate = validatedData.date || reservation.reservationDate;
    const newTime = validatedData.time || reservation.reservationTime;

    if (newPartySize > maxPartySize) {
      return res.status(400).json({ error: `Maximum party size is ${maxPartySize}.` });
    }

    // If date or time changed, recalculate start/end and verify capacity
    const dateOrTimeChanged = validatedData.date || validatedData.time;
    const partySizeChanged = validatedData.partySize && validatedData.partySize !== reservation.partySize;

    let newStartDate = new Date(reservation.startDate);
    let newEndDate = new Date(reservation.endDate);

    if (dateOrTimeChanged) {
      const [year, month, day] = newDate.split('-').map(Number);
      const [hour, min] = newTime.split(':').map(Number);
      newStartDate = createDateInTimezone(year, month - 1, day, hour, min, businessTimezone);
      newEndDate = new Date(newStartDate.getTime() + slotDuration * 60 * 1000);

      // Verify lead time
      const now = new Date();
      const leadTimeMs = (business.reservationLeadTimeHours || 2) * 60 * 60 * 1000;
      if (newStartDate.getTime() < now.getTime() + leadTimeMs) {
        return res.status(400).json({
          error: `Reservations require at least ${business.reservationLeadTimeHours || 2} hours notice.`
        });
      }
    }

    // Verify capacity (exclude current reservation from the count)
    if (dateOrTimeChanged || partySizeChanged) {
      const capacity = await storage.getReservationSlotCapacity(business.id, newDate, newTime, slotDuration);
      // Add back the current reservation's party size since it will be modified
      const adjustedRemaining = capacity.remainingSeats + reservation.partySize;
      if (adjustedRemaining < newPartySize) {
        return res.status(409).json({
          error: "Sorry, there isn't enough capacity for your updated party size at this time."
        });
      }
    }

    const updateData: any = {};
    if (validatedData.partySize) updateData.partySize = validatedData.partySize;
    if (validatedData.date) updateData.reservationDate = validatedData.date;
    if (validatedData.time) updateData.reservationTime = validatedData.time;
    if (validatedData.specialRequests !== undefined) updateData.specialRequests = validatedData.specialRequests;
    if (dateOrTimeChanged) {
      updateData.startDate = newStartDate;
      updateData.endDate = newEndDate;
    }

    const updated = await storage.updateRestaurantReservation(reservation.id, updateData);

    fireEvent(business.id, 'reservation.updated', { reservation: updated }).catch(() => {});

    // Send updated confirmation
    notificationService.sendReservationConfirmation(updated.id, business.id).catch(() => {});

    res.json({
      success: true,
      reservation: {
        id: updated.id,
        partySize: updated.partySize,
        date: updated.reservationDate,
        time: updated.reservationTime,
        startDate: updated.startDate,
        endDate: updated.endDate,
        status: updated.status,
        specialRequests: updated.specialRequests,
      },
      timezoneAbbr: getTimezoneAbbreviation(businessTimezone),
      message: "Your reservation has been updated.",
    });
  } catch (error: any) {
    console.error("Error modifying reservation:", error);

    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid modification data", details: error.errors });
    }

    res.status(500).json({ error: "Failed to modify reservation" });
  }
});

// Check if a booking slug is available (authenticated route for business settings)
router.get("/booking-slug/check", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { slug } = req.query;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: "Slug is required" });
    }

    const user = req.user;
    const businessId = user.businessId;

    // Check if slug is taken by another business
    const existingBusiness = await storage.getBusinessByBookingSlug(slug);

    const isAvailable = !existingBusiness || existingBusiness.id === businessId;

    res.json({
      available: isAvailable,
      slug: slug.toLowerCase(),
    });
  } catch (error) {
    console.error("Error checking booking slug:", error);
    res.status(500).json({ error: "Failed to check booking slug" });
  }
});

// Update booking settings (authenticated route)
router.patch("/booking-settings", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user;
    const businessId = user.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "No business associated with user" });
    }

    const updateSchema = z.object({
      bookingSlug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens").optional(),
      bookingEnabled: z.boolean().optional(),
      bookingLeadTimeHours: z.number().min(0).max(168).optional(), // 0-7 days
      bookingBufferMinutes: z.number().min(0).max(60).optional(),
      bookingSlotIntervalMinutes: z.number().min(5).max(120).optional(), // 5 min to 2 hours
      // Restaurant reservation settings
      reservationEnabled: z.boolean().optional(),
      reservationMaxPartySize: z.number().min(1).max(50).optional(),
      reservationSlotDurationMinutes: z.number().min(15).max(240).optional(),
      reservationMaxCapacityPerSlot: z.number().min(1).max(500).optional(),
      reservationLeadTimeHours: z.number().min(0).max(168).optional(),
      reservationMaxDaysAhead: z.number().min(1).max(365).optional(),
    });

    const validatedData = updateSchema.parse(req.body);

    // If updating slug, check if it's available
    if (validatedData.bookingSlug) {
      const existingBusiness = await storage.getBusinessByBookingSlug(validatedData.bookingSlug);
      if (existingBusiness && existingBusiness.id !== businessId) {
        return res.status(400).json({ error: "This booking URL is already taken" });
      }
      validatedData.bookingSlug = validatedData.bookingSlug.toLowerCase();
    }

    const updatedBusiness = await storage.updateBusiness(businessId, validatedData);

    res.json({
      success: true,
      bookingSlug: updatedBusiness.bookingSlug,
      bookingEnabled: updatedBusiness.bookingEnabled,
      bookingLeadTimeHours: updatedBusiness.bookingLeadTimeHours,
      bookingBufferMinutes: updatedBusiness.bookingBufferMinutes,
      bookingSlotIntervalMinutes: updatedBusiness.bookingSlotIntervalMinutes,
      reservationEnabled: updatedBusiness.reservationEnabled,
      reservationMaxPartySize: updatedBusiness.reservationMaxPartySize,
      reservationSlotDurationMinutes: updatedBusiness.reservationSlotDurationMinutes,
      reservationMaxCapacityPerSlot: updatedBusiness.reservationMaxCapacityPerSlot,
      reservationLeadTimeHours: updatedBusiness.reservationLeadTimeHours,
      reservationMaxDaysAhead: updatedBusiness.reservationMaxDaysAhead,
    });
  } catch (error: any) {
    console.error("Error updating booking settings:", error);

    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid booking settings", details: error.errors });
    }

    res.status(500).json({ error: "Failed to update booking settings" });
  }
});

export default router;
