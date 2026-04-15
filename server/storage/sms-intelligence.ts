import {
  SmsBusinessProfile, InsertSmsBusinessProfile, smsBusinessProfiles,
  OutboundMessage, InsertOutboundMessage, outboundMessages,
  InboundMessage, InsertInboundMessage, inboundMessages,
  ConversationState, InsertConversationState, conversationStates,
  MarketingTrigger, InsertMarketingTrigger, marketingTriggers,
  SmsCampaign, InsertSmsCampaign, smsCampaigns,
  CampaignAnalyticsRow, InsertCampaignAnalytics, campaignAnalytics,
  SmsActivityFeedEntry, InsertSmsActivityFeed, smsActivityFeed,
} from "@shared/schema";
import { eq, and, desc, lte } from "drizzle-orm";
import { db } from "../db";

// =================== SMS Business Profile ===================

export async function getSmsBusinessProfile(businessId: number): Promise<SmsBusinessProfile | null> {
  const [profile] = await db.select().from(smsBusinessProfiles).where(eq(smsBusinessProfiles.businessId, businessId));
  return profile || null;
}

export async function upsertSmsBusinessProfile(businessId: number, data: Partial<InsertSmsBusinessProfile>): Promise<SmsBusinessProfile> {
  const existing = await getSmsBusinessProfile(businessId);
  if (existing) {
    const [updated] = await db.update(smsBusinessProfiles).set({ ...data, updatedAt: new Date() }).where(eq(smsBusinessProfiles.businessId, businessId)).returning();
    return updated;
  }
  const [created] = await db.insert(smsBusinessProfiles).values({ ...data, businessId } as InsertSmsBusinessProfile).returning();
  return created;
}

// =================== Outbound Messages ===================

export async function createOutboundMessage(data: InsertOutboundMessage): Promise<OutboundMessage> {
  const [msg] = await db.insert(outboundMessages).values(data).returning();
  return msg;
}

export async function getOutboundMessages(businessId: number, params?: { messageType?: string; limit?: number; offset?: number }): Promise<OutboundMessage[]> {
  const conditions = [eq(outboundMessages.businessId, businessId)];
  if (params?.messageType) conditions.push(eq(outboundMessages.messageType, params.messageType));
  return db.select().from(outboundMessages).where(and(...conditions)).orderBy(desc(outboundMessages.createdAt)).limit(params?.limit || 50).offset(params?.offset || 0);
}

// =================== Inbound Messages ===================

export async function createInboundMessage(data: InsertInboundMessage): Promise<InboundMessage> {
  const [msg] = await db.insert(inboundMessages).values(data).returning();
  return msg;
}

export async function getInboundMessages(businessId: number, params?: { limit?: number; offset?: number }): Promise<InboundMessage[]> {
  return db.select().from(inboundMessages).where(eq(inboundMessages.businessId, businessId)).orderBy(desc(inboundMessages.createdAt)).limit(params?.limit || 50).offset(params?.offset || 0);
}

// =================== Conversation State ===================

export async function upsertConversationState(businessId: number, customerId: number, data: Partial<ConversationState>): Promise<ConversationState> {
  const [existing] = await db.select().from(conversationStates).where(and(eq(conversationStates.businessId, businessId), eq(conversationStates.customerId, customerId)));
  if (existing) {
    const [updated] = await db.update(conversationStates).set({ ...data, updatedAt: new Date() }).where(eq(conversationStates.id, existing.id)).returning();
    return updated;
  }
  const [created] = await db.insert(conversationStates).values({ ...data, businessId, customerId } as InsertConversationState).returning();
  return created;
}

export async function getConversationState(businessId: number, customerId: number): Promise<ConversationState | null> {
  const [state] = await db.select().from(conversationStates).where(and(eq(conversationStates.businessId, businessId), eq(conversationStates.customerId, customerId)));
  return state || null;
}

// =================== Marketing Triggers ===================

export async function createMarketingTrigger(data: InsertMarketingTrigger): Promise<MarketingTrigger> {
  const [trigger] = await db.insert(marketingTriggers).values(data).returning();
  return trigger;
}

export async function getPendingMarketingTriggers(limit: number = 100): Promise<MarketingTrigger[]> {
  return db.select().from(marketingTriggers)
    .where(and(eq(marketingTriggers.status, 'pending'), lte(marketingTriggers.scheduledFor, new Date())))
    .orderBy(marketingTriggers.scheduledFor)
    .limit(limit);
}

export async function updateMarketingTrigger(id: number, data: Partial<MarketingTrigger>): Promise<MarketingTrigger> {
  const [updated] = await db.update(marketingTriggers).set({ ...data, updatedAt: new Date() }).where(eq(marketingTriggers.id, id)).returning();
  return updated;
}

export async function cancelTriggersForCustomer(businessId: number, customerId: number, reason: string): Promise<number> {
  const result = await db.update(marketingTriggers)
    .set({ status: 'cancelled', skipReason: reason, updatedAt: new Date() })
    .where(and(eq(marketingTriggers.businessId, businessId), eq(marketingTriggers.customerId, customerId), eq(marketingTriggers.status, 'pending')))
    .returning();
  return result.length;
}

export async function cancelTriggersForCampaign(campaignId: number, reason: string): Promise<number> {
  const result = await db.update(marketingTriggers)
    .set({ status: 'cancelled', skipReason: reason, updatedAt: new Date() })
    .where(and(eq(marketingTriggers.campaignId, campaignId), eq(marketingTriggers.status, 'pending')))
    .returning();
  return result.length;
}

// =================== SMS Campaigns ===================

export async function createSmsCampaign(data: InsertSmsCampaign): Promise<SmsCampaign> {
  const [campaign] = await db.insert(smsCampaigns).values(data).returning();
  return campaign;
}

export async function getSmsCampaigns(businessId: number, params?: { status?: string; limit?: number }): Promise<SmsCampaign[]> {
  const conditions = [eq(smsCampaigns.businessId, businessId)];
  if (params?.status) conditions.push(eq(smsCampaigns.status, params.status));
  return db.select().from(smsCampaigns).where(and(...conditions)).orderBy(desc(smsCampaigns.createdAt)).limit(params?.limit || 50);
}

export async function getSmsCampaign(id: number, businessId: number): Promise<SmsCampaign | null> {
  const [campaign] = await db.select().from(smsCampaigns).where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.businessId, businessId)));
  return campaign || null;
}

export async function updateSmsCampaign(id: number, data: Partial<SmsCampaign>): Promise<SmsCampaign> {
  const [updated] = await db.update(smsCampaigns).set({ ...data, updatedAt: new Date() }).where(eq(smsCampaigns.id, id)).returning();
  return updated;
}

// =================== Campaign Analytics ===================

export async function upsertCampaignAnalytics(campaignId: number, businessId: number, data: Partial<CampaignAnalyticsRow>): Promise<CampaignAnalyticsRow> {
  const [existing] = await db.select().from(campaignAnalytics).where(eq(campaignAnalytics.campaignId, campaignId));
  if (existing) {
    const [updated] = await db.update(campaignAnalytics).set({ ...data, updatedAt: new Date() }).where(eq(campaignAnalytics.campaignId, campaignId)).returning();
    return updated;
  }
  const [created] = await db.insert(campaignAnalytics).values({ ...data, campaignId, businessId } as InsertCampaignAnalytics).returning();
  return created;
}

export async function getCampaignAnalytics(campaignId: number): Promise<CampaignAnalyticsRow | null> {
  const [row] = await db.select().from(campaignAnalytics).where(eq(campaignAnalytics.campaignId, campaignId));
  return row || null;
}

// =================== SMS Activity Feed ===================

export async function createSmsActivityFeedEntry(data: InsertSmsActivityFeed): Promise<SmsActivityFeedEntry> {
  const [entry] = await db.insert(smsActivityFeed).values(data).returning();
  return entry;
}

export async function getSmsActivityFeed(businessId: number, params?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<SmsActivityFeedEntry[]> {
  const conditions = [eq(smsActivityFeed.businessId, businessId)];
  if (params?.unreadOnly) conditions.push(eq(smsActivityFeed.readByOwner, false));
  return db.select().from(smsActivityFeed).where(and(...conditions)).orderBy(desc(smsActivityFeed.createdAt)).limit(params?.limit || 50).offset(params?.offset || 0);
}

export async function markSmsActivityFeedRead(businessId: number): Promise<void> {
  await db.update(smsActivityFeed).set({ readByOwner: true }).where(and(eq(smsActivityFeed.businessId, businessId), eq(smsActivityFeed.readByOwner, false)));
}
