/**
 * Email Service for SmallBizAgent
 *
 * Priority: Resend (primary) → SendGrid (fallback) → SMTP/Nodemailer → Ethereal (dev)
 */
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { Resend } from 'resend';

// Determine which email provider to use
const useResend = !!process.env.RESEND_API_KEY;
const useSendGrid = !useResend && !!process.env.SENDGRID_API_KEY;

let resend: Resend | null = null;

if (useResend) {
  resend = new Resend(process.env.RESEND_API_KEY!);
  console.log('✅ Resend email configured');
  console.log(`   Email FROM: ${process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}`);
} else if (useSendGrid) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  console.log('✅ SendGrid email configured');
  console.log(`   Email FROM: ${process.env.EMAIL_FROM || process.env.SENDGRID_FROM_EMAIL || 'no-reply@smallbizagent.com'}`);
} else {
  console.log('⚠️ No email API key found (RESEND_API_KEY or SENDGRID_API_KEY) — falling back to Ethereal test email');
}

// Nodemailer fallback transporter
let transporter: nodemailer.Transporter | null = null;
let etherealAccount: { user: string; pass: string } | null = null;

// Initialize Nodemailer transporter (fallback when no Resend/SendGrid)
async function initTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) {
    return transporter;
  }

  if (process.env.EMAIL_HOST) {
    // Custom SMTP configuration
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
    // Development fallback - use ethereal.email
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
 * Send an email via Resend (primary), SendGrid (fallback), or Nodemailer (last resort)
 */
export async function sendEmail(options: EmailOptions): Promise<{ messageId: string; previewUrl?: string }> {
  const from = options.from || process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'onboarding@resend.dev';

  // Use Resend if available (primary)
  if (useResend && resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: `SmallBizAgent <${from}>`,
        to: [options.to],
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
      });

      if (error) {
        console.error('Resend error:', error);
        throw new Error(error.message);
      }

      const messageId = data?.id || `resend-${Date.now()}`;
      console.log(`Email sent via Resend to ${options.to} (${messageId})`);
      return { messageId };
    } catch (error: any) {
      console.error('Resend error:', error.message);
      throw error;
    }
  }

  // Use SendGrid if available (fallback)
  if (useSendGrid) {
    try {
      const [response] = await sgMail.send({
        to: options.to,
        from: { email: from, name: 'SmallBizAgent' },
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
      });

      const messageId = response.headers['x-message-id'] || `sg-${Date.now()}`;
      console.log(`Email sent via SendGrid to ${options.to} (${messageId})`);

      return { messageId };
    } catch (error: any) {
      console.error('SendGrid error:', error?.response?.body || error.message);
      throw error;
    }
  }

  // Fallback to Nodemailer
  const transport = await initTransporter();

  const mailOptions = {
    from: `"SmallBizAgent" <${from}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html || undefined
  };

  try {
    const info = await transport.sendMail(mailOptions);

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
 * Send an email verification code
 */
export async function sendVerificationCodeEmail(
  email: string,
  username: string,
  code: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `Your verification code: ${code} - SmallBizAgent`;
  const text = `
Hello ${username},

Your SmallBizAgent verification code is: ${code}

Enter this code to verify your email address and complete your account setup.

This code expires in 10 minutes.

If you did not create a SmallBizAgent account, please ignore this email.

Thank you,
SmallBizAgent Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Verify your email</h2>
      <p>Hello ${username},</p>
      <p>Your verification code is:</p>

      <div style="margin: 30px 0; text-align: center;">
        <span style="display: inline-block; background-color: #f4f4f5; color: #000; padding: 16px 32px; font-size: 32px; font-weight: 700; letter-spacing: 8px; border-radius: 8px; font-family: monospace;">
          ${code}
        </span>
      </div>

      <p>Enter this code to verify your email address and complete your account setup.</p>

      <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>

      <p style="color: #666; font-size: 14px;">If you did not create a SmallBizAgent account, please ignore this email.</p>

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
 * Send a staff invite email
 */
export async function sendStaffInviteEmail(
  staffEmail: string,
  staffName: string,
  businessName: string,
  inviteUrl: string
): Promise<{ messageId: string; previewUrl?: string }> {
  const subject = `You're invited to join ${businessName} on SmallBizAgent`;
  const text = `
Hi ${staffName},

You've been invited to join ${businessName} on SmallBizAgent!

Click the link below to create your account and access your schedule, appointments, and more:
${inviteUrl}

This invite link expires in 7 days.

If you weren't expecting this invite, you can safely ignore this email.

Thank you,
${businessName}
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">You're Invited!</h2>
      <p>Hi ${staffName},</p>
      <p>You've been invited to join <strong>${businessName}</strong> on SmallBizAgent.</p>
      <p>Create your account to access your personal dashboard where you can view your schedule, upcoming appointments, and more.</p>

      <p style="margin: 30px 0; text-align: center;">
        <a href="${inviteUrl}" style="display: inline-block; background-color: #000; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Join ${businessName}
        </a>
      </p>

      <p style="color: #666; font-size: 14px;">This invite link expires in 7 days.</p>
      <p style="color: #666; font-size: 14px;">If you weren't expecting this invite, you can safely ignore this email.</p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">Thank you,<br>${businessName}</p>
    </div>
  `;

  return sendEmail({ to: staffEmail, subject, text, html });
}

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
