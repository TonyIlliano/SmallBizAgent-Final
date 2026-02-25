/**
 * Unified Notification Service
 *
 * Sends email and SMS notifications based on business notification preferences.
 * Logs all sent notifications for audit trail.
 */

import { storage } from "../storage";
import twilioService from "./twilioService";
import {
  sendAppointmentConfirmationEmail,
  sendAppointmentReminderEmail,
  sendInvoiceEmail,
  sendInvoiceReminderEmail,
  sendPaymentConfirmationEmail,
  sendJobCompletedEmail,
  sendQuoteEmail,
  sendQuoteFollowUpEmail,
} from "../emailService";

// Helper to format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// Helper to format date
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Helper to format time
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Send appointment confirmation notifications (email + SMS based on settings)
 */
export async function sendAppointmentConfirmation(appointmentId: number, businessId: number) {
  try {
    const settings = await storage.getNotificationSettings(businessId);
    // Default to sending if no settings configured yet
    const sendEmail = settings?.appointmentConfirmationEmail !== false;
    const sendSms = settings?.appointmentConfirmationSms !== false;

    if (!sendEmail && !sendSms) return;

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) return;

    const customer = await storage.getCustomer(appointment.customerId);
    if (!customer) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    let serviceName = 'your appointment';
    if (appointment.serviceId) {
      const service = await storage.getService(appointment.serviceId);
      if (service) serviceName = service.name;
    }

    const appointmentDate = new Date(appointment.startDate);
    const dateStr = formatDate(appointmentDate);
    const timeStr = formatTime(appointmentDate);

    // Build manage URL if appointment has a manage token
    const manageUrl = appointment.manageToken && business.bookingSlug
      ? `https://www.smallbizagent.ai/book/${business.bookingSlug}/manage/${appointment.manageToken}`
      : null;

    // Send email
    if (sendEmail && customer.email) {
      try {
        await sendAppointmentConfirmationEmail(
          customer.email,
          customer.firstName,
          business.name,
          serviceName,
          dateStr,
          timeStr,
          business.phone || '',
          manageUrl
        );
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'appointment_confirmation',
          channel: 'email',
          recipient: customer.email,
          subject: `Appointment Confirmed - ${business.name}`,
          status: 'sent',
          referenceType: 'appointment',
          referenceId: appointmentId,
        });
      } catch (err) {
        console.error('Failed to send appointment confirmation email:', err);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'appointment_confirmation',
          channel: 'email',
          recipient: customer.email,
          status: 'failed',
          referenceType: 'appointment',
          referenceId: appointmentId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Send SMS
    if (sendSms && customer.phone) {
      try {
        const message = manageUrl
          ? `Hi ${customer.firstName}! Your appointment for ${serviceName} is confirmed for ${dateStr} at ${timeStr}. Manage or reschedule: ${manageUrl} - ${business.name}`
          : `Hi ${customer.firstName}! Your appointment for ${serviceName} is confirmed for ${dateStr} at ${timeStr}. Call ${business.phone} to reschedule. - ${business.name}`;
        await twilioService.sendSms(customer.phone, message);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'appointment_confirmation',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'appointment',
          referenceId: appointmentId,
        });
      } catch (err) {
        console.error('Failed to send appointment confirmation SMS:', err);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'appointment_confirmation',
          channel: 'sms',
          recipient: customer.phone,
          status: 'failed',
          referenceType: 'appointment',
          referenceId: appointmentId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  } catch (error) {
    console.error(`Error in sendAppointmentConfirmation for appointment ${appointmentId}:`, error);
  }
}

/**
 * Send appointment reminder notifications (email + SMS based on settings)
 */
export async function sendAppointmentReminder(appointmentId: number, businessId: number) {
  try {
    const settings = await storage.getNotificationSettings(businessId);
    const sendEmailPref = settings?.appointmentReminderEmail !== false;
    const sendSmsPref = settings?.appointmentReminderSms !== false;

    if (!sendEmailPref && !sendSmsPref) return;

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) return;
    if (appointment.status === 'cancelled' || appointment.status === 'completed') return;

    const customer = await storage.getCustomer(appointment.customerId);
    if (!customer) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    let serviceName = 'your appointment';
    if (appointment.serviceId) {
      const service = await storage.getService(appointment.serviceId);
      if (service) serviceName = service.name;
    }

    const appointmentDate = new Date(appointment.startDate);
    const dateStr = formatDate(appointmentDate);
    const timeStr = formatTime(appointmentDate);

    // Send email
    if (sendEmailPref && customer.email) {
      try {
        await sendAppointmentReminderEmail(
          customer.email,
          customer.firstName,
          business.name,
          serviceName,
          dateStr,
          timeStr,
          business.phone || ''
        );
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'appointment_reminder',
          channel: 'email',
          recipient: customer.email,
          subject: `Reminder: Your Appointment Tomorrow - ${business.name}`,
          status: 'sent',
          referenceType: 'appointment',
          referenceId: appointmentId,
        });
      } catch (err) {
        console.error('Failed to send appointment reminder email:', err);
      }
    }

    // Send SMS
    if (sendSmsPref && customer.phone) {
      try {
        const message = `Hi ${customer.firstName}! Reminder: ${serviceName} is scheduled for ${dateStr} at ${timeStr}. Reply CONFIRM to confirm or call ${business.phone} to reschedule. - ${business.name}`;
        await twilioService.sendSms(customer.phone, message);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'appointment_reminder',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'appointment',
          referenceId: appointmentId,
        });
      } catch (err) {
        console.error('Failed to send appointment reminder SMS:', err);
      }
    }
  } catch (error) {
    console.error(`Error in sendAppointmentReminder for appointment ${appointmentId}:`, error);
  }
}

/**
 * Send invoice created notifications
 */
export async function sendInvoiceCreatedNotification(invoiceId: number, businessId: number) {
  try {
    const settings = await storage.getNotificationSettings(businessId);
    const sendEmailPref = settings?.invoiceCreatedEmail !== false;
    const sendSmsPref = settings?.invoiceCreatedSms === true; // default off for SMS

    if (!sendEmailPref && !sendSmsPref) return;

    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) return;

    const customer = await storage.getCustomer(invoice.customerId);
    if (!customer) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    const amount = formatCurrency(invoice.total || 0);
    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Upon receipt';

    // Send email
    if (sendEmailPref && customer.email) {
      try {
        await sendInvoiceEmail(
          customer.email,
          customer.firstName,
          business.name,
          invoice.invoiceNumber,
          amount,
          dueDate,
          business.phone || ''
        );
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'invoice_created',
          channel: 'email',
          recipient: customer.email,
          subject: `Invoice #${invoice.invoiceNumber} from ${business.name}`,
          status: 'sent',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
      } catch (err) {
        console.error('Failed to send invoice email:', err);
      }
    }

    // Send SMS
    if (sendSmsPref && customer.phone) {
      try {
        const message = `Hi ${customer.firstName}! You have a new invoice #${invoice.invoiceNumber} for ${amount} from ${business.name}. Due: ${dueDate}. Call ${business.phone} for questions.`;
        await twilioService.sendSms(customer.phone, message);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'invoice_created',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
      } catch (err) {
        console.error('Failed to send invoice SMS:', err);
      }
    }
  } catch (error) {
    console.error(`Error in sendInvoiceCreatedNotification for invoice ${invoiceId}:`, error);
  }
}

/**
 * Send invoice payment reminder notifications
 */
export async function sendInvoiceReminderNotification(invoiceId: number, businessId: number) {
  try {
    const settings = await storage.getNotificationSettings(businessId);
    const sendEmailPref = settings?.invoiceReminderEmail !== false;
    const sendSmsPref = settings?.invoiceReminderSms !== false;

    if (!sendEmailPref && !sendSmsPref) return;

    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || invoice.status === 'paid') return;

    const customer = await storage.getCustomer(invoice.customerId);
    if (!customer) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    const amount = formatCurrency(invoice.total || 0);
    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Upon receipt';

    // Send email
    if (sendEmailPref && customer.email) {
      try {
        await sendInvoiceReminderEmail(
          customer.email,
          customer.firstName,
          business.name,
          invoice.invoiceNumber,
          amount,
          dueDate,
          business.phone || ''
        );
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'invoice_reminder',
          channel: 'email',
          recipient: customer.email,
          subject: `Payment Reminder: Invoice #${invoice.invoiceNumber}`,
          status: 'sent',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
      } catch (err) {
        console.error('Failed to send invoice reminder email:', err);
      }
    }

    // Send SMS
    if (sendSmsPref && customer.phone) {
      try {
        const message = `Hi ${customer.firstName}! Reminder: invoice #${invoice.invoiceNumber} for ${amount} is due ${dueDate}. Call ${business.phone} to pay. - ${business.name}`;
        await twilioService.sendSms(customer.phone, message);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'invoice_reminder',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
      } catch (err) {
        console.error('Failed to send invoice reminder SMS:', err);
      }
    }
  } catch (error) {
    console.error(`Error in sendInvoiceReminderNotification for invoice ${invoiceId}:`, error);
  }
}

/**
 * Send payment confirmation notifications
 */
export async function sendPaymentConfirmation(invoiceId: number, businessId: number) {
  try {
    const settings = await storage.getNotificationSettings(businessId);
    const sendEmailPref = settings?.invoicePaymentConfirmationEmail !== false;

    if (!sendEmailPref) return;

    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) return;

    const customer = await storage.getCustomer(invoice.customerId);
    if (!customer || !customer.email) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    const amount = formatCurrency(invoice.total || 0);

    try {
      await sendPaymentConfirmationEmail(
        customer.email,
        customer.firstName,
        business.name,
        invoice.invoiceNumber,
        amount
      );
      await storage.createNotificationLog({
        businessId,
        customerId: customer.id,
        type: 'payment_confirmation',
        channel: 'email',
        recipient: customer.email,
        subject: `Payment Received - Invoice #${invoice.invoiceNumber}`,
        status: 'sent',
        referenceType: 'invoice',
        referenceId: invoiceId,
      });
    } catch (err) {
      console.error('Failed to send payment confirmation email:', err);
    }
  } catch (error) {
    console.error(`Error in sendPaymentConfirmation for invoice ${invoiceId}:`, error);
  }
}

/**
 * Send job completed notifications
 */
export async function sendJobCompletedNotification(jobId: number, businessId: number) {
  try {
    const settings = await storage.getNotificationSettings(businessId);
    const sendEmailPref = settings?.jobCompletedEmail !== false;
    const sendSmsPref = settings?.jobCompletedSms !== false;

    if (!sendEmailPref && !sendSmsPref) return;

    const job = await storage.getJob(jobId);
    if (!job) return;

    const customer = await storage.getCustomer(job.customerId);
    if (!customer) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    // Send email
    if (sendEmailPref && customer.email) {
      try {
        await sendJobCompletedEmail(
          customer.email,
          customer.firstName,
          business.name,
          job.title,
          business.phone || ''
        );
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'job_completed',
          channel: 'email',
          recipient: customer.email,
          subject: `Job Completed - ${business.name}`,
          status: 'sent',
          referenceType: 'job',
          referenceId: jobId,
        });
      } catch (err) {
        console.error('Failed to send job completed email:', err);
      }
    }

    // Send SMS
    if (sendSmsPref && customer.phone) {
      try {
        const message = `Hi ${customer.firstName}! "${job.title}" has been completed. Questions? Call ${business.phone}. Thank you for choosing ${business.name}!`;
        await twilioService.sendSms(customer.phone, message);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'job_completed',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'job',
          referenceId: jobId,
        });
      } catch (err) {
        console.error('Failed to send job completed SMS:', err);
      }
    }
  } catch (error) {
    console.error(`Error in sendJobCompletedNotification for job ${jobId}:`, error);
  }
}

/**
 * Send quote email to customer with view/accept/decline link
 */
export async function sendQuoteSentNotification(
  quoteId: number,
  businessId: number,
  quoteUrl: string
) {
  try {
    const quote = await storage.getQuoteById(quoteId, businessId);
    if (!quote || !quote.customer) return;

    const customer = quote.customer;
    const business = await storage.getBusiness(businessId);
    if (!business) return;

    const amount = formatCurrency(quote.total || 0);
    const validUntil = quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'No expiration';

    // Send email if customer has email
    if (customer.email) {
      try {
        await sendQuoteEmail(
          customer.email,
          customer.firstName,
          business.name,
          quote.quoteNumber,
          amount,
          validUntil,
          quoteUrl,
          business.phone || ''
        );
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'quote_sent',
          channel: 'email',
          recipient: customer.email,
          subject: `Quote #${quote.quoteNumber} from ${business.name}`,
          status: 'sent',
          referenceType: 'quote',
          referenceId: quoteId,
        });
        console.log(`Quote #${quote.quoteNumber} email sent to ${customer.email}`);
      } catch (err) {
        console.error('Failed to send quote email:', err);
      }
    }

    // Send SMS if customer has phone
    if (customer.phone) {
      try {
        const message = `Hi ${customer.firstName}! ${business.name} has sent you a quote #${quote.quoteNumber} for ${amount}. View it here: ${quoteUrl}`;
        await twilioService.sendSms(customer.phone, message);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'quote_sent',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'quote',
          referenceId: quoteId,
        });
        console.log(`Quote #${quote.quoteNumber} SMS sent to ${customer.phone}`);
      } catch (err) {
        console.error('Failed to send quote SMS:', err);
      }
    }
  } catch (error) {
    console.error(`Error in sendQuoteSentNotification for quote ${quoteId}:`, error);
  }
}

/**
 * Send notification when invoice is sent to customer (via generate-link)
 */
export async function sendInvoiceSentNotification(
  invoiceId: number,
  businessId: number,
  invoiceUrl: string
) {
  try {
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) return;

    const customer = await storage.getCustomer(invoice.customerId);
    if (!customer) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    const amount = formatCurrency(invoice.total || 0);
    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Upon receipt';

    if (customer.email) {
      try {
        await sendInvoiceEmail(
          customer.email,
          customer.firstName,
          business.name,
          invoice.invoiceNumber,
          amount,
          dueDate,
          business.phone || ''
        );
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'invoice_sent',
          channel: 'email',
          recipient: customer.email,
          subject: `Invoice #${invoice.invoiceNumber} from ${business.name}`,
          status: 'sent',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
        console.log(`Invoice #${invoice.invoiceNumber} email sent to ${customer.email}`);
      } catch (err) {
        console.error('Failed to send invoice email:', err);
      }
    }

    if (customer.phone) {
      try {
        const message = `Hi ${customer.firstName}! ${business.name} has sent you invoice #${invoice.invoiceNumber} for ${amount} (due ${dueDate}). View & pay here: ${invoiceUrl}`;
        await twilioService.sendSms(customer.phone, message);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'invoice_sent',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
        console.log(`Invoice #${invoice.invoiceNumber} SMS sent to ${customer.phone}`);
      } catch (err) {
        console.error('Failed to send invoice SMS:', err);
      }
    }
  } catch (error) {
    console.error(`Error in sendInvoiceSentNotification for invoice ${invoiceId}:`, error);
  }
}

/**
 * Send notification when a quote is converted to an invoice
 */
export async function sendQuoteConvertedNotification(
  invoiceId: number,
  businessId: number
) {
  try {
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) return;

    const customer = await storage.getCustomer(invoice.customerId);
    if (!customer) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    const amount = formatCurrency(invoice.total || 0);
    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Upon receipt';

    if (customer.email) {
      try {
        await sendInvoiceEmail(
          customer.email,
          customer.firstName,
          business.name,
          invoice.invoiceNumber,
          amount,
          dueDate,
          business.phone || ''
        );
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'quote_converted',
          channel: 'email',
          recipient: customer.email,
          subject: `Invoice #${invoice.invoiceNumber} from ${business.name}`,
          status: 'sent',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
        console.log(`Quote-to-invoice notification sent to ${customer.email}`);
      } catch (err) {
        console.error('Failed to send quote conversion email:', err);
      }
    }

    if (customer.phone) {
      try {
        const message = `Hi ${customer.firstName}! Your accepted quote from ${business.name} has been converted to invoice #${invoice.invoiceNumber} for ${amount} (due ${dueDate}). Call ${business.phone || 'us'} with any questions.`;
        await twilioService.sendSms(customer.phone, message);
        await storage.createNotificationLog({
          businessId,
          customerId: customer.id,
          type: 'quote_converted',
          channel: 'sms',
          recipient: customer.phone,
          message,
          status: 'sent',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
      } catch (err) {
        console.error('Failed to send quote conversion SMS:', err);
      }
    }
  } catch (error) {
    console.error(`Error in sendQuoteConvertedNotification for invoice ${invoiceId}:`, error);
  }
}

/**
 * Send a quote follow-up reminder to the customer.
 * Used by the automated quote follow-up scheduler.
 */
/**
 * Send a quote follow-up reminder to the customer.
 * Used by the automated quote follow-up scheduler.
 */
export async function sendQuoteFollowUpNotification(quoteId: number, businessId: number) {
  try {
    const quote = await storage.getQuoteById(quoteId, businessId);
    if (!quote || quote.status !== 'pending' || !quote.customer) return;

    const customer = quote.customer;
    if (!customer.email) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    const amount = formatCurrency(quote.total || 0);
    const validUntil = quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Not specified';

    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const quoteUrl = quote.accessToken
      ? `${baseUrl}/quotes/view/${quote.accessToken}`
      : `${baseUrl}/quotes/${quote.id}`;

    try {
      await sendQuoteFollowUpEmail(
        customer.email,
        customer.firstName,
        business.name,
        quote.quoteNumber,
        amount,
        validUntil,
        quoteUrl,
        business.phone || ''
      );

      await storage.createNotificationLog({
        businessId,
        customerId: customer.id,
        type: 'quote_follow_up',
        channel: 'email',
        recipient: customer.email,
        subject: `Follow-up: Quote #${quote.quoteNumber}`,
        status: 'sent',
        referenceType: 'quote',
        referenceId: quoteId,
      });

      console.log(`Quote follow-up sent for quote #${quote.quoteNumber} to ${customer.email}`);
    } catch (err) {
      console.error('Failed to send quote follow-up email:', err);
    }
  } catch (error) {
    console.error(`Error in sendQuoteFollowUpNotification for quote ${quoteId}:`, error);
  }
}

export default {
  sendAppointmentConfirmation,
  sendAppointmentReminder,
  sendInvoiceCreatedNotification,
  sendInvoiceReminderNotification,
  sendInvoiceSentNotification,
  sendPaymentConfirmation,
  sendJobCompletedNotification,
  sendQuoteSentNotification,
  sendQuoteConvertedNotification,
  sendQuoteFollowUpNotification,
};
