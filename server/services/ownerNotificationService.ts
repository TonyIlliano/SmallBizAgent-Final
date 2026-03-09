/**
 * Owner Notification Service
 *
 * Sends real-time email alerts to the business owner/email for key events:
 * - New appointment booked (online or by phone)
 * - Payment received
 * - Missed call
 *
 * These are fire-and-forget — failures are logged but never block the main flow.
 */

import { storage } from "../storage";
import { sendEmail } from "../emailService";

const APP_URL = process.env.APP_URL || "https://www.smallbizagent.ai";

/**
 * Notify owner that a new appointment was booked.
 */
export async function notifyOwnerNewBooking(
  appointmentId: number,
  businessId: number,
): Promise<void> {
  try {
    const business = await storage.getBusiness(businessId);
    if (!business?.email) return;

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) return;

    const customer = appointment.customerId
      ? await storage.getCustomer(appointment.customerId)
      : null;

    let serviceName = "Appointment";
    if (appointment.serviceId) {
      const service = await storage.getService(appointment.serviceId);
      if (service) serviceName = service.name;
    }

    const customerName = customer
      ? `${customer.firstName} ${customer.lastName}`
      : "New Customer";
    const timeStr = appointment.startDate
      ? new Date(appointment.startDate).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "TBD";

    const subject = `New Booking: ${customerName} — ${serviceName}`;
    const text = `${customerName} booked ${serviceName} for ${timeStr}.\n\nView: ${APP_URL}/appointments`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;border-radius:4px;">
          <h3 style="margin:0 0 8px;color:#16a34a;">New Booking</h3>
          <p style="margin:0;color:#333;"><strong>${customerName}</strong> booked <strong>${serviceName}</strong></p>
          <p style="margin:4px 0 0;color:#666;">${timeStr}</p>
          ${customer?.phone ? `<p style="margin:4px 0 0;color:#666;">Phone: ${customer.phone}</p>` : ""}
        </div>
        <div style="margin-top:16px;text-align:center;">
          <a href="${APP_URL}/appointments" style="color:#2563eb;text-decoration:none;font-weight:bold;">View Appointments →</a>
        </div>
      </div>
    `;

    await sendEmail({ to: business.email, subject, text, html });
  } catch (err) {
    console.error(`[OwnerNotify] Failed to send booking alert for business ${businessId}:`, err);
  }
}

/**
 * Notify owner that a payment was received.
 */
export async function notifyOwnerPaymentReceived(
  invoiceId: number,
  businessId: number,
  amount: number,
): Promise<void> {
  try {
    const business = await storage.getBusiness(businessId);
    if (!business?.email) return;

    const invoice = await storage.getInvoice(invoiceId);
    const customer = invoice?.customerId
      ? await storage.getCustomer(invoice.customerId)
      : null;

    const customerName = customer
      ? `${customer.firstName} ${customer.lastName}`
      : "Customer";
    const invoiceNum = (invoice as any)?.invoiceNumber || `#${invoiceId}`;
    const amountStr = `$${amount.toFixed(2)}`;

    const subject = `Payment Received: ${amountStr} from ${customerName}`;
    const text = `${customerName} paid ${amountStr} for invoice ${invoiceNum}.\n\nView: ${APP_URL}/invoices`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;border-radius:4px;">
          <h3 style="margin:0 0 8px;color:#16a34a;">💰 Payment Received</h3>
          <p style="margin:0;font-size:24px;font-weight:bold;color:#333;">${amountStr}</p>
          <p style="margin:4px 0 0;color:#666;">From ${customerName} — Invoice ${invoiceNum}</p>
        </div>
        <div style="margin-top:16px;text-align:center;">
          <a href="${APP_URL}/invoices" style="color:#2563eb;text-decoration:none;font-weight:bold;">View Invoices →</a>
        </div>
      </div>
    `;

    await sendEmail({ to: business.email, subject, text, html });
  } catch (err) {
    console.error(`[OwnerNotify] Failed to send payment alert for business ${businessId}:`, err);
  }
}

/**
 * Notify owner of a missed call.
 */
export async function notifyOwnerMissedCall(
  businessId: number,
  callerPhone: string,
  callerName?: string,
): Promise<void> {
  try {
    const business = await storage.getBusiness(businessId);
    if (!business?.email) return;

    const displayName = callerName || callerPhone;
    const subject = `Missed Call from ${displayName}`;
    const text = `You missed a call from ${displayName} (${callerPhone}).\n\nView call log: ${APP_URL}/calls`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <div style="background:#fff7ed;border-left:4px solid #ea580c;padding:16px;border-radius:4px;">
          <h3 style="margin:0 0 8px;color:#ea580c;">📞 Missed Call</h3>
          <p style="margin:0;color:#333;"><strong>${displayName}</strong></p>
          <p style="margin:4px 0 0;color:#666;">${callerPhone}</p>
        </div>
        <div style="margin-top:16px;text-align:center;">
          <a href="${APP_URL}/calls" style="color:#2563eb;text-decoration:none;font-weight:bold;">View Call Log →</a>
        </div>
      </div>
    `;

    await sendEmail({ to: business.email, subject, text, html });
  } catch (err) {
    console.error(`[OwnerNotify] Failed to send missed call alert for business ${businessId}:`, err);
  }
}
