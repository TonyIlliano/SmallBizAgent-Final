import {
  CallLog, InsertCallLog, callLogs,
  CallIntelligence, InsertCallIntelligence, callIntelligence,
  CustomerEngagementLock, InsertCustomerEngagementLock, customerEngagementLock,
  SmsConversation, InsertSmsConversation, smsConversations,
  AgentActivityLog, InsertAgentActivityLog, agentActivityLog,
  AgentSettings, InsertAgentSettings, agentSettings,
  NotificationSettings, InsertNotificationSettings, notificationSettings,
  NotificationLog, InsertNotificationLog, notificationLog,
  ReviewResponse, InsertReviewResponse, reviewResponses,
} from "@shared/schema";
import { eq, and, or, desc, gte, lte, inArray, isNull, sql } from "drizzle-orm";
import { db, pool } from "../db";

// =================== Call Logs ===================

export async function getCallLogs(businessId: number, params?: {
  startDate?: Date,
  endDate?: Date,
  isEmergency?: boolean,
  status?: string
}): Promise<CallLog[]> {
  const conditions = [eq(callLogs.businessId, businessId)];

  if (params?.startDate) {
    conditions.push(gte(callLogs.callTime, params.startDate));
  }

  if (params?.endDate) {
    conditions.push(lte(callLogs.callTime, params.endDate));
  }

  if (params?.status) {
    conditions.push(eq(callLogs.status, params.status));
  }

  if (params?.isEmergency !== undefined) {
    conditions.push(eq(callLogs.isEmergency, params.isEmergency));
  }

  return db.select().from(callLogs).where(and(...conditions)).orderBy(desc(callLogs.callTime));
}

export async function getCallLog(id: number): Promise<CallLog | undefined> {
  const [log] = await db.select().from(callLogs).where(eq(callLogs.id, id));
  return log;
}

export async function createCallLog(log: InsertCallLog): Promise<CallLog> {
  const [newLog] = await db.insert(callLogs).values(log).returning();
  return newLog;
}

export async function updateCallLog(id: number, log: Partial<CallLog>): Promise<CallLog> {
  const [updatedLog] = await db.update(callLogs)
    .set(log)
    .where(eq(callLogs.id, id))
    .returning();
  return updatedLog;
}

// =================== Call Intelligence ===================

export async function getCallIntelligence(callLogId: number): Promise<CallIntelligence | undefined> {
  const [result] = await db.select().from(callIntelligence)
    .where(eq(callIntelligence.callLogId, callLogId));
  return result;
}

export async function getCallIntelligenceByCustomer(customerId: number, businessId: number, limit = 10): Promise<CallIntelligence[]> {
  return db.select().from(callIntelligence)
    .where(and(
      eq(callIntelligence.customerId, customerId),
      eq(callIntelligence.businessId, businessId)
    ))
    .orderBy(desc(callIntelligence.createdAt))
    .limit(limit);
}

export async function getCallIntelligenceByBusiness(businessId: number, params?: {
  startDate?: Date; endDate?: Date; intent?: string;
  followUpNeeded?: boolean; limit?: number;
}): Promise<CallIntelligence[]> {
  const conditions = [eq(callIntelligence.businessId, businessId)];
  if (params?.startDate) conditions.push(gte(callIntelligence.createdAt, params.startDate));
  if (params?.endDate) conditions.push(lte(callIntelligence.createdAt, params.endDate));
  if (params?.intent) conditions.push(eq(callIntelligence.intent, params.intent));
  if (params?.followUpNeeded !== undefined) conditions.push(eq(callIntelligence.followUpNeeded, params.followUpNeeded));

  return db.select().from(callIntelligence)
    .where(and(...conditions))
    .orderBy(desc(callIntelligence.createdAt))
    .limit(params?.limit ?? 100);
}

export async function createCallIntelligence(entry: InsertCallIntelligence): Promise<CallIntelligence> {
  const [result] = await db.insert(callIntelligence).values(entry).returning();
  return result;
}

export async function updateCallIntelligence(id: number, data: Partial<CallIntelligence>): Promise<CallIntelligence> {
  const [result] = await db.update(callIntelligence)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(callIntelligence.id, id))
    .returning();
  return result;
}

// =================== Customer Engagement Lock ===================

export async function acquireEngagementLock(
  businessId: number, customerId: number, customerPhone: string,
  agentType: string, durationMinutes: number
): Promise<{ acquired: boolean; existingLock?: CustomerEngagementLock }> {
  // Use raw SQL with SELECT ... FOR UPDATE to prevent race conditions.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT * FROM customer_engagement_lock
       WHERE customer_id = $1 AND business_id = $2 AND status = 'active' AND expires_at > NOW()
       FOR UPDATE`,
      [customerId, businessId]
    );

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return { acquired: false, existingLock: existing.rows[0] };
    }

    // Expire any stale locks
    await client.query(
      `UPDATE customer_engagement_lock SET status = 'expired'
       WHERE customer_id = $1 AND business_id = $2 AND status = 'active' AND expires_at <= NOW()`,
      [customerId, businessId]
    );

    // No active lock exists — safe to insert
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    await client.query(
      `INSERT INTO customer_engagement_lock (customer_id, business_id, customer_phone, locked_by_agent, locked_at, expires_at, status)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'active')`,
      [customerId, businessId, customerPhone || '', agentType, expiresAt]
    );

    await client.query('COMMIT');
    return { acquired: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[EngagementLock] Error acquiring lock:', err);
    return { acquired: false };
  } finally {
    client.release();
  }
}

export async function releaseEngagementLock(customerId: number, businessId: number): Promise<void> {
  await db.update(customerEngagementLock)
    .set({ status: 'released' })
    .where(and(
      eq(customerEngagementLock.customerId, customerId),
      eq(customerEngagementLock.businessId, businessId),
      eq(customerEngagementLock.status, 'active'),
    ));
}

export async function getEngagementLock(customerId: number, businessId: number): Promise<CustomerEngagementLock | undefined> {
  const [result] = await db.select().from(customerEngagementLock)
    .where(and(
      eq(customerEngagementLock.customerId, customerId),
      eq(customerEngagementLock.businessId, businessId),
      eq(customerEngagementLock.status, 'active'),
      gte(customerEngagementLock.expiresAt, new Date()),
    ));
  return result;
}

export async function releaseExpiredEngagementLocks(): Promise<number> {
  const result = await db.update(customerEngagementLock)
    .set({ status: 'expired' })
    .where(and(
      eq(customerEngagementLock.status, 'active'),
      lte(customerEngagementLock.expiresAt, new Date()),
    ))
    .returning();
  return result.length;
}

// =================== SMS Conversations ===================

export async function createSmsConversation(conv: InsertSmsConversation): Promise<SmsConversation> {
  const [created] = await db.insert(smsConversations).values(conv).returning();
  return created;
}

export async function getActiveSmsConversation(customerPhone: string, businessId: number): Promise<SmsConversation | undefined> {
  // Normalize phone for matching
  const digits = customerPhone.replace(/\D/g, '').slice(-10);
  const activeStates = ['awaiting_reply', 'collecting_preferences', 'offering_slots', 'confirming_booking', 'disambiguating', 'reschedule_awaiting', 'opt_in_awaiting', 'birthday_awaiting'];
  const results = await db.select().from(smsConversations)
    .where(and(
      eq(smsConversations.businessId, businessId),
      inArray(smsConversations.state, activeStates)
    ))
    .orderBy(desc(smsConversations.createdAt));
  // Match by normalized phone
  return results.find(c => c.customerPhone.replace(/\D/g, '').slice(-10) === digits);
}

export async function getSmsConversationsByBusiness(businessId: number, params?: { agentType?: string; state?: string; limit?: number }): Promise<SmsConversation[]> {
  const conditions = [eq(smsConversations.businessId, businessId)];
  if (params?.agentType) conditions.push(eq(smsConversations.agentType, params.agentType));
  if (params?.state) conditions.push(eq(smsConversations.state, params.state));
  return db.select().from(smsConversations)
    .where(and(...conditions))
    .orderBy(desc(smsConversations.createdAt))
    .limit(params?.limit ?? 50);
}

export async function updateSmsConversation(id: number, data: Partial<SmsConversation>): Promise<SmsConversation> {
  const [updated] = await db.update(smsConversations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(smsConversations.id, id))
    .returning();
  return updated;
}

export async function getExpiredConversations(): Promise<SmsConversation[]> {
  const activeStates = ['awaiting_reply', 'collecting_preferences', 'offering_slots', 'confirming_booking', 'disambiguating', 'reschedule_awaiting', 'opt_in_awaiting', 'birthday_awaiting'];
  return db.select().from(smsConversations)
    .where(and(
      inArray(smsConversations.state, activeStates),
      lte(smsConversations.expiresAt, new Date())
    ))
    .limit(1000);
}

// =================== Agent Activity Log ===================

export async function createAgentActivityLog(entry: InsertAgentActivityLog): Promise<AgentActivityLog> {
  const [created] = await db.insert(agentActivityLog).values(entry).returning();
  return created;
}

export async function getAgentActivityLogs(businessId: number, params?: { agentType?: string; limit?: number }): Promise<AgentActivityLog[]> {
  const conditions = [eq(agentActivityLog.businessId, businessId)];
  if (params?.agentType) {
    conditions.push(eq(agentActivityLog.agentType, params.agentType));
  }
  return db.select().from(agentActivityLog)
    .where(and(...conditions))
    .orderBy(desc(agentActivityLog.createdAt))
    .limit(params?.limit ?? 50);
}

// =================== Agent Settings ===================

export async function getAgentSettings(businessId: number, agentType: string): Promise<AgentSettings | undefined> {
  const [settings] = await db.select().from(agentSettings)
    .where(and(eq(agentSettings.businessId, businessId), eq(agentSettings.agentType, agentType)));
  return settings;
}

export async function getAllAgentSettings(businessId: number): Promise<AgentSettings[]> {
  return db.select().from(agentSettings)
    .where(eq(agentSettings.businessId, businessId))
    .limit(50);
}

export async function upsertAgentSettings(businessId: number, agentType: string, enabled: boolean, config: any): Promise<AgentSettings> {
  const existing = await getAgentSettings(businessId, agentType);
  if (existing) {
    const [updated] = await db.update(agentSettings)
      .set({ enabled, config, updatedAt: new Date() })
      .where(eq(agentSettings.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(agentSettings)
    .values({ businessId, agentType, enabled, config })
    .returning();
  return created;
}

// =================== Notification Settings ===================

export async function getNotificationSettings(businessId: number): Promise<NotificationSettings | undefined> {
  const [settings] = await db.select().from(notificationSettings)
    .where(eq(notificationSettings.businessId, businessId));
  return settings;
}

export async function upsertNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings> {
  const existing = await getNotificationSettings(settings.businessId);
  if (existing) {
    const [updated] = await db.update(notificationSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(notificationSettings.businessId, settings.businessId))
      .returning();
    return updated;
  }
  const [created] = await db.insert(notificationSettings).values(settings).returning();
  return created;
}

// =================== Notification Log ===================

export async function createNotificationLog(entry: InsertNotificationLog): Promise<NotificationLog> {
  const [log] = await db.insert(notificationLog).values(entry).returning();
  return log;
}

export async function getNotificationLogs(businessId: number, limit: number = 50): Promise<NotificationLog[]> {
  return db.select().from(notificationLog)
    .where(eq(notificationLog.businessId, businessId))
    .orderBy(desc(notificationLog.sentAt))
    .limit(limit);
}

export async function hasNotificationLogByType(businessId: number, type: string, status: string = 'sent'): Promise<boolean> {
  const [row] = await db.select({ id: notificationLog.id }).from(notificationLog)
    .where(and(
      eq(notificationLog.businessId, businessId),
      eq(notificationLog.type, type),
      eq(notificationLog.status, status),
    ))
    .limit(1);
  return !!row;
}

export async function getAllPlatformNotificationLogs(limit: number = 100): Promise<NotificationLog[]> {
  return db.select().from(notificationLog)
    .where(isNull(notificationLog.customerId))
    .orderBy(desc(notificationLog.sentAt))
    .limit(limit);
}

// =================== Review Responses ===================

export async function createReviewResponse(entry: InsertReviewResponse): Promise<ReviewResponse> {
  const [created] = await db.insert(reviewResponses).values(entry).returning();
  return created;
}

export async function getReviewResponseById(id: number): Promise<ReviewResponse | undefined> {
  const [result] = await db.select().from(reviewResponses).where(eq(reviewResponses.id, id)).limit(1);
  return result;
}

export async function getReviewResponses(businessId: number, params?: { status?: string }): Promise<ReviewResponse[]> {
  const conditions = [eq(reviewResponses.businessId, businessId)];
  if (params?.status) {
    conditions.push(eq(reviewResponses.status, params.status));
  }
  return db.select().from(reviewResponses)
    .where(and(...conditions))
    .orderBy(desc(reviewResponses.createdAt))
    .limit(200);
}

export async function updateReviewResponse(id: number, data: Partial<ReviewResponse>): Promise<ReviewResponse> {
  const [updated] = await db.update(reviewResponses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(reviewResponses.id, id))
    .returning();
  return updated;
}
