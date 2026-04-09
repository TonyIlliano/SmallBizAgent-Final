/**
 * Managed Agents — Support Assistant Tool Handlers
 *
 * All tool handlers for the Support & Customer Success agent.
 * Uses the existing storage layer — never raw SQL.
 * Returns a factory function that binds handlers to a specific businessId.
 */
import { storage } from '../../storage';

// ─── Tool Handler Implementations ───────────────────────────────────────────

async function lookupBusiness(input: any): Promise<any> {
  const business = await storage.getBusiness(input.businessId);
  if (!business) return { error: 'Business not found' };

  return {
    id: business.id,
    name: business.name,
    industry: business.industry,
    phone: business.phone,
    twilioPhoneNumber: business.twilioPhoneNumber,
    subscriptionStatus: business.subscriptionStatus,
    trialEndsAt: business.trialEndsAt,
    receptionistEnabled: business.receptionistEnabled,
    bookingSlug: business.bookingSlug,
    timezone: business.timezone,
    retellAgentId: business.retellAgentId ? 'connected' : 'not connected',
  };
}

async function checkSetupStatus(input: any): Promise<any> {
  const businessId = input.businessId;
  const [biz, svcs, stf, hrs] = await Promise.all([
    storage.getBusiness(businessId),
    storage.getServices(businessId),
    storage.getStaff(businessId),
    storage.getBusinessHours(businessId),
  ]);

  const checks: Record<string, boolean> = {
    'Business name': !!biz?.name,
    'Industry set': !!biz?.industry,
    'Phone provisioned': !!biz?.twilioPhoneNumber,
    'AI Receptionist active': !!biz?.receptionistEnabled,
    'Services added': svcs.length > 0,
    'Staff added': stf.length > 0,
    'Business hours set': hrs.length > 0 && hrs.some((h: any) => !h.isClosed),
    'Booking page active': !!biz?.bookingSlug,
  };
  const completed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const pct = Math.round((completed / total) * 100);
  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);

  return {
    completionPercent: pct,
    completed,
    total,
    missing,
    serviceCount: svcs.length,
    staffCount: stf.filter((s: any) => s.active !== false).length,
    phone: biz?.twilioPhoneNumber || 'not provisioned',
  };
}

async function checkProvisioningStatus(input: any): Promise<any> {
  const biz = await storage.getBusiness(input.businessId);
  return {
    phone: biz?.twilioPhoneNumber || 'NOT provisioned',
    receptionistEnabled: biz?.receptionistEnabled || false,
    retellAgent: biz?.retellAgentId ? 'connected' : 'not connected',
    provisioningStatus: biz?.provisioningStatus || 'unknown',
    message: biz?.twilioPhoneNumber
      ? `Your AI receptionist is live. Call ${biz.twilioPhoneNumber} to test it.`
      : 'No phone number assigned. Go to the AI Receptionist page to provision one.',
  };
}

async function getSubscriptionInfo(input: any): Promise<any> {
  try {
    const { getUsageInfo } = await import('../usageService');
    const usage = await getUsageInfo(input.businessId);
    return usage;
  } catch (err) {
    const biz = await storage.getBusiness(input.businessId);
    return {
      subscriptionStatus: biz?.subscriptionStatus || 'unknown',
      trialEndsAt: biz?.trialEndsAt,
      stripePlanId: biz?.stripePlanId || null,
    };
  }
}

async function setBusinessHours(input: any): Promise<any> {
  const { businessId, days } = input;
  const existingHours = await storage.getBusinessHours(businessId);
  const updatedDays: string[] = [];

  for (const day of (days || [])) {
    const existing = existingHours.find((h: any) => h.day === day.day);
    if (existing) {
      await storage.updateBusinessHours(existing.id, {
        open: day.isClosed ? null : (day.open || '09:00'),
        close: day.isClosed ? null : (day.close || '17:00'),
        isClosed: day.isClosed || false,
      });
    } else {
      await storage.createBusinessHours({
        businessId,
        day: day.day,
        open: day.isClosed ? null : (day.open || '09:00'),
        close: day.isClosed ? null : (day.close || '17:00'),
        isClosed: day.isClosed || false,
      });
    }
    updatedDays.push(day.isClosed
      ? `${day.day}: CLOSED`
      : `${day.day}: ${day.open || '09:00'} to ${day.close || '17:00'}`
    );
  }

  // Refresh AI receptionist with new hours
  try {
    const { debouncedUpdateRetellAgent } = await import('../retellProvisioningService');
    debouncedUpdateRetellAgent(businessId);
  } catch (err) {
    console.error('[ManagedAgent:Support] Failed to refresh receptionist:', err instanceof Error ? err.message : err);
  }

  return {
    success: true,
    message: `Business hours updated:\n${updatedDays.join('\n')}\nThe AI receptionist has been updated.`,
  };
}

async function addService(input: any): Promise<any> {
  const service = await storage.createService({
    businessId: input.businessId,
    name: input.name,
    price: input.price,
    duration: input.duration || 60,
    description: input.description || null,
  });

  // Refresh AI receptionist with new service list
  try {
    const { debouncedUpdateRetellAgent } = await import('../retellProvisioningService');
    debouncedUpdateRetellAgent(input.businessId);
  } catch (err) {
    console.error('[ManagedAgent:Support] Failed to refresh receptionist:', err instanceof Error ? err.message : err);
  }

  return {
    success: true,
    serviceId: service.id,
    message: `Service "${service.name}" created — $${input.price}, ${input.duration || 60} minutes. The AI receptionist now knows about this service.`,
  };
}

async function addStaffMember(input: any): Promise<any> {
  const staffMember = await storage.createStaffMember({
    businessId: input.businessId,
    firstName: input.firstName,
    lastName: input.lastName || '',
    email: input.email || null,
    phone: input.phone || null,
    specialty: input.specialty || null,
  });

  return {
    success: true,
    staffId: staffMember.id,
    message: `Staff member "${input.firstName}${input.lastName ? ' ' + input.lastName : ''}" added${input.specialty ? ` as ${input.specialty}` : ''}.`,
  };
}

async function addKnowledgeEntry(input: any): Promise<any> {
  const entry = await storage.createBusinessKnowledge({
    businessId: input.businessId,
    question: input.question,
    answer: input.answer,
    category: input.category || 'faq',
    source: 'owner',
    isApproved: true,
    priority: 10,
  });

  // Refresh AI receptionist with new knowledge
  try {
    const { debouncedUpdateRetellAgent } = await import('../retellProvisioningService');
    debouncedUpdateRetellAgent(input.businessId);
  } catch (err) {
    console.error('[ManagedAgent:Support] Failed to refresh receptionist:', err instanceof Error ? err.message : err);
  }

  return {
    success: true,
    entryId: entry.id,
    message: `Knowledge base entry added. When callers ask "${input.question}", the AI will answer: "${input.answer}"`,
  };
}

async function toggleSetting(input: any): Promise<any> {
  const { businessId, setting, enabled } = input;

  // Notification settings live on a different table
  const notifSettings = ['appointmentConfirmationSms', 'appointmentReminderSms', 'jobCompletedSms'];
  if (notifSettings.includes(setting)) {
    const existing = await storage.getNotificationSettings(businessId);
    if (existing) {
      await storage.upsertNotificationSettings({ ...existing, [setting]: enabled });
    }
    return { success: true, message: `${setting} ${enabled ? 'enabled' : 'disabled'}.` };
  }

  // Business-level settings
  await storage.updateBusiness(businessId, { [setting]: enabled });
  if (setting === 'receptionistEnabled') {
    try {
      const { debouncedUpdateRetellAgent } = await import('../retellProvisioningService');
      debouncedUpdateRetellAgent(businessId);
    } catch (err) {
      console.error('[ManagedAgent:Support] Failed to refresh receptionist:', err instanceof Error ? err.message : err);
    }
  }

  return { success: true, message: `${setting} ${enabled ? 'enabled' : 'disabled'}.` };
}

async function getBookingLink(input: any): Promise<any> {
  const biz = await storage.getBusiness(input.businessId);
  const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';

  if (biz?.bookingSlug) {
    return {
      success: true,
      bookingUrl: `${appUrl}/book/${biz.bookingSlug}`,
      message: `Your booking page: ${appUrl}/book/${biz.bookingSlug}\nShare this link with customers so they can book online 24/7.`,
    };
  }
  return {
    success: true,
    bookingUrl: null,
    message: 'Your booking page is not set up yet. Go to Settings > Profile to set a booking slug.',
  };
}

async function searchKnowledge(input: any): Promise<any> {
  const { businessId, query } = input;
  const entries = await storage.getBusinessKnowledge(businessId, { isApproved: true });

  // Simple keyword search
  const queryLower = query.toLowerCase();
  const matches = entries.filter((e: any) =>
    e.question?.toLowerCase().includes(queryLower) ||
    e.answer?.toLowerCase().includes(queryLower) ||
    e.category?.toLowerCase().includes(queryLower)
  ).slice(0, 10);

  if (matches.length === 0) {
    return { results: [], message: `No knowledge base entries matching "${query}".` };
  }

  return {
    results: matches.map((m: any) => ({
      id: m.id,
      question: m.question,
      answer: m.answer,
      category: m.category,
    })),
    message: `Found ${matches.length} matching entries.`,
  };
}

// ─── Factory Function ─────────────────────────────────────────────────────────

/**
 * Creates a tool handler map bound to a specific businessId.
 * The agent tools receive businessId in their input, but for the support agent
 * we pre-bind it so the agent doesn't need to know the user's business ID.
 */
export function createSupportToolHandlers(businessId: number): Record<string, (input: any) => Promise<any>> {
  // Wrap each handler to inject businessId if not already present
  const wrapWithBusinessId = (handler: (input: any) => Promise<any>) => {
    return (input: any) => handler({ ...input, businessId: input.businessId || businessId });
  };

  return {
    lookupBusiness: wrapWithBusinessId(lookupBusiness),
    checkSetupStatus: wrapWithBusinessId(checkSetupStatus),
    checkProvisioningStatus: wrapWithBusinessId(checkProvisioningStatus),
    getSubscriptionInfo: wrapWithBusinessId(getSubscriptionInfo),
    setBusinessHours: wrapWithBusinessId(setBusinessHours),
    addService: wrapWithBusinessId(addService),
    addStaffMember: wrapWithBusinessId(addStaffMember),
    addKnowledgeEntry: wrapWithBusinessId(addKnowledgeEntry),
    toggleSetting: wrapWithBusinessId(toggleSetting),
    getBookingLink: wrapWithBusinessId(getBookingLink),
    searchKnowledge: wrapWithBusinessId(searchKnowledge),
  };
}
