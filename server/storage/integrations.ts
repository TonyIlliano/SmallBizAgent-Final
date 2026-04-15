import {
  Website, InsertWebsite, websites,
  RestaurantReservation, InsertRestaurantReservation, restaurantReservations,
  BusinessPhoneNumber, InsertBusinessPhoneNumber, businessPhoneNumbers,
  BusinessGroup, InsertBusinessGroup, businessGroups,
  UserBusinessAccess, InsertUserBusinessAccess, userBusinessAccess,
  GbpReview, InsertGbpReview, gbpReviews,
  GbpPost, InsertGbpPost, gbpPosts,
  businesses, users,
} from "@shared/schema";
import { eq, and, or, desc, gte, lte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { decryptBusinessFields } from "./business";

// =================== Websites (one-page sites) ===================

export async function getWebsite(businessId: number): Promise<Website | undefined> {
  const [website] = await db.select().from(websites)
    .where(eq(websites.businessId, businessId));
  return website;
}

export async function getWebsiteBySubdomain(subdomain: string): Promise<Website | undefined> {
  const [website] = await db.select().from(websites)
    .where(eq(websites.subdomain, subdomain));
  return website;
}

export async function getWebsiteByCustomDomain(domain: string): Promise<Website | undefined> {
  const [website] = await db.select().from(websites)
    .where(and(
      eq(websites.customDomain, domain),
      eq(websites.domainVerified, true)
    ));
  return website;
}

export async function upsertWebsite(businessId: number, data: Partial<InsertWebsite>): Promise<Website> {
  const existing = await getWebsite(businessId);
  if (existing) {
    const [updated] = await db.update(websites)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(websites.businessId, businessId))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(websites)
      .values({ businessId, ...data })
      .returning();
    return created;
  }
}

// =================== Restaurant Reservations ===================

export async function getRestaurantReservations(businessId: number, params?: {
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  customerId?: number;
}): Promise<RestaurantReservation[]> {
  const conditions = [eq(restaurantReservations.businessId, businessId)];

  if (params?.date) {
    conditions.push(eq(restaurantReservations.reservationDate, params.date));
  }
  if (params?.startDate) {
    conditions.push(gte(restaurantReservations.reservationDate, params.startDate));
  }
  if (params?.endDate) {
    conditions.push(lte(restaurantReservations.reservationDate, params.endDate));
  }
  if (params?.status) {
    conditions.push(eq(restaurantReservations.status, params.status));
  }
  if (params?.customerId) {
    conditions.push(eq(restaurantReservations.customerId, params.customerId));
  }

  return db.select().from(restaurantReservations)
    .where(and(...conditions))
    .orderBy(restaurantReservations.reservationDate, restaurantReservations.reservationTime)
    .limit(500);
}

export async function getRestaurantReservation(id: number): Promise<RestaurantReservation | undefined> {
  const [reservation] = await db.select().from(restaurantReservations)
    .where(eq(restaurantReservations.id, id));
  return reservation;
}

export async function getRestaurantReservationByManageToken(token: string): Promise<RestaurantReservation | undefined> {
  const [reservation] = await db.select().from(restaurantReservations)
    .where(eq(restaurantReservations.manageToken, token));
  return reservation;
}

export async function createRestaurantReservation(data: InsertRestaurantReservation): Promise<RestaurantReservation> {
  const [reservation] = await db.insert(restaurantReservations)
    .values(data)
    .returning();
  return reservation;
}

export async function updateRestaurantReservation(id: number, data: Partial<RestaurantReservation>): Promise<RestaurantReservation> {
  const [reservation] = await db.update(restaurantReservations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(restaurantReservations.id, id))
    .returning();
  return reservation;
}

export async function getReservationSlotCapacity(businessId: number, date: string, time: string, slotDurationMinutes: number): Promise<{
  totalCapacity: number;
  bookedSeats: number;
  remainingSeats: number;
}> {
  // Get the business to read max capacity
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  const totalCapacity = business?.reservationMaxCapacityPerSlot || 40;

  // Parse the requested slot start/end times
  const slotStart = new Date(`${date}T${time}:00`);
  const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60 * 1000);

  // Get all non-cancelled reservations for this date
  const dayReservations = await db.select().from(restaurantReservations)
    .where(and(
      eq(restaurantReservations.businessId, businessId),
      eq(restaurantReservations.reservationDate, date),
      sql`${restaurantReservations.status} NOT IN ('cancelled', 'no_show')`
    ));

  // Sum party sizes of overlapping reservations
  let bookedSeats = 0;
  for (const res of dayReservations) {
    const resStart = new Date(res.startDate);
    const resEnd = new Date(res.endDate);

    // Check overlap: two intervals overlap if one starts before the other ends AND vice versa
    if (resStart < slotEnd && resEnd > slotStart) {
      bookedSeats += res.partySize;
    }
  }

  return {
    totalCapacity,
    bookedSeats,
    remainingSeats: Math.max(0, totalCapacity - bookedSeats),
  };
}

// =================== Business Phone Numbers ===================

export async function getPhoneNumbersByBusiness(businessId: number): Promise<BusinessPhoneNumber[]> {
  return db.select().from(businessPhoneNumbers)
    .where(eq(businessPhoneNumbers.businessId, businessId))
    .orderBy(desc(businessPhoneNumbers.createdAt));
}

export async function getPhoneNumber(id: number): Promise<BusinessPhoneNumber | undefined> {
  const [phoneNumber] = await db.select().from(businessPhoneNumbers)
    .where(eq(businessPhoneNumbers.id, id));
  return phoneNumber;
}

export async function createPhoneNumber(data: InsertBusinessPhoneNumber): Promise<BusinessPhoneNumber> {
  const [created] = await db.insert(businessPhoneNumbers).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function updatePhoneNumber(id: number, data: Partial<BusinessPhoneNumber>): Promise<BusinessPhoneNumber> {
  const [updated] = await db.update(businessPhoneNumbers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(businessPhoneNumbers.id, id))
    .returning();
  return updated;
}

export async function deletePhoneNumber(id: number, businessId: number): Promise<void> {
  await db.delete(businessPhoneNumbers).where(and(eq(businessPhoneNumbers.id, id), eq(businessPhoneNumbers.businessId, businessId)));
}

export async function getPhoneNumberByTwilioNumber(phoneNumber: string): Promise<BusinessPhoneNumber | undefined> {
  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  const phoneVariants = [
    phoneNumber,
    normalizedPhone,
    `+${normalizedPhone}`,
    `+1${normalizedPhone}`,
    normalizedPhone.slice(-10)
  ];

  const [record] = await db.select().from(businessPhoneNumbers)
    .where(
      or(
        ...phoneVariants.map(p => eq(businessPhoneNumbers.twilioPhoneNumber, p))
      )
    );
  return record;
}

// =================== Business Groups ===================

export async function getBusinessGroup(id: number): Promise<BusinessGroup | undefined> {
  const [group] = await db.select().from(businessGroups)
    .where(eq(businessGroups.id, id));
  return group;
}

export async function createBusinessGroup(data: InsertBusinessGroup): Promise<BusinessGroup> {
  const [created] = await db.insert(businessGroups).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function updateBusinessGroup(id: number, data: Partial<BusinessGroup>): Promise<BusinessGroup> {
  const [updated] = await db.update(businessGroups)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(businessGroups.id, id))
    .returning();
  return updated;
}

export async function getBusinessesByGroup(groupId: number): Promise<any[]> {
  const results = await db.select().from(businesses)
    .where(eq(businesses.businessGroupId, groupId))
    .limit(100);
  return results.map(b => decryptBusinessFields(b));
}

// =================== User Business Access ===================

export async function getUserBusinesses(userId: number): Promise<UserBusinessAccess[]> {
  return db.select().from(userBusinessAccess)
    .where(eq(userBusinessAccess.userId, userId))
    .limit(50);
}

export async function addUserBusinessAccess(data: InsertUserBusinessAccess): Promise<UserBusinessAccess> {
  const [created] = await db.insert(userBusinessAccess).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return created;
}

export async function removeUserBusinessAccess(userId: number, businessId: number): Promise<void> {
  await db.delete(userBusinessAccess)
    .where(and(
      eq(userBusinessAccess.userId, userId),
      eq(userBusinessAccess.businessId, businessId)
    ));
}

export async function hasBusinessAccess(userId: number, businessId: number): Promise<boolean> {
  const [record] = await db.select().from(userBusinessAccess)
    .where(and(
      eq(userBusinessAccess.userId, userId),
      eq(userBusinessAccess.businessId, businessId)
    ));
  return !!record;
}

// =================== Team Management ===================

export async function getTeamMembers(businessId: number): Promise<any[]> {
  // Get team members from user_business_access (managers, staff with access)
  const accessMembers = await db.select({
    userId: users.id,
    username: users.username,
    email: users.email,
    role: users.role,
    accessRole: userBusinessAccess.role,
    lastLoginAt: users.lastLogin,
    createdAt: users.createdAt,
  })
    .from(userBusinessAccess)
    .innerJoin(users, eq(userBusinessAccess.userId, users.id))
    .where(eq(userBusinessAccess.businessId, businessId));

  // Also include the business owner (user where businessId matches and role is 'user')
  const ownerMembers = await db.select({
    userId: users.id,
    username: users.username,
    email: users.email,
    role: users.role,
    lastLoginAt: users.lastLogin,
    createdAt: users.createdAt,
  })
    .from(users)
    .where(and(
      eq(users.businessId, businessId),
      eq(users.role, 'user')
    ));

  // Combine: owner gets accessRole 'owner', access members keep their accessRole
  const ownerResults = ownerMembers.map(o => ({
    ...o,
    accessRole: 'owner',
  }));

  // Deduplicate by userId (owner might also be in user_business_access)
  const seen = new Set<number>();
  const combined: any[] = [];
  for (const member of ownerResults) {
    if (!seen.has(member.userId)) {
      seen.add(member.userId);
      combined.push(member);
    }
  }
  for (const member of accessMembers) {
    if (!seen.has(member.userId)) {
      seen.add(member.userId);
      combined.push(member);
    }
  }

  return combined;
}

export async function updateTeamMemberRole(userId: number, businessId: number, role: string): Promise<void> {
  await db.update(userBusinessAccess)
    .set({ role })
    .where(and(
      eq(userBusinessAccess.userId, userId),
      eq(userBusinessAccess.businessId, businessId)
    ));
}

export async function removeTeamMember(userId: number, businessId: number): Promise<void> {
  await db.delete(userBusinessAccess)
    .where(and(
      eq(userBusinessAccess.userId, userId),
      eq(userBusinessAccess.businessId, businessId)
    ));
}

// =================== GBP Reviews ===================

export async function getGbpReviews(businessId: number, filters?: { flagged?: boolean; minRating?: number; maxRating?: number; hasReply?: boolean; limit?: number; offset?: number }): Promise<GbpReview[]> {
  const conditions = [eq(gbpReviews.businessId, businessId)];

  if (filters?.flagged !== undefined) {
    conditions.push(eq(gbpReviews.flagged, filters.flagged));
  }
  if (filters?.minRating !== undefined) {
    conditions.push(gte(gbpReviews.rating, filters.minRating));
  }
  if (filters?.maxRating !== undefined) {
    conditions.push(lte(gbpReviews.rating, filters.maxRating));
  }
  if (filters?.hasReply === true) {
    conditions.push(sql`${gbpReviews.replyText} IS NOT NULL`);
  } else if (filters?.hasReply === false) {
    conditions.push(isNull(gbpReviews.replyText));
  }

  let query = db.select().from(gbpReviews)
    .where(and(...conditions))
    .orderBy(desc(gbpReviews.reviewDate));

  if (filters?.limit) {
    query = query.limit(filters.limit) as typeof query;
  }
  if (filters?.offset) {
    query = query.offset(filters.offset) as typeof query;
  }

  return query;
}

export async function getGbpReviewByGbpId(gbpReviewId: string): Promise<GbpReview | undefined> {
  const [review] = await db.select().from(gbpReviews)
    .where(eq(gbpReviews.gbpReviewId, gbpReviewId));
  return review;
}

export async function getGbpReviewById(id: number): Promise<GbpReview | undefined> {
  const [review] = await db.select().from(gbpReviews)
    .where(eq(gbpReviews.id, id));
  return review;
}

export async function upsertGbpReview(data: InsertGbpReview): Promise<GbpReview> {
  const existing = await getGbpReviewByGbpId(data.gbpReviewId);
  if (existing) {
    const [updated] = await db.update(gbpReviews)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(gbpReviews.gbpReviewId, data.gbpReviewId))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(gbpReviews)
      .values(data)
      .returning();
    return created;
  }
}

export async function updateGbpReview(id: number, data: Partial<GbpReview>): Promise<GbpReview> {
  const [updated] = await db.update(gbpReviews)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(gbpReviews.id, id))
    .returning();
  return updated;
}

export async function countGbpReviews(businessId: number, filters?: { flagged?: boolean; hasReply?: boolean }): Promise<number> {
  const conditions = [eq(gbpReviews.businessId, businessId)];

  if (filters?.flagged !== undefined) {
    conditions.push(eq(gbpReviews.flagged, filters.flagged));
  }
  if (filters?.hasReply === true) {
    conditions.push(sql`${gbpReviews.replyText} IS NOT NULL`);
  } else if (filters?.hasReply === false) {
    conditions.push(isNull(gbpReviews.replyText));
  }

  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(gbpReviews)
    .where(and(...conditions));
  return result?.count ?? 0;
}

export async function getGbpReviewStats(businessId: number): Promise<{ total: number; avgRating: number; responseRate: number; flaggedCount: number }> {
  const [result] = await db.select({
    total: sql<number>`count(*)::int`,
    avgRating: sql<number>`coalesce(avg(${gbpReviews.rating})::numeric(3,1), 0)`,
    withReply: sql<number>`count(case when ${gbpReviews.replyText} is not null then 1 end)::int`,
    flaggedCount: sql<number>`count(case when ${gbpReviews.flagged} = true then 1 end)::int`,
  })
    .from(gbpReviews)
    .where(eq(gbpReviews.businessId, businessId));

  const total = result?.total ?? 0;
  return {
    total,
    avgRating: Math.round(Number(result?.avgRating ?? 0) * 10) / 10,
    responseRate: total > 0 ? Math.round(((result?.withReply ?? 0) / total) * 100) : 0,
    flaggedCount: result?.flaggedCount ?? 0,
  };
}

// =================== GBP Posts ===================

export async function getGbpPosts(businessId: number, filters?: { status?: string; limit?: number; offset?: number }): Promise<GbpPost[]> {
  const conditions = [eq(gbpPosts.businessId, businessId)];

  if (filters?.status) {
    conditions.push(eq(gbpPosts.status, filters.status));
  }

  let query = db.select().from(gbpPosts)
    .where(and(...conditions))
    .orderBy(desc(gbpPosts.createdAt));

  if (filters?.limit) {
    query = query.limit(filters.limit) as typeof query;
  }
  if (filters?.offset) {
    query = query.offset(filters.offset) as typeof query;
  }

  return query;
}

export async function createGbpPost(data: InsertGbpPost): Promise<GbpPost> {
  const [created] = await db.insert(gbpPosts)
    .values(data)
    .returning();
  return created;
}

export async function updateGbpPost(id: number, data: Partial<GbpPost>): Promise<GbpPost> {
  const [updated] = await db.update(gbpPosts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(gbpPosts.id, id))
    .returning();
  return updated;
}
