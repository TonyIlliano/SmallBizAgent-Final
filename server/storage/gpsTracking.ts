/**
 * GPS Live Dispatch storage layer.
 *
 * All queries are businessId-scoped at the SQL level (defense-in-depth — never
 * trust a session's businessId without re-filtering in WHERE clauses). Pings
 * are append-only; sessions follow active→paused→ended; share links are
 * soft-revoked + retention-swept.
 *
 * Wired into IStorage via server/storage/index.ts.
 */

import {
  TechLocationPing, InsertTechLocationPing, techLocationPings,
  TechTrackingSession, InsertTechTrackingSession, techTrackingSessions,
  CustomerTrackingLink, InsertCustomerTrackingLink, customerTrackingLinks,
} from "@shared/schema";
import { and, eq, desc, gte, lte, sql, isNull } from "drizzle-orm";
import { db } from "../db";

// ═══════════════════════════════════════════════════════════════════════════
// Session lifecycle
// ═══════════════════════════════════════════════════════════════════════════

export async function createTrackingSession(
  data: InsertTechTrackingSession
): Promise<TechTrackingSession> {
  const [session] = await db.insert(techTrackingSessions).values(data).returning();
  return session;
}

export async function getActiveSessionByStaff(
  staffId: number,
  businessId: number
): Promise<TechTrackingSession | undefined> {
  const [session] = await db.select().from(techTrackingSessions)
    .where(and(
      eq(techTrackingSessions.staffId, staffId),
      eq(techTrackingSessions.businessId, businessId),
      eq(techTrackingSessions.status, 'active'),
    ))
    .limit(1);
  return session;
}

export async function getTrackingSession(
  sessionId: number,
  businessId: number
): Promise<TechTrackingSession | undefined> {
  const [session] = await db.select().from(techTrackingSessions)
    .where(and(
      eq(techTrackingSessions.id, sessionId),
      eq(techTrackingSessions.businessId, businessId),
    ))
    .limit(1);
  return session;
}

export async function getActiveSessionsByBusiness(
  businessId: number
): Promise<TechTrackingSession[]> {
  return await db.select().from(techTrackingSessions)
    .where(and(
      eq(techTrackingSessions.businessId, businessId),
      eq(techTrackingSessions.status, 'active'),
    ))
    .orderBy(desc(techTrackingSessions.lastPingAt));
}

export async function endTrackingSession(
  sessionId: number,
  businessId: number,
  reason: string
): Promise<TechTrackingSession | undefined> {
  const [session] = await db.update(techTrackingSessions)
    .set({
      status: 'ended',
      endedAt: new Date(),
      endReason: reason,
    })
    .where(and(
      eq(techTrackingSessions.id, sessionId),
      eq(techTrackingSessions.businessId, businessId),
    ))
    .returning();
  return session;
}

export async function pauseTrackingSession(
  sessionId: number,
  businessId: number,
  paused: boolean
): Promise<TechTrackingSession | undefined> {
  const [session] = await db.update(techTrackingSessions)
    .set({ status: paused ? 'paused' : 'active' })
    .where(and(
      eq(techTrackingSessions.id, sessionId),
      eq(techTrackingSessions.businessId, businessId),
    ))
    .returning();
  return session;
}

export async function updateSessionPingMeta(
  sessionId: number,
  businessId: number,
  lastPingAt: Date,
  increment: number
): Promise<void> {
  await db.update(techTrackingSessions)
    .set({
      lastPingAt,
      pingCount: sql`${techTrackingSessions.pingCount} + ${increment}`,
    })
    .where(and(
      eq(techTrackingSessions.id, sessionId),
      eq(techTrackingSessions.businessId, businessId),
    ));
}

// ═══════════════════════════════════════════════════════════════════════════
// Ping ingestion
// ═══════════════════════════════════════════════════════════════════════════

export async function createLocationPings(
  businessId: number,
  pings: InsertTechLocationPing[]
): Promise<number> {
  if (pings.length === 0) return 0;
  // Defense-in-depth: stamp businessId on every row, ignoring any caller-supplied value
  const safe = pings.map(p => ({ ...p, businessId }));
  const inserted = await db.insert(techLocationPings).values(safe).returning({ id: techLocationPings.id });
  return inserted.length;
}

export async function getPingsForJob(
  jobId: number,
  businessId: number,
  opts?: { limit?: number; since?: Date }
): Promise<TechLocationPing[]> {
  const conditions = [
    eq(techLocationPings.jobId, jobId),
    eq(techLocationPings.businessId, businessId),
  ];
  if (opts?.since) conditions.push(gte(techLocationPings.recordedAt, opts.since));

  return await db.select().from(techLocationPings)
    .where(and(...conditions))
    .orderBy(techLocationPings.recordedAt)
    .limit(opts?.limit ?? 1000);
}

export async function getPingsForSession(
  sessionId: number,
  businessId: number,
  opts?: { limit?: number; since?: Date }
): Promise<TechLocationPing[]> {
  // Sessions don't directly own pings — we join via staff + time window.
  // Resolve the session first, then pull pings within its lifetime.
  const session = await getTrackingSession(sessionId, businessId);
  if (!session) return [];

  const start = session.startedAt;
  const end = session.endedAt ?? new Date();

  const conditions = [
    eq(techLocationPings.businessId, businessId),
    eq(techLocationPings.staffId, session.staffId),
    gte(techLocationPings.recordedAt, start),
    lte(techLocationPings.recordedAt, end),
  ];
  if (opts?.since) conditions.push(gte(techLocationPings.recordedAt, opts.since));

  return await db.select().from(techLocationPings)
    .where(and(...conditions))
    .orderBy(techLocationPings.recordedAt)
    .limit(opts?.limit ?? 1000);
}

export async function getLatestPingByStaff(
  staffId: number,
  businessId: number
): Promise<TechLocationPing | undefined> {
  const [ping] = await db.select().from(techLocationPings)
    .where(and(
      eq(techLocationPings.staffId, staffId),
      eq(techLocationPings.businessId, businessId),
    ))
    .orderBy(desc(techLocationPings.recordedAt))
    .limit(1);
  return ping;
}

// ═══════════════════════════════════════════════════════════════════════════
// Customer share links
// ═══════════════════════════════════════════════════════════════════════════

export async function createTrackingLink(
  data: InsertCustomerTrackingLink
): Promise<CustomerTrackingLink> {
  const [link] = await db.insert(customerTrackingLinks).values(data).returning();
  return link;
}

export async function getTrackingLinkByToken(
  token: string
): Promise<CustomerTrackingLink | undefined> {
  const [link] = await db.select().from(customerTrackingLinks)
    .where(eq(customerTrackingLinks.token, token))
    .limit(1);
  return link;
}

export async function incrementTrackingLinkViews(linkId: number): Promise<void> {
  await db.update(customerTrackingLinks)
    .set({
      viewCount: sql`${customerTrackingLinks.viewCount} + 1`,
      lastViewedAt: new Date(),
    })
    .where(eq(customerTrackingLinks.id, linkId));
}

export async function revokeTrackingLink(
  linkId: number,
  businessId: number
): Promise<void> {
  await db.update(customerTrackingLinks)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(customerTrackingLinks.id, linkId),
      eq(customerTrackingLinks.businessId, businessId),
    ));
}

export async function getActiveTrackingLinksForJob(
  jobId: number,
  businessId: number
): Promise<CustomerTrackingLink[]> {
  const now = new Date();
  return await db.select().from(customerTrackingLinks)
    .where(and(
      eq(customerTrackingLinks.jobId, jobId),
      eq(customerTrackingLinks.businessId, businessId),
      isNull(customerTrackingLinks.revokedAt),
      gte(customerTrackingLinks.expiresAt, now),
    ))
    .orderBy(desc(customerTrackingLinks.createdAt));
}

// ═══════════════════════════════════════════════════════════════════════════
// Retention sweeper (called by scheduler in a future PR)
// ═══════════════════════════════════════════════════════════════════════════

export async function deleteExpiredPings(
  businessId: number,
  cutoff: Date
): Promise<number> {
  const deleted = await db.delete(techLocationPings)
    .where(and(
      eq(techLocationPings.businessId, businessId),
      lte(techLocationPings.receivedAt, cutoff),
    ))
    .returning({ id: techLocationPings.id });
  return deleted.length;
}

/**
 * Global cleanup of revoked or expired share links. Not businessId-scoped
 * because this is a hygiene sweep — multi-tenant safe by definition (only
 * deletes rows that are already inert: revoked or past expiry).
 */
export async function deleteExpiredLinks(): Promise<number> {
  const now = new Date();
  const deleted = await db.delete(customerTrackingLinks)
    .where(sql`(revoked_at IS NOT NULL AND revoked_at < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)})
               OR expires_at < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}`)
    .returning({ id: customerTrackingLinks.id });
  return deleted.length;
}
