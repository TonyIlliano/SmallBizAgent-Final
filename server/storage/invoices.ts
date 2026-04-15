import {
  Invoice, InsertInvoice, invoices,
  InvoiceItem, InsertInvoiceItem, invoiceItems,
  Quote, InsertQuote, quotes,
  QuoteItem, InsertQuoteItem, quoteItems,
  QuoteFollowUp, InsertQuoteFollowUp, quoteFollowUps,
  customers, jobs,
} from "@shared/schema";
import { eq, and, or, desc, ilike, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";

// =================== Invoices ===================

export async function getInvoices(businessId: number, params?: {
  status?: string,
  customerId?: number
}): Promise<Invoice[]> {
  const conditions = [eq(invoices.businessId, businessId)];

  if (params?.status) {
    conditions.push(eq(invoices.status, params.status));
  }

  if (params?.customerId) {
    conditions.push(eq(invoices.customerId, params.customerId));
  }

  return db.select().from(invoices).where(and(...conditions));
}

export async function getInvoice(id: number): Promise<Invoice | undefined> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
  return invoice;
}

export async function getInvoiceByAccessToken(token: string): Promise<Invoice | undefined> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.accessToken, token));
  return invoice;
}

export async function getInvoicesWithAccessToken(email?: string, phone?: string): Promise<Invoice[]> {
  if (!email && !phone) {
    return [];
  }

  // Find customers matching email or phone
  const conditions = [];
  if (email) {
    conditions.push(eq(customers.email, email));
  }
  if (phone) {
    conditions.push(eq(customers.phone, phone));
  }

  const matchingCustomers = await db.select().from(customers)
    .where(conditions.length > 1 ? or(...conditions) : conditions[0]);

  if (matchingCustomers.length === 0) {
    return [];
  }

  // Get all invoices for these customers that have access tokens
  const customerIds = matchingCustomers.map(c => c.id);
  const allInvoices = await db.select().from(invoices)
    .where(
      and(
        sql`${invoices.customerId} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${invoices.accessToken} IS NOT NULL`
      )
    )
    .orderBy(desc(invoices.createdAt))
    .limit(50);

  return allInvoices;
}

export async function createInvoice(invoice: InsertInvoice): Promise<Invoice> {
  const [newInvoice] = await db.insert(invoices).values({
    ...invoice,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newInvoice;
}

export async function updateInvoice(id: number, invoice: Partial<Invoice>): Promise<Invoice> {
  const [updatedInvoice] = await db.update(invoices)
    .set({
      ...invoice,
      updatedAt: new Date()
    })
    .where(eq(invoices.id, id))
    .returning();
  return updatedInvoice;
}

export async function deleteInvoice(id: number, businessId: number): Promise<void> {
  await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.businessId, businessId)));
}

// =================== Invoice Items ===================

export async function getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
  return db.select().from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));
}

export async function createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem> {
  const [newItem] = await db.insert(invoiceItems).values(item).returning();
  return newItem;
}

export async function updateInvoiceItem(id: number, item: Partial<InvoiceItem>): Promise<InvoiceItem> {
  const [updatedItem] = await db.update(invoiceItems)
    .set(item)
    .where(eq(invoiceItems.id, id))
    .returning();
  return updatedItem;
}

export async function deleteInvoiceItem(id: number): Promise<void> {
  await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
}

// =================== Quotes ===================

export async function getAllQuotes(businessId: number, filters?: {
  status?: string;
  search?: string;
  customerId?: number;
  jobId?: number;
  fromDate?: Date;
  toDate?: Date;
}): Promise<any[]> {
  // Build conditions array
  const conditions: ReturnType<typeof eq>[] = [eq(quotes.businessId, businessId)];

  if (filters?.status) {
    conditions.push(eq(quotes.status, filters.status));
  }

  if (filters?.customerId) {
    conditions.push(eq(quotes.customerId, filters.customerId));
  }

  if (filters?.jobId) {
    conditions.push(eq(quotes.jobId, filters.jobId as number));
  }

  if (filters?.fromDate) {
    conditions.push(gte(quotes.createdAt, filters.fromDate));
  }

  if (filters?.toDate) {
    conditions.push(lte(quotes.createdAt, filters.toDate));
  }

  // Build the query with all conditions
  let whereCondition = and(...conditions);

  // Add search filter with OR conditions
  if (filters?.search) {
    const searchCondition = or(
      ilike(quotes.quoteNumber, `%${filters.search}%`),
      ilike(customers.firstName, `%${filters.search}%`),
      ilike(customers.lastName, `%${filters.search}%`),
      ilike(customers.email, `%${filters.search}%`),
      ilike(customers.phone, `%${filters.search}%`),
      ilike(jobs.title, `%${filters.search}%`)
    );
    whereCondition = and(whereCondition, searchCondition);
  }

  // Execute the query
  const results = await db.select({
    quote: quotes,
    customerFirstName: customers.firstName,
    customerLastName: customers.lastName,
    customerEmail: customers.email,
    customerPhone: customers.phone,
    jobTitle: jobs.title
  })
  .from(quotes)
  .leftJoin(customers, eq(quotes.customerId, customers.id))
  .leftJoin(jobs, eq(quotes.jobId, jobs.id))
  .where(whereCondition)
  .orderBy(desc(quotes.createdAt))
  .limit(500);

  // Format the results for the frontend
  return results.map(row => ({
    id: row.quote.id,
    quoteNumber: row.quote.quoteNumber,
    customerId: row.quote.customerId,
    customerName: row.customerFirstName && row.customerLastName
      ? `${row.customerFirstName} ${row.customerLastName}`
      : 'Unknown Customer',
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    jobId: row.quote.jobId,
    jobTitle: row.jobTitle,
    amount: row.quote.amount,
    tax: row.quote.tax,
    total: row.quote.total,
    status: row.quote.status,
    validUntil: row.quote.validUntil,
    createdAt: row.quote.createdAt,
    updatedAt: row.quote.updatedAt,
    convertedToInvoiceId: row.quote.convertedToInvoiceId
  }));
}

export async function getQuoteById(id: number, businessId: number): Promise<any> {
  // Fetch the quote
  const [quoteRow] = await db.select()
    .from(quotes)
    .where(and(
      eq(quotes.id, id),
      eq(quotes.businessId, businessId)
    ));

  if (!quoteRow) {
    return null;
  }

  // Fetch the customer
  const [customer] = await db.select()
    .from(customers)
    .where(eq(customers.id, quoteRow.customerId));

  // Fetch job if exists
  let job = null;
  if (quoteRow.jobId) {
    const [jobRow] = await db.select()
      .from(jobs)
      .where(eq(jobs.id, quoteRow.jobId));
    job = jobRow;
  }

  // Fetch quote items
  const items = await getQuoteItems(id);

  // Format the result
  return {
    ...quoteRow,
    customer,
    job,
    items
  };
}

export async function getQuoteByAccessToken(token: string): Promise<Quote | null> {
  const [quote] = await db.select()
    .from(quotes)
    .where(eq(quotes.accessToken, token));
  return quote || null;
}

export async function createQuote(quote: InsertQuote): Promise<Quote> {
  const [newQuote] = await db.insert(quotes).values({
    ...quote,
    status: quote.status || 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newQuote;
}

export async function updateQuote(id: number, quote: Partial<Quote>): Promise<Quote> {
  // Handle Date object to string conversion for validUntil
  let quoteData = { ...quote };
  if (quote.validUntil && typeof quote.validUntil === 'object' && 'toISOString' in quote.validUntil) {
    quoteData.validUntil = (quote.validUntil as Date).toISOString();
  }

  const [updatedQuote] = await db.update(quotes)
    .set({
      ...quoteData,
      updatedAt: new Date()
    })
    .where(eq(quotes.id, id))
    .returning();
  return updatedQuote;
}

export async function updateQuoteStatus(id: number, status: string): Promise<Quote> {
  const [updatedQuote] = await db.update(quotes)
    .set({
      status,
      updatedAt: new Date()
    })
    .where(eq(quotes.id, id))
    .returning();
  return updatedQuote;
}

export async function deleteQuote(id: number, businessId: number): Promise<void> {
  // First delete all quote items
  await deleteQuoteItems(id);
  // Then delete the quote
  await db.delete(quotes).where(and(eq(quotes.id, id), eq(quotes.businessId, businessId)));
}

// =================== Quote Items ===================

export async function getQuoteItems(quoteId: number): Promise<QuoteItem[]> {
  return db.select().from(quoteItems)
    .where(eq(quoteItems.quoteId, quoteId));
}

export async function createQuoteItem(item: InsertQuoteItem): Promise<QuoteItem> {
  const [newItem] = await db.insert(quoteItems).values(item).returning();
  return newItem;
}

export async function deleteQuoteItems(quoteId: number): Promise<void> {
  await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
}

// =================== Quote Follow-ups ===================

export async function createQuoteFollowUp(entry: InsertQuoteFollowUp): Promise<QuoteFollowUp> {
  const [created] = await db.insert(quoteFollowUps).values(entry).returning();
  return created;
}

export async function getQuoteFollowUpCount(quoteId: number): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(quoteFollowUps)
    .where(eq(quoteFollowUps.quoteId, quoteId));
  return Number(result[0]?.count ?? 0);
}

// =================== Quote to Invoice Conversion ===================

export async function convertQuoteToInvoice(quoteId: number): Promise<Invoice> {
  // Get the quote details
  const [quoteData] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quoteData) {
    throw new Error('Quote not found');
  }

  // Get the quote items
  const quoteItemsList = await getQuoteItems(quoteId);

  // Create a new invoice based on the quote
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Due in 30 days
  const invoice = await createInvoice({
    businessId: quoteData.businessId,
    customerId: quoteData.customerId,
    jobId: quoteData.jobId,
    invoiceNumber: `INV-${Date.now()}`, // Generate a new invoice number
    amount: quoteData.amount,
    tax: quoteData.tax || '0',
    total: quoteData.total,
    status: 'pending',
    notes: `Converted from Quote #${quoteData.quoteNumber}\n${quoteData.notes || ''}`.trim(),
    dueDate: dueDate.toISOString().split('T')[0], // Format as 'YYYY-MM-DD'
  });

  // Create invoice items from quote items
  for (const item of quoteItemsList) {
    await createInvoiceItem({
      invoiceId: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
    });
  }

  // Mark the quote as converted
  await updateQuote(quoteId, {
    status: 'converted',
    convertedToInvoiceId: invoice.id,
  });

  return invoice;
}
