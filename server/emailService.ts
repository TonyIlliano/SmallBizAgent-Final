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
