import { storage } from "../storage";
import twilioService from "./twilioService";

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

    // Compose the reminder message
    const message = `Hi ${customer.firstName}! This is a reminder from ${business.name} about ${serviceName} scheduled for ${dateStr} at ${timeStr}. Reply CONFIRM to confirm or call us at ${business.phone} to reschedule.`;

    // Send the SMS
    try {
      const result = await twilioService.sendSms(customer.phone, message);
      console.log(`Reminder sent to ${customer.phone} for appointment ${appointmentId}`);
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

    // Compose message
    const message = `Hi ${customer.firstName}! This is a reminder from ${business.name} that invoice #${invoice.invoiceNumber} for ${amount} is due. Pay online or call us at ${business.phone}. Thank you!`;

    try {
      const result = await twilioService.sendSms(customer.phone, message);
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
      message += ` If you have any questions, call us at ${business.phone}.`;
    }

    try {
      const result = await twilioService.sendSms(customer.phone, message);
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
