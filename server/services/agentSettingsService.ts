import { storage } from '../storage';

const AGENT_TYPES = ['follow_up', 'no_show', 'estimate_follow_up', 'rebooking', 'review_response'] as const;
export type AgentType = typeof AGENT_TYPES[number];

const DEFAULT_CONFIGS: Record<AgentType, any> = {
  follow_up: {
    thankYouTemplate: "Hi {customerName}! Thank you for choosing {businessName}. We hope everything went great!",
    upsellTemplate: "Hi {customerName}, ready to book your next visit with {businessName}? Book online: {bookingLink}",
    thankYouDelayMinutes: 30,
    upsellDelayHours: 48,
    enableThankYou: true,
    enableUpsell: true,
  },
  no_show: {
    messageTemplate: "Hey {customerName}, we missed you at your {appointmentTime} appointment with {businessName}. Want to reschedule? Reply YES.",
    rescheduleReplyTemplate: "Great! Book online at {bookingLink} or call us at {businessPhone}.",
    declineReplyTemplate: "No problem! We'll be here whenever you're ready. - {businessName}",
    expirationHours: 24,
  },
  estimate_follow_up: {
    messageTemplates: [
      "Hi {customerName}! Just checking in on the estimate from {businessName}. Any questions?",
      "Hi {customerName}, wanted to follow up on your estimate (${quoteTotal}). Let us know if you'd like to move forward!",
      "Hi {customerName}, last check-in on your estimate from {businessName}. We'd love to earn your business!",
    ],
    attemptIntervalHours: [48, 96, 168],
    maxAttempts: 3,
    autoExpire: true,
  },
  rebooking: {
    defaultIntervalDays: 42,
    serviceIntervals: {},
    messageTemplate: "Hi {customerName}! It's been {daysSinceVisit} days since your last {serviceName} at {businessName}. Ready to book? Reply YES!",
    bookingReplyTemplate: "Awesome! Book here: {bookingLink} or call {businessPhone}",
    declineReplyTemplate: "No worries! We'll be here when you're ready. - {businessName}",
  },
  review_response: {
    tone: "professional",
    maxResponseLength: 200,
    includeBusinessName: true,
    thankForPositive: true,
    apologizeForNegative: true,
    fetchIntervalHours: 6,
  },
};

export async function isAgentEnabled(businessId: number, agentType: string): Promise<boolean> {
  const settings = await storage.getAgentSettings(businessId, agentType);
  return settings?.enabled ?? false;
}

export async function getAgentConfig(businessId: number, agentType: string): Promise<any> {
  const settings = await storage.getAgentSettings(businessId, agentType);
  const defaults = DEFAULT_CONFIGS[agentType as AgentType] ?? {};
  const custom = (settings?.config as Record<string, any>) ?? {};
  return { ...defaults, ...custom };
}

export async function getDefaultConfig(agentType: string): Promise<any> {
  return DEFAULT_CONFIGS[agentType as AgentType] ?? {};
}

export function getAgentTypes(): readonly string[] {
  return AGENT_TYPES;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

export default {
  isAgentEnabled,
  getAgentConfig,
  getDefaultConfig,
  getAgentTypes,
  fillTemplate,
};
