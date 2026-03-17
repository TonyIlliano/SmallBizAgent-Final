import { storage } from "../storage";
import twilioService from "./twilioService";
import { db } from "../db";
import { notificationLog } from "../../shared/schema";
import { and, eq, gte } from "drizzle-orm";

interface ReminderResult {
  appointmentId: number;
  customerPhone: string;
  status: 'sent' | 'failed' | 'skipped';
  message?: string;
  error?: string;
}

/**
 * Send SMS appointment reminder to a customer
 */
export async function sendAppointmentReminder(
  appointmentId: number,
  businessId: number
): Promise<ReminderResult> {
  try {
    // Deduplication: check if a reminder was already sent for this appointment in the last 20 hours
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
    const existing = await db.select({ id: notificationLog.id }).from(notificationLog)
      .where(and(
        eq(notificationLog.businessId, businessId),
        eq(notificationLog.referenceType, 'appointment'),
        eq(notificationLog.referenceId, appointmentId),
        eq(notificationLog.type, 'appointment_reminder'),
        eq(notificationLog.status, 'sent'),
        gte(notificationLog.sentAt, twentyHoursAgo)
      ))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Reminder] Skipping appointment ${appointmentId} — reminder already sent recently`);
      return {
        appointmentId,
        customerPhone: '',
        status: 'skipped',
        message: 'Reminder already sent for this appointment'
      };
    }

    // Get appointment details
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      return {
        appointmentId,
        customerPhone: '',
        status: 'failed',
        error: 'Appointment not found'
      };
    }

    // Skip if appointment is cancelled or already completed
    if (appointment.status === 'cancelled' || appointment.status === 'completed') {
      return {
        appointmentId,
        customerPhone: '',
        status: 'skipped',
        message: `Appointment status is ${appointment.status}`
      };
    }

    // Get customer
    const customer = await storage.getCustomer(appointment.customerId);
    if (!customer || !customer.phone) {
      return {
        appointmentId,
        customerPhone: '',
        status: 'skipped',
        message: 'Customer has no phone number'
      };
    }

    // Get business info for the message
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return {
        appointmentId,
        customerPhone: customer.phone,
        status: 'failed',
        error: 'Business not found'
      };
    }

    // Get service name if available
    let serviceName = 'your appointment';
    if (appointment.serviceId) {
      const service = await storage.getService(appointment.serviceId);
      if (service) {
        serviceName = service.name;
      }
    }

    // Format the appointment date/time
    const appointmentDate = new Date(appointment.startDate);
    const dateStr = appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = appointmentDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Use the Twilio AI number so customers call the receptionist, fall back to business phone
    const contactNumber = business.twilioPhoneNumber || business.phone;

    // Compose the reminder message
    const message = `Hi ${customer.firstName}! Reminder from ${business.name}: your ${serviceName} appointment is on ${dateStr} at ${timeStr}. Reply CONFIRM, RESCHEDULE, or CANCEL.`;

    // Send the SMS
    try {
      const result = await twilioService.sendSms(customer.phone, message, undefined, businessId);
      console.log(`Reminder sent to ${customer.phone} for appointment ${appointmentId}`);

      // Log to notification_log for deduplication on restart
      try {
        await storage.createNotificationLog({
          businessId,
          customerId: appointment.customerId,
          type: 'appointment_reminder',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'appointment',
          referenceId: appointmentId,
        });
      } catch (logErr) {
        console.error(`[Reminder] Failed to log notification for appointment ${appointmentId}:`, logErr);
      }

      return {
        appointmentId,
        customerPhone: customer.phone,
        status: 'sent',
        message: `Reminder sent successfully (SID: ${result.sid})`
      };
    } catch (smsError) {
      return {
        appointmentId,
        customerPhone: customer.phone,
        status: 'failed',
        error: smsError instanceof Error ? smsError.message : 'Unknown error sending SMS'
      };
    }
  } catch (error) {
    console.error(`Error sending reminder for appointment ${appointmentId}:`, error);
    return {
      appointmentId,
      customerPhone: '',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Find and send reminders for appointments happening in the next X hours
 */
export async function sendUpcomingAppointmentReminders(
  businessId: number,
  hoursAhead: number = 24
): Promise<ReminderResult[]> {
  const results: ReminderResult[] = [];

  try {
    // Calculate the time window
    const now = new Date();
    const reminderWindowStart = new Date(now.getTime() + (hoursAhead - 1) * 60 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    // Get appointments in the window
    const appointments = await storage.getAppointments(businessId, {
      startDate: reminderWindowStart,
      endDate: reminderWindowEnd
    });

    console.log(`Found ${appointments.length} appointments for reminders (${hoursAhead}h ahead)`);

    // Send reminders for each appointment
    for (const appointment of appointments) {
      // Only send for scheduled/confirmed appointments
      if (appointment.status === 'scheduled' || appointment.status === 'confirmed') {
        const result = await sendAppointmentReminder(appointment.id, businessId);
        results.push(result);
      }
    }

    return results;
  } catch (error) {
    console.error('Error sending upcoming appointment reminders:', error);
    return results;
  }
}

/**
 * Send invoice payment reminder
 */
export async function sendInvoiceReminder(
  invoiceId: number,
  businessId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // Skip if already paid
    if (invoice.status === 'paid') {
      return { success: false, error: 'Invoice already paid' };
    }

    const customer = await storage.getCustomer(invoice.customerId);
    if (!customer || !customer.phone) {
      return { success: false, error: 'Customer has no phone number' };
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    // Format amount
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(invoice.total || 0);

    // Use the Twilio AI number so customers call the receptionist, fall back to business phone
    const contactNumber = business.twilioPhoneNumber || business.phone;

    // Compose message
    const message = `Hi ${customer.firstName}! This is a reminder from ${business.name} — invoice #${invoice.invoiceNumber} for ${amount} is due. Pay online or call us at ${contactNumber} if you have any questions. Thank you!`;

    try {
      const result = await twilioService.sendSms(customer.phone, message, undefined, businessId);
      console.log(`Invoice reminder sent to ${customer.phone} for invoice ${invoiceId}`);
      return { success: true };
    } catch (smsError) {
      return { success: false, error: smsError instanceof Error ? smsError.message : 'Unknown error' };
    }
  } catch (error) {
    console.error(`Error sending invoice reminder for ${invoiceId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Send job completion follow-up / review request
 */
export async function sendJobFollowUp(
  jobId: number,
  businessId: number,
  reviewLink?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const job = await storage.getJob(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    // Only send for completed jobs
    if (job.status !== 'completed') {
      return { success: false, error: 'Job not completed' };
    }

    const customer = await storage.getCustomer(job.customerId);
    if (!customer || !customer.phone) {
      return { success: false, error: 'Customer has no phone number' };
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    // Compose message
    let message = `Hi ${customer.firstName}! Thank you for choosing ${business.name}. We hope you're satisfied with our work on "${job.title}".`;

    if (reviewLink) {
      message += ` We'd appreciate a review: ${reviewLink}`;
    } else {
      const contactNumber = business.twilioPhoneNumber || business.phone;
      message += ` If you have any questions, give us a call at ${contactNumber}.`;
    }

    try {
      const result = await twilioService.sendSms(customer.phone, message, undefined, businessId);
      console.log(`Follow-up sent to ${customer.phone} for job ${jobId}`);
      return { success: true };
    } catch (smsError) {
      return { success: false, error: smsError instanceof Error ? smsError.message : 'Unknown error' };
    }
  } catch (error) {
    console.error(`Error sending job follow-up for ${jobId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export default {
  sendAppointmentReminder,
  sendUpcomingAppointmentReminders,
  sendInvoiceReminder,
  sendJobFollowUp
};
