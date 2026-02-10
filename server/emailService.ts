/**
 * Email Service for SmallBizAgent
 *
 * This service handles sending emails for password reset and other notifications
 */
import nodemailer from 'nodemailer';

// Create a transporter
let transporter: nodemailer.Transporter | null = null;
let etherealAccount: { user: string; pass: string } | null = null;

// Initialize email transporter
async function initTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) {
    return transporter;
  }

  if (process.env.NODE_ENV === 'production' && process.env.EMAIL_HOST) {
    // Production transporter configuration
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  } else {
    // Development transporter configuration - use ethereal.email
    // This creates a test email account for development
    if (!etherealAccount) {
      etherealAccount = await nodemailer.createTestAccount();
      console.log('Ethereal email account created for testing:');
      console.log(`- Username: ${etherealAccount.user}`);
      console.log(`- Password: ${etherealAccount.pass}`);
      console.log('- Preview URL: https://ethereal.email/login');
    }

    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: etherealAccount.user,
        pass: etherealAccount.pass
      }
    });
  }

  return transporter;
}

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

/**
 * Send an email
 */
export async function sendEmail(options: EmailOptions): Promise<{ messageId: string; previewUrl?: string }> {
  const transport = await initTransporter();

  const from = options.from || `"SmallBizAgent" <${process.env.EMAIL_FROM || 'no-reply@smallbizagent.com'}>`;

  const mailOptions = {
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html || undefined
  };

  try {
    const info = await transport.sendMail(mailOptions);

    // Log email preview URL in development
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('Email sent: %s', info.messageId);
      console.log('Preview URL: %s', previewUrl);
    }

    return {
      messageId: info.messageId,
      previewUrl: previewUrl ? String(previewUrl) : undefined
    };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetLink: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `Password Reset Request - SmallBizAgent`;
  const text = `
Hello ${username},

We received a request to reset your password for your SmallBizAgent account.

To reset your password, please click the link below:
${resetLink}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email or contact us if you have concerns.

Thank you,
SmallBizAgent Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p>Hello ${username},</p>
      <p>We received a request to reset your password for your SmallBizAgent account.</p>

      <p>To reset your password, please click the button below:</p>
      <p style="margin: 30px 0;">
        <a href="${resetLink}" style="display: inline-block; background-color: #000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Reset Password
        </a>
      </p>

      <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>

      <p style="color: #666; font-size: 14px;">If you did not request a password reset, please ignore this email or contact us if you have concerns.</p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Thank you,<br>SmallBizAgent Team</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
}

/**
 * Send an appointment confirmation email
 */
export async function sendAppointmentConfirmationEmail(
  customerEmail: string,
  customerName: string,
  businessName: string,
  serviceName: string,
  dateStr: string,
  timeStr: string,
  businessPhone: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `Appointment Confirmed - ${businessName}`;
  const text = `Hi ${customerName},\n\nYour appointment for ${serviceName} has been confirmed.\n\nDate: ${dateStr}\nTime: ${timeStr}\n\nIf you need to reschedule, please call us at ${businessPhone}.\n\nThank you,\n${businessName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Appointment Confirmed</h2>
      <p>Hi ${customerName},</p>
      <p>Your appointment has been confirmed:</p>
      <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Service:</strong> ${serviceName}</p>
        <p style="margin: 4px 0;"><strong>Date:</strong> ${dateStr}</p>
        <p style="margin: 4px 0;"><strong>Time:</strong> ${timeStr}</p>
      </div>
      <p>If you need to reschedule, please call us at <a href="tel:${businessPhone}">${businessPhone}</a>.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Thank you,<br>${businessName}</p>
    </div>
  `;

  return sendEmail({ to: customerEmail, subject, text, html });
}

/**
 * Send an appointment reminder email
 */
export async function sendAppointmentReminderEmail(
  customerEmail: string,
  customerName: string,
  businessName: string,
  serviceName: string,
  dateStr: string,
  timeStr: string,
  businessPhone: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `Reminder: Your Appointment Tomorrow - ${businessName}`;
  const text = `Hi ${customerName},\n\nThis is a friendly reminder about your upcoming appointment for ${serviceName}.\n\nDate: ${dateStr}\nTime: ${timeStr}\n\nIf you need to reschedule, please call us at ${businessPhone}.\n\nSee you soon!\n${businessName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Appointment Reminder</h2>
      <p>Hi ${customerName},</p>
      <p>This is a friendly reminder about your upcoming appointment:</p>
      <div style="background: #f0f7ff; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #2563eb;">
        <p style="margin: 4px 0;"><strong>Service:</strong> ${serviceName}</p>
        <p style="margin: 4px 0;"><strong>Date:</strong> ${dateStr}</p>
        <p style="margin: 4px 0;"><strong>Time:</strong> ${timeStr}</p>
      </div>
      <p>If you need to reschedule, please call us at <a href="tel:${businessPhone}">${businessPhone}</a>.</p>
      <p>See you soon!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Thank you,<br>${businessName}</p>
    </div>
  `;

  return sendEmail({ to: customerEmail, subject, text, html });
}

/**
 * Send an invoice email to customer
 */
export async function sendInvoiceEmail(
  customerEmail: string,
  customerName: string,
  businessName: string,
  invoiceNumber: string,
  amount: string,
  dueDate: string,
  businessPhone: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `Invoice #${invoiceNumber} from ${businessName}`;
  const text = `Hi ${customerName},\n\nYou have a new invoice from ${businessName}.\n\nInvoice: #${invoiceNumber}\nAmount: ${amount}\nDue Date: ${dueDate}\n\nTo make a payment or if you have questions, please call us at ${businessPhone}.\n\nThank you,\n${businessName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">New Invoice</h2>
      <p>Hi ${customerName},</p>
      <p>You have a new invoice from ${businessName}:</p>
      <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Invoice:</strong> #${invoiceNumber}</p>
        <p style="margin: 4px 0;"><strong>Amount:</strong> ${amount}</p>
        <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate}</p>
      </div>
      <p>To make a payment or if you have questions, please call us at <a href="tel:${businessPhone}">${businessPhone}</a>.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Thank you,<br>${businessName}</p>
    </div>
  `;

  return sendEmail({ to: customerEmail, subject, text, html });
}

/**
 * Send an invoice payment reminder email
 */
export async function sendInvoiceReminderEmail(
  customerEmail: string,
  customerName: string,
  businessName: string,
  invoiceNumber: string,
  amount: string,
  dueDate: string,
  businessPhone: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `Payment Reminder: Invoice #${invoiceNumber} - ${businessName}`;
  const text = `Hi ${customerName},\n\nThis is a friendly reminder that invoice #${invoiceNumber} for ${amount} is due on ${dueDate}.\n\nPlease call us at ${businessPhone} to make a payment.\n\nThank you,\n${businessName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Payment Reminder</h2>
      <p>Hi ${customerName},</p>
      <p>This is a friendly reminder about your outstanding invoice:</p>
      <div style="background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 4px 0;"><strong>Invoice:</strong> #${invoiceNumber}</p>
        <p style="margin: 4px 0;"><strong>Amount Due:</strong> ${amount}</p>
        <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate}</p>
      </div>
      <p>Please call us at <a href="tel:${businessPhone}">${businessPhone}</a> to make a payment.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Thank you,<br>${businessName}</p>
    </div>
  `;

  return sendEmail({ to: customerEmail, subject, text, html });
}

/**
 * Send a payment confirmation email
 */
export async function sendPaymentConfirmationEmail(
  customerEmail: string,
  customerName: string,
  businessName: string,
  invoiceNumber: string,
  amount: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `Payment Received - Invoice #${invoiceNumber} - ${businessName}`;
  const text = `Hi ${customerName},\n\nWe've received your payment of ${amount} for invoice #${invoiceNumber}.\n\nThank you for your business!\n${businessName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Payment Received</h2>
      <p>Hi ${customerName},</p>
      <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #22c55e;">
        <p style="margin: 4px 0;"><strong>Invoice:</strong> #${invoiceNumber}</p>
        <p style="margin: 4px 0;"><strong>Amount Paid:</strong> ${amount}</p>
        <p style="margin: 4px 0;"><strong>Status:</strong> Paid</p>
      </div>
      <p>Thank you for your business!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Thank you,<br>${businessName}</p>
    </div>
  `;

  return sendEmail({ to: customerEmail, subject, text, html });
}

/**
 * Send job completion email
 */
export async function sendJobCompletedEmail(
  customerEmail: string,
  customerName: string,
  businessName: string,
  jobTitle: string,
  businessPhone: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `Job Completed - ${businessName}`;
  const text = `Hi ${customerName},\n\nWe're pleased to let you know that "${jobTitle}" has been completed.\n\nIf you have any questions or need anything else, please call us at ${businessPhone}.\n\nThank you for choosing ${businessName}!`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Job Completed</h2>
      <p>Hi ${customerName},</p>
      <p>We're pleased to let you know that your job has been completed:</p>
      <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #22c55e;">
        <p style="margin: 4px 0;"><strong>Job:</strong> ${jobTitle}</p>
        <p style="margin: 4px 0;"><strong>Status:</strong> Completed</p>
      </div>
      <p>If you have any questions or need anything else, please call us at <a href="tel:${businessPhone}">${businessPhone}</a>.</p>
      <p>Thank you for choosing ${businessName}!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">${businessName}</p>
    </div>
  `;

  return sendEmail({ to: customerEmail, subject, text, html });
}
