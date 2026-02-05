import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  recurringSchedules,
  recurringScheduleItems,
  recurringJobHistory,
  jobs,
  invoices,
  invoiceItems,
  customers,
  services,
  staff,
  Invoice
} from "@shared/schema";
import { eq, and, lte, gte, isNull, or, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Validation schemas
const createRecurringScheduleSchema = z.object({
  businessId: z.number(),
  customerId: z.number(),
  serviceId: z.number().optional(),
  staffId: z.number().optional(),
  name: z.string().min(1),
  frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]),
  interval: z.number().min(1).default(1),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  jobTitle: z.string().min(1),
  jobDescription: z.string().optional(),
  estimatedDuration: z.number().optional(),
  autoCreateInvoice: z.boolean().default(true),
  invoiceAmount: z.number().optional(),
  invoiceTax: z.number().optional(),
  invoiceNotes: z.string().optional(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number().default(1),
    unitPrice: z.number(),
    amount: z.number(),
  })).optional(),
});

// Get all recurring schedules for a business
router.get("/", async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.query.businessId as string);
    if (!businessId) {
      return res.status(400).json({ error: "businessId is required" });
    }

    const schedules = await db
      .select()
      .from(recurringSchedules)
      .where(eq(recurringSchedules.businessId, businessId))
      .orderBy(desc(recurringSchedules.createdAt));

    // Fetch related data for each schedule
    const schedulesWithDetails = await Promise.all(
      schedules.map(async (schedule) => {
        const [customer] = await db
          .select()
          .from(customers)
          .where(eq(customers.id, schedule.customerId))
          .limit(1);

        const service = schedule.serviceId
          ? (await db.select().from(services).where(eq(services.id, schedule.serviceId)).limit(1))[0]
          : null;

        const assignedStaff = schedule.staffId
          ? (await db.select().from(staff).where(eq(staff.id, schedule.staffId)).limit(1))[0]
          : null;

        const items = await db
          .select()
          .from(recurringScheduleItems)
          .where(eq(recurringScheduleItems.scheduleId, schedule.id));

        return {
          ...schedule,
          customer,
          service,
          staff: assignedStaff,
          items,
        };
      })
    );

    res.json(schedulesWithDetails);
  } catch (error) {
    console.error("Error fetching recurring schedules:", error);
    res.status(500).json({ error: "Failed to fetch recurring schedules" });
  }
});

// Get a single recurring schedule
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const [schedule] = await db
      .select()
      .from(recurringSchedules)
      .where(eq(recurringSchedules.id, id))
      .limit(1);

    if (!schedule) {
      return res.status(404).json({ error: "Recurring schedule not found" });
    }

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, schedule.customerId))
      .limit(1);

    const service = schedule.serviceId
      ? (await db.select().from(services).where(eq(services.id, schedule.serviceId)).limit(1))[0]
      : null;

    const assignedStaff = schedule.staffId
      ? (await db.select().from(staff).where(eq(staff.id, schedule.staffId)).limit(1))[0]
      : null;

    const items = await db
      .select()
      .from(recurringScheduleItems)
      .where(eq(recurringScheduleItems.scheduleId, schedule.id));

    const history = await db
      .select()
      .from(recurringJobHistory)
      .where(eq(recurringJobHistory.scheduleId, schedule.id))
      .orderBy(desc(recurringJobHistory.createdAt))
      .limit(10);

    res.json({
      ...schedule,
      customer,
      service,
      staff: assignedStaff,
      items,
      history,
    });
  } catch (error) {
    console.error("Error fetching recurring schedule:", error);
    res.status(500).json({ error: "Failed to fetch recurring schedule" });
  }
});

// Create a new recurring schedule
router.post("/", async (req: Request, res: Response) => {
  try {
    const data = createRecurringScheduleSchema.parse(req.body);
    const { items, ...scheduleData } = data;

    // Calculate next run date
    const nextRunDate = calculateNextRunDate(
      data.startDate,
      data.frequency,
      data.interval,
      data.dayOfWeek,
      data.dayOfMonth
    );

    const [schedule] = await db
      .insert(recurringSchedules)
      .values({
        ...scheduleData,
        nextRunDate,
      })
      .returning();

    // Insert line items if provided
    if (items && items.length > 0) {
      await db.insert(recurringScheduleItems).values(
        items.map((item) => ({
          scheduleId: schedule.id,
          ...item,
        }))
      );
    }

    res.status(201).json(schedule);
  } catch (error) {
    console.error("Error creating recurring schedule:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to create recurring schedule" });
  }
});

// Update a recurring schedule
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { items, ...updateData } = req.body;

    // Recalculate next run date if schedule parameters changed
    if (updateData.frequency || updateData.interval || updateData.dayOfWeek || updateData.dayOfMonth) {
      const [existingSchedule] = await db
        .select()
        .from(recurringSchedules)
        .where(eq(recurringSchedules.id, id))
        .limit(1);

      if (existingSchedule) {
        updateData.nextRunDate = calculateNextRunDate(
          updateData.startDate || existingSchedule.startDate,
          updateData.frequency || existingSchedule.frequency,
          updateData.interval || existingSchedule.interval,
          updateData.dayOfWeek ?? existingSchedule.dayOfWeek,
          updateData.dayOfMonth ?? existingSchedule.dayOfMonth
        );
      }
    }

    const [schedule] = await db
      .update(recurringSchedules)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(recurringSchedules.id, id))
      .returning();

    if (!schedule) {
      return res.status(404).json({ error: "Recurring schedule not found" });
    }

    // Update line items if provided
    if (items) {
      // Delete existing items
      await db
        .delete(recurringScheduleItems)
        .where(eq(recurringScheduleItems.scheduleId, id));

      // Insert new items
      if (items.length > 0) {
        await db.insert(recurringScheduleItems).values(
          items.map((item: any) => ({
            scheduleId: id,
            ...item,
          }))
        );
      }
    }

    res.json(schedule);
  } catch (error) {
    console.error("Error updating recurring schedule:", error);
    res.status(500).json({ error: "Failed to update recurring schedule" });
  }
});

// Delete a recurring schedule
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Delete line items first
    await db
      .delete(recurringScheduleItems)
      .where(eq(recurringScheduleItems.scheduleId, id));

    // Delete history
    await db
      .delete(recurringJobHistory)
      .where(eq(recurringJobHistory.scheduleId, id));

    // Delete the schedule
    const [deleted] = await db
      .delete(recurringSchedules)
      .where(eq(recurringSchedules.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Recurring schedule not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting recurring schedule:", error);
    res.status(500).json({ error: "Failed to delete recurring schedule" });
  }
});

// Pause a recurring schedule
router.post("/:id/pause", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const [schedule] = await db
      .update(recurringSchedules)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(recurringSchedules.id, id))
      .returning();

    if (!schedule) {
      return res.status(404).json({ error: "Recurring schedule not found" });
    }

    res.json(schedule);
  } catch (error) {
    console.error("Error pausing recurring schedule:", error);
    res.status(500).json({ error: "Failed to pause recurring schedule" });
  }
});

// Resume a recurring schedule
router.post("/:id/resume", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    // Get current schedule to recalculate next run date
    const [existingSchedule] = await db
      .select()
      .from(recurringSchedules)
      .where(eq(recurringSchedules.id, id))
      .limit(1);

    if (!existingSchedule) {
      return res.status(404).json({ error: "Recurring schedule not found" });
    }

    // Calculate next run date from today
    const nextRunDate = calculateNextRunDate(
      new Date().toISOString().split("T")[0],
      existingSchedule.frequency,
      existingSchedule.interval || 1,
      existingSchedule.dayOfWeek ?? undefined,
      existingSchedule.dayOfMonth ?? undefined
    );

    const [schedule] = await db
      .update(recurringSchedules)
      .set({
        status: "active",
        nextRunDate,
        updatedAt: new Date()
      })
      .where(eq(recurringSchedules.id, id))
      .returning();

    res.json(schedule);
  } catch (error) {
    console.error("Error resuming recurring schedule:", error);
    res.status(500).json({ error: "Failed to resume recurring schedule" });
  }
});

// Manually run a recurring schedule (create job/invoice now)
router.post("/:id/run", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = await executeRecurringSchedule(id);
    res.json(result);
  } catch (error) {
    console.error("Error running recurring schedule:", error);
    res.status(500).json({ error: "Failed to run recurring schedule" });
  }
});

// Get history for a recurring schedule
router.get("/:id/history", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const history = await db
      .select()
      .from(recurringJobHistory)
      .where(eq(recurringJobHistory.scheduleId, id))
      .orderBy(desc(recurringJobHistory.createdAt));

    // Fetch job and invoice details for each history entry
    const historyWithDetails = await Promise.all(
      history.map(async (entry) => {
        const [job] = await db
          .select()
          .from(jobs)
          .where(eq(jobs.id, entry.jobId))
          .limit(1);

        const invoice = entry.invoiceId
          ? (await db.select().from(invoices).where(eq(invoices.id, entry.invoiceId)).limit(1))[0]
          : null;

        return {
          ...entry,
          job,
          invoice,
        };
      })
    );

    res.json(historyWithDetails);
  } catch (error) {
    console.error("Error fetching recurring schedule history:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Helper function to calculate next run date
function calculateNextRunDate(
  startDate: string,
  frequency: string,
  interval: number,
  dayOfWeek?: number,
  dayOfMonth?: number
): string {
  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let nextDate = new Date(start);
  nextDate.setHours(0, 0, 0, 0);

  // If start date is in the past, calculate from today
  if (nextDate < today) {
    nextDate = new Date(today);
  }

  switch (frequency) {
    case "daily":
      // Already set to today or start date
      break;

    case "weekly":
      if (dayOfWeek !== undefined) {
        // Find the next occurrence of the specified day
        while (nextDate.getDay() !== dayOfWeek) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
      }
      break;

    case "biweekly":
      if (dayOfWeek !== undefined) {
        while (nextDate.getDay() !== dayOfWeek) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
      }
      break;

    case "monthly":
      if (dayOfMonth !== undefined) {
        nextDate.setDate(dayOfMonth);
        if (nextDate < today) {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
      }
      break;

    case "quarterly":
      if (dayOfMonth !== undefined) {
        nextDate.setDate(dayOfMonth);
        if (nextDate < today) {
          nextDate.setMonth(nextDate.getMonth() + 3);
        }
      }
      break;

    case "yearly":
      if (nextDate < today) {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      }
      break;
  }

  return nextDate.toISOString().split("T")[0];
}

// Execute a recurring schedule - create job and optionally invoice
async function executeRecurringSchedule(scheduleId: number) {
  const [schedule] = await db
    .select()
    .from(recurringSchedules)
    .where(eq(recurringSchedules.id, scheduleId))
    .limit(1);

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  if (schedule.status !== "active") {
    throw new Error("Schedule is not active");
  }

  // Create the job
  const [job] = await db
    .insert(jobs)
    .values({
      businessId: schedule.businessId,
      customerId: schedule.customerId,
      staffId: schedule.staffId,
      title: schedule.jobTitle,
      description: schedule.jobDescription,
      scheduledDate: schedule.nextRunDate,
      status: "pending",
    })
    .returning();

  let invoice: Invoice | null = null;

  // Create invoice if auto-create is enabled
  if (schedule.autoCreateInvoice && schedule.invoiceAmount) {
    // Get schedule items
    const items = await db
      .select()
      .from(recurringScheduleItems)
      .where(eq(recurringScheduleItems.scheduleId, scheduleId));

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}`;

    // Calculate due date (30 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    [invoice] = await db
      .insert(invoices)
      .values({
        businessId: schedule.businessId,
        customerId: schedule.customerId,
        jobId: job.id,
        invoiceNumber,
        amount: schedule.invoiceAmount,
        tax: schedule.invoiceTax || 0,
        total: schedule.invoiceAmount + (schedule.invoiceTax || 0),
        dueDate: dueDate.toISOString().split("T")[0],
        status: "pending",
        notes: schedule.invoiceNotes,
      })
      .returning();

    // Create invoice items
    if (items.length > 0 && invoice) {
      await db.insert(invoiceItems).values(
        items.map((item) => ({
          invoiceId: invoice!.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
        }))
      );
    }
  }

  // Record in history
  await db.insert(recurringJobHistory).values({
    scheduleId: schedule.id,
    jobId: job.id,
    invoiceId: invoice?.id,
    scheduledFor: schedule.nextRunDate!,
  });

  // Calculate next run date and update schedule
  const nextRunDate = calculateNextRunAfterExecution(schedule);

  await db
    .update(recurringSchedules)
    .set({
      lastRunDate: schedule.nextRunDate,
      nextRunDate,
      totalJobsCreated: (schedule.totalJobsCreated || 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(recurringSchedules.id, scheduleId));

  return { job, invoice };
}

// Calculate next run date after an execution
function calculateNextRunAfterExecution(schedule: any): string {
  const lastRun = new Date(schedule.nextRunDate);
  let nextDate = new Date(lastRun);

  switch (schedule.frequency) {
    case "daily":
      nextDate.setDate(nextDate.getDate() + (schedule.interval || 1));
      break;

    case "weekly":
      nextDate.setDate(nextDate.getDate() + 7 * (schedule.interval || 1));
      break;

    case "biweekly":
      nextDate.setDate(nextDate.getDate() + 14);
      break;

    case "monthly":
      nextDate.setMonth(nextDate.getMonth() + (schedule.interval || 1));
      break;

    case "quarterly":
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;

    case "yearly":
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }

  // Check if we've passed the end date
  if (schedule.endDate && nextDate > new Date(schedule.endDate)) {
    // Mark as completed by returning null-like value
    return schedule.endDate;
  }

  return nextDate.toISOString().split("T")[0];
}

// Export function for scheduler service to use
export async function processDueRecurringSchedules() {
  const today = new Date().toISOString().split("T")[0];

  // Find all active schedules due today or earlier
  const dueSchedules = await db
    .select()
    .from(recurringSchedules)
    .where(
      and(
        eq(recurringSchedules.status, "active"),
        lte(recurringSchedules.nextRunDate, today),
        or(
          isNull(recurringSchedules.endDate),
          gte(recurringSchedules.endDate, new Date().toISOString().split("T")[0])
        )
      )
    );

  const results = [];
  for (const schedule of dueSchedules) {
    try {
      const result = await executeRecurringSchedule(schedule.id);
      results.push({ scheduleId: schedule.id, success: true, ...result });
    } catch (error: any) {
      results.push({ scheduleId: schedule.id, success: false, error: error.message });
    }
  }

  return results;
}

export default router;
