import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  customers,
  jobs,
  invoices,
  quotes,
  appointments,
  services,
} from "@shared/schema";
import { eq, and, or, ilike } from "drizzle-orm";
import { isAuthenticated } from "../auth";

const router = Router();

// Helper function to get businessId from authenticated user or API key
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as any).apiKeyBusinessId) {
    return (req as any).apiKeyBusinessId;
  }
  return 0;
};

// =================== GLOBAL SEARCH API ===================
router.get("/search", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (businessId === 0) {
      return res.status(400).json({ error: "No business associated with this account" });
    }

    const query = ((req.query.q as string) || "").trim();
    if (!query || query.length < 2) {
      return res.json({ customers: [], jobs: [], invoices: [], appointments: [], quotes: [] });
    }

    const searchTerm = `%${query}%`;

    // Search customers by firstName, lastName, email, phone
    const customerResults = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          or(
            ilike(customers.firstName, searchTerm),
            ilike(customers.lastName, searchTerm),
            ilike(customers.email, searchTerm),
            ilike(customers.phone, searchTerm)
          )
        )
      )
      .limit(5);

    // Search jobs by title, include customer name
    const jobResults = await db
      .select({
        job: jobs,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
      })
      .from(jobs)
      .leftJoin(customers, eq(jobs.customerId, customers.id))
      .where(
        and(
          eq(jobs.businessId, businessId),
          or(
            ilike(jobs.title, searchTerm),
            ilike(customers.firstName, searchTerm),
            ilike(customers.lastName, searchTerm)
          )
        )
      )
      .limit(5);

    // Search invoices by invoiceNumber, include customer name
    const invoiceResults = await db
      .select({
        invoice: invoices,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(
        and(
          eq(invoices.businessId, businessId),
          or(
            ilike(invoices.invoiceNumber, searchTerm),
            ilike(customers.firstName, searchTerm),
            ilike(customers.lastName, searchTerm)
          )
        )
      )
      .limit(5);

    // Search quotes by quoteNumber, include customer name
    const quoteResults = await db
      .select({
        quote: quotes,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
      })
      .from(quotes)
      .leftJoin(customers, eq(quotes.customerId, customers.id))
      .where(
        and(
          eq(quotes.businessId, businessId),
          or(
            ilike(quotes.quoteNumber, searchTerm),
            ilike(customers.firstName, searchTerm),
            ilike(customers.lastName, searchTerm)
          )
        )
      )
      .limit(5);

    // Search appointments, include customer name and service name
    const appointmentResults = await db
      .select({
        appointment: appointments,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        serviceName: services.name,
      })
      .from(appointments)
      .leftJoin(customers, eq(appointments.customerId, customers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(
        and(
          eq(appointments.businessId, businessId),
          or(
            ilike(customers.firstName, searchTerm),
            ilike(customers.lastName, searchTerm),
            ilike(services.name, searchTerm)
          )
        )
      )
      .limit(5);

    res.json({
      customers: customerResults,
      jobs: jobResults.map((r) => ({
        ...r.job,
        customerName: r.customerFirstName && r.customerLastName
          ? `${r.customerFirstName} ${r.customerLastName}`
          : "Unknown Customer",
      })),
      invoices: invoiceResults.map((r) => ({
        ...r.invoice,
        customerName: r.customerFirstName && r.customerLastName
          ? `${r.customerFirstName} ${r.customerLastName}`
          : "Unknown Customer",
      })),
      quotes: quoteResults.map((r) => ({
        ...r.quote,
        customerName: r.customerFirstName && r.customerLastName
          ? `${r.customerFirstName} ${r.customerLastName}`
          : "Unknown Customer",
      })),
      appointments: appointmentResults.map((r) => ({
        ...r.appointment,
        customerName: r.customerFirstName && r.customerLastName
          ? `${r.customerFirstName} ${r.customerLastName}`
          : "Unknown Customer",
        serviceName: r.serviceName || null,
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Error performing search" });
  }
});

export default router;
