import {
  Job, InsertJob, jobs,
  JobLineItem, InsertJobLineItem, jobLineItems,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";

// =================== Jobs ===================

export async function getJobs(businessId: number, params?: {
  status?: string,
  customerId?: number,
  staffId?: number,
  limit?: number,
  offset?: number
}): Promise<Job[]> {
  const conditions = [eq(jobs.businessId, businessId)];

  if (params?.status) {
    conditions.push(eq(jobs.status, params.status));
  }

  if (params?.customerId) {
    conditions.push(eq(jobs.customerId, params.customerId));
  }

  const query = db.select().from(jobs)
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt))
    .limit(params?.limit ?? 500);
  if (params?.offset) {
    return query.offset(params.offset);
  }
  return query;
}

export async function getJob(id: number): Promise<Job | undefined> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  return job;
}

export async function getJobByAppointmentId(appointmentId: number): Promise<Job | undefined> {
  const [job] = await db.select().from(jobs).where(eq(jobs.appointmentId, appointmentId));
  return job;
}

export async function createJob(job: InsertJob): Promise<Job> {
  const [newJob] = await db.insert(jobs).values({
    ...job,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();
  return newJob;
}

export async function updateJob(id: number, job: Partial<Job>): Promise<Job> {
  const [updatedJob] = await db.update(jobs)
    .set({
      ...job,
      updatedAt: new Date()
    })
    .where(eq(jobs.id, id))
    .returning();
  return updatedJob;
}

export async function deleteJob(id: number, businessId: number): Promise<void> {
  await db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.businessId, businessId)));
}

// =================== Job Line Items ===================

export async function getJobLineItems(jobId: number): Promise<JobLineItem[]> {
  return db.select().from(jobLineItems)
    .where(eq(jobLineItems.jobId, jobId))
    .orderBy(jobLineItems.createdAt);
}

export async function createJobLineItem(item: InsertJobLineItem): Promise<JobLineItem> {
  const [newItem] = await db.insert(jobLineItems).values({
    ...item,
    createdAt: new Date()
  }).returning();
  return newItem;
}

export async function updateJobLineItem(id: number, item: Partial<JobLineItem>): Promise<JobLineItem> {
  const [updatedItem] = await db.update(jobLineItems)
    .set(item)
    .where(eq(jobLineItems.id, id))
    .returning();
  return updatedItem;
}

export async function deleteJobLineItem(id: number): Promise<void> {
  await db.delete(jobLineItems).where(eq(jobLineItems.id, id));
}

export async function deleteJobLineItemsByJob(jobId: number): Promise<void> {
  await db.delete(jobLineItems).where(eq(jobLineItems.jobId, jobId));
}
