/**
 * CSV Export Routes
 * Allows business owners to export their customers, appointments, and invoices as CSV.
 */
import { Router, Request, Response } from "express";
import { storage } from "../storage";

const router = Router();

/** Escape a CSV field (handles commas, quotes, newlines) */
function csvField(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build CSV string from rows and headers */
function buildCsv(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(csvField).join(",");
  const dataLines = rows.map((row) => row.map(csvField).join(","));
  return [headerLine, ...dataLines].join("\n");
}

// ── Export Customers ──

router.get("/export/customers", async (req: Request, res: Response) => {
  try {
    const businessId = (req as any).user?.businessId || (req as any).apiKeyBusinessId;
    if (!businessId) return res.status(401).json({ message: "Unauthorized" });

    const customers = await storage.getCustomers(businessId);

    const headers = [
      "First Name", "Last Name", "Email", "Phone", "Address", "City",
      "State", "Zip", "Notes", "Birthday", "SMS Opt-In", "Marketing Opt-In", "Created",
    ];

    const rows = customers.map((c) => [
      c.firstName,
      c.lastName,
      c.email || "",
      c.phone,
      c.address || "",
      c.city || "",
      c.state || "",
      (c as any).zip || "",
      c.notes || "",
      c.birthday || "",
      c.smsOptIn ? "Yes" : "No",
      c.marketingOptIn ? "Yes" : "No",
      c.createdAt ? new Date(c.createdAt).toISOString().split("T")[0] : "",
    ]);

    const csv = buildCsv(headers, rows);
    const filename = `customers-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("[Export] Customer export error:", error);
    res.status(500).json({ message: "Failed to export customers" });
  }
});

// ── Export Appointments ──

router.get("/export/appointments", async (req: Request, res: Response) => {
  try {
    const businessId = (req as any).user?.businessId || (req as any).apiKeyBusinessId;
    if (!businessId) return res.status(401).json({ message: "Unauthorized" });

    const appointments = await storage.getAppointments(businessId);

    // Fetch related data for enrichment
    const customerMap = new Map<number, any>();
    const staffMap = new Map<number, any>();
    const serviceMap = new Map<number, any>();

    const customers = await storage.getCustomers(businessId);
    customers.forEach((c) => customerMap.set(c.id, c));

    try {
      const staffList = await storage.getStaff(businessId);
      staffList.forEach((s) => staffMap.set(s.id, s));
    } catch { /* staff may not exist */ }

    try {
      const services = await storage.getServices(businessId);
      services.forEach((s) => serviceMap.set(s.id, s));
    } catch { /* services may not exist */ }

    const headers = [
      "Date", "Start Time", "End Time", "Customer", "Customer Phone", "Customer Email",
      "Service", "Staff", "Status", "Notes", "Created",
    ];

    const rows = appointments.map((a) => {
      const customer = a.customerId ? customerMap.get(a.customerId) : null;
      const staffMember = a.staffId ? staffMap.get(a.staffId) : null;
      const service = a.serviceId ? serviceMap.get(a.serviceId) : null;

      return [
        a.startDate ? new Date(a.startDate).toISOString().split("T")[0] : "",
        a.startDate ? new Date(a.startDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "",
        a.endDate ? new Date(a.endDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "",
        customer ? `${customer.firstName} ${customer.lastName}` : "",
        customer?.phone || "",
        customer?.email || "",
        service?.name || "",
        staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : "",
        a.status || "",
        a.notes || "",
        a.createdAt ? new Date(a.createdAt).toISOString().split("T")[0] : "",
      ];
    });

    const csv = buildCsv(headers, rows);
    const filename = `appointments-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("[Export] Appointment export error:", error);
    res.status(500).json({ message: "Failed to export appointments" });
  }
});

// ── Export Invoices ──

router.get("/export/invoices", async (req: Request, res: Response) => {
  try {
    const businessId = (req as any).user?.businessId || (req as any).apiKeyBusinessId;
    if (!businessId) return res.status(401).json({ message: "Unauthorized" });

    const invoices = await storage.getInvoices(businessId);

    // Fetch customers for enrichment
    const customerMap = new Map<number, any>();
    const customers = await storage.getCustomers(businessId);
    customers.forEach((c) => customerMap.set(c.id, c));

    const headers = [
      "Invoice #", "Customer", "Customer Email", "Customer Phone",
      "Amount", "Tax", "Total", "Status", "Due Date", "Notes", "Created",
    ];

    const rows = invoices.map((inv) => {
      const customer = inv.customerId ? customerMap.get(inv.customerId) : null;

      return [
        (inv as any).invoiceNumber || `INV-${inv.id}`,
        customer ? `${customer.firstName} ${customer.lastName}` : "",
        customer?.email || "",
        customer?.phone || "",
        String(inv.amount || "0"),
        String((inv as any).tax || "0"),
        String(inv.total || "0"),
        inv.status || "",
        inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "",
        inv.notes || "",
        inv.createdAt ? new Date(inv.createdAt).toISOString().split("T")[0] : "",
      ];
    });

    const csv = buildCsv(headers, rows);
    const filename = `invoices-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("[Export] Invoice export error:", error);
    res.status(500).json({ message: "Failed to export invoices" });
  }
});

// ── Export Jobs ──

router.get("/export/jobs", async (req: Request, res: Response) => {
  try {
    const businessId = (req as any).user?.businessId || (req as any).apiKeyBusinessId;
    if (!businessId) return res.status(401).json({ message: "Unauthorized" });

    const jobs = await storage.getJobs(businessId);

    const customerMap = new Map<number, any>();
    const customers = await storage.getCustomers(businessId);
    customers.forEach((c) => customerMap.set(c.id, c));

    const headers = [
      "Title", "Customer", "Customer Phone", "Status", "Scheduled Date",
      "Completed Date", "Amount", "Notes", "Address", "Created",
    ];

    const rows = jobs.map((j) => {
      const customer = j.customerId ? customerMap.get(j.customerId) : null;

      return [
        j.title || "",
        customer ? `${customer.firstName} ${customer.lastName}` : "",
        customer?.phone || "",
        j.status || "",
        j.scheduledDate ? new Date(j.scheduledDate).toISOString().split("T")[0] : "",
        (j as any).completedDate ? new Date((j as any).completedDate).toISOString().split("T")[0] : "",
        String((j as any).amount || ""),
        j.notes || "",
        (j as any).address || "",
        j.createdAt ? new Date(j.createdAt).toISOString().split("T")[0] : "",
      ];
    });

    const csv = buildCsv(headers, rows);
    const filename = `jobs-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("[Export] Job export error:", error);
    res.status(500).json({ message: "Failed to export jobs" });
  }
});

export default router;
