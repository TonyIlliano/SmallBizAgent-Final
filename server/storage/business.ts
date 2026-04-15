import {
  User, InsertUser, users,
  Business, InsertBusiness, businesses,
  BusinessHours, InsertBusinessHours, businessHours,
  Service, InsertService, services,
  ReceptionistConfig, InsertReceptionistConfig, receptionistConfig,
  PasswordResetToken, InsertPasswordResetToken, passwordResetTokens,
  BusinessKnowledge, InsertBusinessKnowledge, businessKnowledge,
  UnansweredQuestion, InsertUnansweredQuestion, unansweredQuestions,
  AiSuggestion, InsertAiSuggestion, aiSuggestions,
  CloverMenuCache, InsertCloverMenuCache, cloverMenuCache,
  CloverOrderLog, InsertCloverOrderLog, cloverOrderLog,
  SquareMenuCache, InsertSquareMenuCache, squareMenuCache,
  SquareOrderLog, InsertSquareOrderLog, squareOrderLog,
  HeartlandMenuCache, InsertHeartlandMenuCache, heartlandMenuCache,
  HeartlandOrderLog, InsertHeartlandOrderLog, heartlandOrderLog,
  WebsiteScrapeCache, InsertWebsiteScrapeCache, websiteScrapeCache,
  businessPhoneNumbers,
} from "@shared/schema";
import { eq, and, or, desc, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import { encryptField, decryptField } from "../utils/encryption";

// Fields in the businesses table that require encryption at rest
const BUSINESS_ENCRYPTED_FIELDS = [
  'quickbooksAccessToken',
  'quickbooksRefreshToken',
  'cloverAccessToken',
  'cloverRefreshToken',
  'squareAccessToken',
  'squareRefreshToken',
  'heartlandApiKey',
] as const;

// --- Encryption helpers for sensitive fields ---

export function decryptBusinessFields(business: Business): Business {
  const decrypted = { ...business };
  for (const field of BUSINESS_ENCRYPTED_FIELDS) {
    if (decrypted[field]) {
      (decrypted as any)[field] = decryptField(decrypted[field]);
    }
  }
  return decrypted;
}

export function encryptBusinessFields<T extends Partial<Business>>(data: T): T {
  const encrypted = { ...data };
  for (const field of BUSINESS_ENCRYPTED_FIELDS) {
    if (field in encrypted && (encrypted as any)[field] !== null && (encrypted as any)[field] !== undefined) {
      (encrypted as any)[field] = encryptField((encrypted as any)[field]);
    }
  }
  return encrypted;
}

function decryptUserFields(user: User): User {
  if (user.twoFactorSecret) {
    return { ...user, twoFactorSecret: decryptField(user.twoFactorSecret) };
  }
  return user;
}

// =================== Users ===================

export async function getUser(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ? decryptUserFields(user) : undefined;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
  return user ? decryptUserFields(user) : undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(ilike(users.email, email));
  return user ? decryptUserFields(user) : undefined;
}

export async function getBusinessOwner(businessId: number): Promise<User | undefined> {
  const [user] = await db.select().from(users)
    .where(and(eq(users.businessId, businessId), eq(users.role, 'user')))
    .limit(1);
  return user ? decryptUserFields(user) : undefined;
}

export async function createUser(user: InsertUser): Promise<User> {
  const [newUser] = await db.insert(users).values({
    ...user,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newUser;
}

export async function updateUser(id: number, user: Partial<User>): Promise<User> {
  const data = { ...user };
  // Encrypt 2FA secret before writing to DB
  if ('twoFactorSecret' in data && data.twoFactorSecret !== null && data.twoFactorSecret !== undefined) {
    data.twoFactorSecret = encryptField(data.twoFactorSecret);
  }
  const [updatedUser] = await db.update(users)
    .set({
      ...data,
      updatedAt: new Date()
    })
    .where(eq(users.id, id))
    .returning();
  return decryptUserFields(updatedUser);
}

export async function updateUserLastLogin(id: number): Promise<User> {
  const [updatedUser] = await db.update(users)
    .set({
      lastLogin: new Date(),
      updatedAt: new Date()
    })
    .where(eq(users.id, id))
    .returning();
  return updatedUser;
}

// =================== Business ===================

export async function getAllBusinesses(): Promise<Business[]> {
  const results = await db.select().from(businesses).limit(500);
  return results.map(b => decryptBusinessFields(b));
}

export async function getBusiness(id: number): Promise<Business | undefined> {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, id));
  return business ? decryptBusinessFields(business) : undefined;
}

export async function getBusinessByTwilioPhoneNumber(phoneNumber: string): Promise<Business | undefined> {
  // Normalize phone number format for comparison
  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  const phoneVariants = [
    phoneNumber,
    normalizedPhone,
    `+${normalizedPhone}`,
    `+1${normalizedPhone}`,
    normalizedPhone.slice(-10) // Last 10 digits
  ];

  // Search for business with any of the phone variants on the businesses table
  const [business] = await db.select().from(businesses)
    .where(
      or(
        ...phoneVariants.map(p => eq(businesses.twilioPhoneNumber, p))
      )
    );
  if (business) return decryptBusinessFields(business);

  // Fallback: search the business_phone_numbers table for additional numbers
  const [phoneRecord] = await db.select().from(businessPhoneNumbers)
    .where(
      and(
        or(
          ...phoneVariants.map(p => eq(businessPhoneNumbers.twilioPhoneNumber, p))
        ),
        eq(businessPhoneNumbers.status, 'active')
      )
    );
  if (phoneRecord) {
    return getBusiness(phoneRecord.businessId);
  }

  return undefined;
}

export async function getBusinessByBookingSlug(slug: string): Promise<Business | undefined> {
  const [business] = await db.select().from(businesses)
    .where(eq(businesses.bookingSlug, slug.toLowerCase()));
  return business ? decryptBusinessFields(business) : undefined;
}

export async function createBusiness(business: InsertBusiness): Promise<Business> {
  const encrypted = encryptBusinessFields(business);
  const [newBusiness] = await db.insert(businesses).values({
    ...encrypted,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return decryptBusinessFields(newBusiness);
}

export async function updateBusiness(id: number, business: Partial<Business>): Promise<Business> {
  const encrypted = encryptBusinessFields(business);
  const [updatedBusiness] = await db.update(businesses)
    .set({
      ...encrypted,
      updatedAt: new Date()
    })
    .where(eq(businesses.id, id))
    .returning();
  return decryptBusinessFields(updatedBusiness);
}

// =================== Business Hours ===================

export async function getBusinessHours(businessId: number): Promise<BusinessHours[]> {
  return db.select().from(businessHours)
    .where(eq(businessHours.businessId, businessId));
}

export async function createBusinessHours(hours: InsertBusinessHours): Promise<BusinessHours> {
  const [newHours] = await db.insert(businessHours).values(hours).returning();
  return newHours;
}

export async function updateBusinessHours(id: number, hours: Partial<BusinessHours>): Promise<BusinessHours> {
  const [updatedHours] = await db.update(businessHours)
    .set(hours)
    .where(eq(businessHours.id, id))
    .returning();
  return updatedHours;
}

// =================== Services ===================

export async function getServices(businessId: number): Promise<Service[]> {
  return db.select().from(services)
    .where(eq(services.businessId, businessId));
}

export async function getService(id: number): Promise<Service | undefined> {
  const [service] = await db.select().from(services).where(eq(services.id, id));
  return service;
}

export async function createService(service: InsertService): Promise<Service> {
  const [newService] = await db.insert(services).values(service).returning();
  return newService;
}

export async function updateService(id: number, service: Partial<Service>): Promise<Service> {
  const [updatedService] = await db.update(services)
    .set(service)
    .where(eq(services.id, id))
    .returning();
  return updatedService;
}

export async function deleteService(id: number, businessId: number): Promise<void> {
  await db.delete(services).where(and(eq(services.id, id), eq(services.businessId, businessId)));
}

// =================== Receptionist Config ===================

export async function getReceptionistConfig(businessId: number): Promise<ReceptionistConfig | undefined> {
  const [config] = await db.select().from(receptionistConfig)
    .where(eq(receptionistConfig.businessId, businessId));
  return config;
}

export async function createReceptionistConfig(config: InsertReceptionistConfig): Promise<ReceptionistConfig> {
  const [newConfig] = await db.insert(receptionistConfig).values({
    ...config,
    updatedAt: new Date()
  }).returning();
  return newConfig;
}

export async function updateReceptionistConfig(id: number, config: Partial<ReceptionistConfig>): Promise<ReceptionistConfig> {
  const [updatedConfig] = await db.update(receptionistConfig)
    .set({
      ...config,
      updatedAt: new Date()
    })
    .where(eq(receptionistConfig.id, id))
    .returning();
  return updatedConfig;
}

// =================== Password Reset Tokens ===================

export async function createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
  const [newToken] = await db.insert(passwordResetTokens).values({
    ...token,
    createdAt: new Date()
  }).returning();
  return newToken;
}

export async function getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
  const [resetToken] = await db.select().from(passwordResetTokens)
    .where(and(
      eq(passwordResetTokens.token, token),
      eq(passwordResetTokens.used, false)
    ));
  return resetToken;
}

export async function markPasswordResetTokenUsed(id: number): Promise<void> {
  await db.update(passwordResetTokens)
    .set({ used: true })
    .where(eq(passwordResetTokens.id, id));
}

export async function deleteExpiredPasswordResetTokens(): Promise<void> {
  await db.delete(passwordResetTokens)
    .where(sql`${passwordResetTokens.expiresAt} < NOW()`);
}

// =================== Business Knowledge (AI Knowledge Base) ===================

export async function getBusinessKnowledge(businessId: number, params?: { isApproved?: boolean; source?: string; category?: string }): Promise<BusinessKnowledge[]> {
  const conditions: any[] = [eq(businessKnowledge.businessId, businessId)];
  if (params?.isApproved !== undefined) {
    conditions.push(eq(businessKnowledge.isApproved, params.isApproved));
  }
  if (params?.source) {
    conditions.push(eq(businessKnowledge.source, params.source));
  }
  if (params?.category) {
    conditions.push(eq(businessKnowledge.category, params.category));
  }
  return db.select().from(businessKnowledge)
    .where(and(...conditions))
    .orderBy(desc(businessKnowledge.priority))
    .limit(200);
}

export async function getBusinessKnowledgeEntry(id: number): Promise<BusinessKnowledge | undefined> {
  const [entry] = await db.select().from(businessKnowledge)
    .where(eq(businessKnowledge.id, id));
  return entry;
}

export async function createBusinessKnowledge(entry: InsertBusinessKnowledge): Promise<BusinessKnowledge> {
  const [created] = await db.insert(businessKnowledge).values(entry).returning();
  return created;
}

export async function updateBusinessKnowledge(id: number, data: Partial<BusinessKnowledge>): Promise<BusinessKnowledge> {
  const [updated] = await db.update(businessKnowledge)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(businessKnowledge.id, id))
    .returning();
  return updated;
}

export async function deleteBusinessKnowledge(id: number, businessId: number): Promise<void> {
  await db.delete(businessKnowledge).where(and(eq(businessKnowledge.id, id), eq(businessKnowledge.businessId, businessId)));
}

export async function deleteBusinessKnowledgeBySource(businessId: number, source: string): Promise<void> {
  await db.delete(businessKnowledge)
    .where(and(
      eq(businessKnowledge.businessId, businessId),
      eq(businessKnowledge.source, source)
    ));
}

// =================== Unanswered Questions ===================

export async function getUnansweredQuestions(businessId: number, params?: { status?: string }): Promise<UnansweredQuestion[]> {
  const conditions: any[] = [eq(unansweredQuestions.businessId, businessId)];
  if (params?.status) {
    conditions.push(eq(unansweredQuestions.status, params.status));
  }
  return db.select().from(unansweredQuestions)
    .where(and(...conditions))
    .orderBy(desc(unansweredQuestions.createdAt))
    .limit(200);
}

export async function getUnansweredQuestion(id: number): Promise<UnansweredQuestion | undefined> {
  const [question] = await db.select().from(unansweredQuestions)
    .where(eq(unansweredQuestions.id, id));
  return question;
}

export async function createUnansweredQuestion(question: InsertUnansweredQuestion): Promise<UnansweredQuestion> {
  const [created] = await db.insert(unansweredQuestions).values(question).returning();
  return created;
}

export async function updateUnansweredQuestion(id: number, data: Partial<UnansweredQuestion>): Promise<UnansweredQuestion> {
  const [updated] = await db.update(unansweredQuestions)
    .set(data)
    .where(eq(unansweredQuestions.id, id))
    .returning();
  return updated;
}

export async function deleteUnansweredQuestion(id: number, businessId: number): Promise<void> {
  await db.delete(unansweredQuestions).where(and(eq(unansweredQuestions.id, id), eq(unansweredQuestions.businessId, businessId)));
}

export async function getUnansweredQuestionCount(businessId: number): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(unansweredQuestions)
    .where(and(
      eq(unansweredQuestions.businessId, businessId),
      eq(unansweredQuestions.status, 'pending')
    ));
  return Number(result[0]?.count ?? 0);
}

// =================== AI Suggestions (Auto-Refine Pipeline) ===================

export async function getAiSuggestions(businessId: number, params?: { status?: string }): Promise<AiSuggestion[]> {
  const conditions: any[] = [eq(aiSuggestions.businessId, businessId)];
  if (params?.status) {
    conditions.push(eq(aiSuggestions.status, params.status));
  }
  return db.select().from(aiSuggestions)
    .where(and(...conditions))
    .orderBy(desc(aiSuggestions.createdAt))
    .limit(100);
}

export async function getAiSuggestion(id: number): Promise<AiSuggestion | undefined> {
  const [suggestion] = await db.select().from(aiSuggestions)
    .where(eq(aiSuggestions.id, id));
  return suggestion;
}

export async function createAiSuggestion(suggestion: InsertAiSuggestion): Promise<AiSuggestion> {
  const [created] = await db.insert(aiSuggestions).values(suggestion).returning();
  return created;
}

export async function updateAiSuggestion(id: number, data: Partial<AiSuggestion>): Promise<AiSuggestion> {
  const [updated] = await db.update(aiSuggestions)
    .set(data)
    .where(eq(aiSuggestions.id, id))
    .returning();
  return updated;
}

export async function getAiSuggestionCount(businessId: number): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiSuggestions)
    .where(and(
      eq(aiSuggestions.businessId, businessId),
      eq(aiSuggestions.status, 'pending')
    ));
  return Number(result[0]?.count ?? 0);
}

export async function getAiSuggestionsAcceptedCount(businessId: number): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(aiSuggestions)
    .where(and(
      eq(aiSuggestions.businessId, businessId),
      or(eq(aiSuggestions.status, 'accepted'), eq(aiSuggestions.status, 'edited'))
    ));
  return Number(result[0]?.count ?? 0);
}

// =================== Website Scrape Cache ===================

export async function getWebsiteScrapeCache(businessId: number): Promise<WebsiteScrapeCache | undefined> {
  const [cache] = await db.select().from(websiteScrapeCache)
    .where(eq(websiteScrapeCache.businessId, businessId));
  return cache;
}

export async function upsertWebsiteScrapeCache(businessId: number, data: Partial<InsertWebsiteScrapeCache>): Promise<WebsiteScrapeCache> {
  // Check if exists
  const existing = await getWebsiteScrapeCache(businessId);
  if (existing) {
    const [updated] = await db.update(websiteScrapeCache)
      .set(data)
      .where(eq(websiteScrapeCache.businessId, businessId))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(websiteScrapeCache)
      .values({ businessId, url: data.url || '', ...data })
      .returning();
    return created;
  }
}

// =================== Clover POS ===================

export async function getCloverMenuCache(businessId: number): Promise<CloverMenuCache | undefined> {
  const [cache] = await db.select().from(cloverMenuCache)
    .where(eq(cloverMenuCache.businessId, businessId));
  return cache;
}

export async function upsertCloverMenuCache(businessId: number, menuData: any): Promise<CloverMenuCache> {
  const existing = await getCloverMenuCache(businessId);
  if (existing) {
    const [updated] = await db.update(cloverMenuCache)
      .set({ menuData, lastSyncedAt: new Date() })
      .where(eq(cloverMenuCache.businessId, businessId))
      .returning();
    return updated;
  }
  const [created] = await db.insert(cloverMenuCache)
    .values({ businessId, menuData, lastSyncedAt: new Date() })
    .returning();
  return created;
}

export async function createCloverOrderLog(entry: InsertCloverOrderLog): Promise<CloverOrderLog> {
  const [log] = await db.insert(cloverOrderLog).values(entry).returning();
  return log;
}

export async function getCloverOrderLogs(businessId: number, limit: number = 50): Promise<CloverOrderLog[]> {
  return db.select().from(cloverOrderLog)
    .where(eq(cloverOrderLog.businessId, businessId))
    .orderBy(desc(cloverOrderLog.createdAt))
    .limit(limit);
}

export async function getCloverOrderLog(id: number): Promise<CloverOrderLog | undefined> {
  const [log] = await db.select().from(cloverOrderLog)
    .where(eq(cloverOrderLog.id, id));
  return log;
}

export async function updateBusinessCloverTokens(businessId: number, tokens: {
  cloverMerchantId?: string;
  cloverAccessToken?: string;
  cloverRefreshToken?: string;
  cloverTokenExpiry?: Date;
  cloverEnvironment?: string;
}): Promise<Business> {
  const encryptedTokens = { ...tokens };
  if (encryptedTokens.cloverAccessToken) {
    encryptedTokens.cloverAccessToken = encryptField(encryptedTokens.cloverAccessToken)!;
  }
  if (encryptedTokens.cloverRefreshToken) {
    encryptedTokens.cloverRefreshToken = encryptField(encryptedTokens.cloverRefreshToken)!;
  }
  const [updated] = await db.update(businesses)
    .set({ ...encryptedTokens, updatedAt: new Date() })
    .where(eq(businesses.id, businessId))
    .returning();
  return decryptBusinessFields(updated);
}

export async function clearBusinessCloverConnection(businessId: number): Promise<Business> {
  const [updated] = await db.update(businesses)
    .set({
      cloverMerchantId: null,
      cloverAccessToken: null,
      cloverRefreshToken: null,
      cloverTokenExpiry: null,
      cloverEnvironment: null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))
    .returning();
  return updated;
}

// =================== Square POS ===================

export async function getSquareMenuCache(businessId: number): Promise<SquareMenuCache | undefined> {
  const [cache] = await db.select().from(squareMenuCache)
    .where(eq(squareMenuCache.businessId, businessId));
  return cache;
}

export async function upsertSquareMenuCache(businessId: number, menuData: any): Promise<SquareMenuCache> {
  const existing = await getSquareMenuCache(businessId);
  if (existing) {
    const [updated] = await db.update(squareMenuCache)
      .set({ menuData, lastSyncedAt: new Date() })
      .where(eq(squareMenuCache.businessId, businessId))
      .returning();
    return updated;
  }
  const [created] = await db.insert(squareMenuCache)
    .values({ businessId, menuData, lastSyncedAt: new Date() })
    .returning();
  return created;
}

export async function createSquareOrderLog(entry: InsertSquareOrderLog): Promise<SquareOrderLog> {
  const [log] = await db.insert(squareOrderLog).values(entry).returning();
  return log;
}

export async function getSquareOrderLogs(businessId: number, limit: number = 50): Promise<SquareOrderLog[]> {
  return db.select().from(squareOrderLog)
    .where(eq(squareOrderLog.businessId, businessId))
    .orderBy(desc(squareOrderLog.createdAt))
    .limit(limit);
}

export async function getSquareOrderLog(id: number): Promise<SquareOrderLog | undefined> {
  const [log] = await db.select().from(squareOrderLog)
    .where(eq(squareOrderLog.id, id));
  return log;
}

export async function updateBusinessSquareTokens(businessId: number, tokens: {
  squareMerchantId?: string;
  squareAccessToken?: string;
  squareRefreshToken?: string;
  squareTokenExpiry?: Date;
  squareLocationId?: string;
  squareEnvironment?: string;
}): Promise<Business> {
  const encryptedTokens = { ...tokens };
  if (encryptedTokens.squareAccessToken) {
    encryptedTokens.squareAccessToken = encryptField(encryptedTokens.squareAccessToken)!;
  }
  if (encryptedTokens.squareRefreshToken) {
    encryptedTokens.squareRefreshToken = encryptField(encryptedTokens.squareRefreshToken)!;
  }
  const [updated] = await db.update(businesses)
    .set({ ...encryptedTokens, updatedAt: new Date() })
    .where(eq(businesses.id, businessId))
    .returning();
  return decryptBusinessFields(updated);
}

export async function clearBusinessSquareConnection(businessId: number): Promise<Business> {
  const [updated] = await db.update(businesses)
    .set({
      squareMerchantId: null,
      squareAccessToken: null,
      squareRefreshToken: null,
      squareTokenExpiry: null,
      squareLocationId: null,
      squareEnvironment: null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))
    .returning();
  return updated;
}

// =================== Heartland POS ===================

export async function getHeartlandMenuCache(businessId: number): Promise<HeartlandMenuCache | undefined> {
  const [cache] = await db.select().from(heartlandMenuCache)
    .where(eq(heartlandMenuCache.businessId, businessId));
  return cache;
}

export async function upsertHeartlandMenuCache(businessId: number, menuData: any): Promise<HeartlandMenuCache> {
  const existing = await getHeartlandMenuCache(businessId);
  if (existing) {
    const [updated] = await db.update(heartlandMenuCache)
      .set({ menuData, lastSyncedAt: new Date() })
      .where(eq(heartlandMenuCache.businessId, businessId))
      .returning();
    return updated;
  }
  const [created] = await db.insert(heartlandMenuCache)
    .values({ businessId, menuData, lastSyncedAt: new Date() })
    .returning();
  return created;
}

export async function createHeartlandOrderLog(entry: InsertHeartlandOrderLog): Promise<HeartlandOrderLog> {
  const [log] = await db.insert(heartlandOrderLog).values(entry).returning();
  return log;
}

export async function getHeartlandOrderLogs(businessId: number, limit: number = 50): Promise<HeartlandOrderLog[]> {
  return db.select().from(heartlandOrderLog)
    .where(eq(heartlandOrderLog.businessId, businessId))
    .orderBy(desc(heartlandOrderLog.createdAt))
    .limit(limit);
}

export async function clearBusinessHeartlandConnection(businessId: number): Promise<Business> {
  const [updated] = await db.update(businesses)
    .set({
      heartlandApiKey: null,
      heartlandLocationName: null,
      heartlandEnvironment: null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))
    .returning();
  return updated;
}
