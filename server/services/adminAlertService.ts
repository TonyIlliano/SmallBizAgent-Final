/**
 * Admin Alert Service
 *
 * Sends real-time alerts to the platform admin via email and optionally Slack
 * when critical events occur: payment failures, trial expirations,
 * provisioning failures, and high churn risk.
 */

import { sendEmail } from "../emailService";

export type AdminAlertType = 'payment_failed' | 'trial_expired' | 'provisioning_failed' | 'churn_risk_high';

interface AdminAlertOptions {
  type: AdminAlertType;
  severity: 'high' | 'medium' | 'low';
  title: string;
  details: Record<string, any>;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: '#DC2626',
  medium: '#D97706',
  low: '#6B7280',
};

const SEVERITY_EMOJI: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
};

/**
 * Send an admin alert via email and optionally Slack webhook.
 * Never throws — failures are logged and swallowed.
 */
export async function sendAdminAlert(options: AdminAlertOptions): Promise<void> {
  const { type, severity, title, details } = options;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'bark@smallbizagent.ai';
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  // Send email and Slack in parallel
  const promises: Promise<void>[] = [
    sendAlertEmail(adminEmail, type, severity, title, details),
  ];

  if (slackWebhookUrl) {
    promises.push(sendSlackAlert(slackWebhookUrl, type, severity, title, details));
  }

  await Promise.allSettled(promises);
}

async function sendAlertEmail(
  to: string,
  type: AdminAlertType,
  severity: string,
  title: string,
  details: Record<string, any>
): Promise<void> {
  try {
    const color = SEVERITY_COLORS[severity] || '#6B7280';
    const detailRows = Object.entries(details)
      .map(([key, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#6B7280;font-size:14px;">${formatLabel(key)}</td><td style="padding:4px 0;font-size:14px;">${value}</td></tr>`)
      .join('');

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
        <div style="border-left:4px solid ${color};padding:16px 20px;background:#FAFAFA;border-radius:4px;margin-bottom:16px;">
          <h2 style="margin:0 0 4px 0;font-size:18px;color:#111;">${title}</h2>
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;color:white;background:${color};">${severity.toUpperCase()}</span>
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;color:#6B7280;background:#F3F4F6;margin-left:4px;">${type.replace(/_/g, ' ')}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">${detailRows}</table>
        <p style="margin-top:20px;font-size:12px;color:#9CA3AF;">SmallBizAgent Platform Alert &bull; ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
      </div>
    `;

    const text = `[${severity.toUpperCase()}] ${title}\n\n${Object.entries(details).map(([k, v]) => `${formatLabel(k)}: ${v}`).join('\n')}\n\nSmallBizAgent Platform Alert`;

    await sendEmail({
      to,
      subject: `${SEVERITY_EMOJI[severity]} [${severity.toUpperCase()}] ${title}`,
      text,
      html,
    });
  } catch (error) {
    console.error('[AdminAlertService] Email alert failed:', error);
  }
}

async function sendSlackAlert(
  webhookUrl: string,
  type: AdminAlertType,
  severity: string,
  title: string,
  details: Record<string, any>
): Promise<void> {
  try {
    const color = SEVERITY_COLORS[severity] || '#6B7280';
    const fields = Object.entries(details).map(([key, value]) => ({
      type: 'mrkdwn',
      text: `*${formatLabel(key)}*\n${value}`,
    }));

    const payload = {
      attachments: [{
        color,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `${SEVERITY_EMOJI[severity]} ${title}`, emoji: true },
          },
          {
            type: 'section',
            fields: fields.slice(0, 10), // Slack max 10 fields
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `*Severity:* ${severity} | *Type:* ${type.replace(/_/g, ' ')} | ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}` },
            ],
          },
        ],
      }],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[AdminAlertService] Slack webhook returned', response.status);
    }
  } catch (error) {
    console.error('[AdminAlertService] Slack alert failed:', error);
  }
}

function formatLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).replace(/_/g, ' ');
}
