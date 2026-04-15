import {
  Workflow, InsertWorkflow, workflows,
  WorkflowRun, InsertWorkflowRun, workflowRuns,
} from "@shared/schema";
import { eq, and, desc, lte } from "drizzle-orm";
import { db } from "../db";

// =================== Workflows ===================

export async function createWorkflow(data: InsertWorkflow): Promise<Workflow> {
  const [workflow] = await db.insert(workflows).values(data).returning();
  return workflow;
}

export async function getWorkflows(businessId: number, params?: { status?: string; limit?: number }): Promise<Workflow[]> {
  const conditions = [eq(workflows.businessId, businessId)];
  if (params?.status) conditions.push(eq(workflows.status, params.status));
  return db.select().from(workflows).where(and(...conditions)).orderBy(desc(workflows.createdAt)).limit(params?.limit || 50);
}

export async function getWorkflow(id: number, businessId: number): Promise<Workflow | null> {
  const [workflow] = await db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.businessId, businessId)));
  return workflow || null;
}

export async function updateWorkflow(id: number, data: Partial<Workflow>): Promise<Workflow> {
  const [updated] = await db.update(workflows).set({ ...data, updatedAt: new Date() }).where(eq(workflows.id, id)).returning();
  return updated;
}

export async function deleteWorkflow(id: number, businessId: number): Promise<boolean> {
  const result = await db.delete(workflows).where(and(eq(workflows.id, id), eq(workflows.businessId, businessId))).returning();
  return result.length > 0;
}

export async function getActiveWorkflowsByTrigger(triggerEvent: string): Promise<Workflow[]> {
  return db.select().from(workflows).where(and(eq(workflows.triggerEvent, triggerEvent), eq(workflows.status, 'active'))).limit(200);
}

// =================== Workflow Runs ===================

export async function createWorkflowRun(data: InsertWorkflowRun): Promise<WorkflowRun> {
  const [run] = await db.insert(workflowRuns).values(data).returning();
  return run;
}

export async function getWorkflowRun(id: number): Promise<WorkflowRun | null> {
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id));
  return run || null;
}

export async function getWorkflowRuns(businessId: number, params?: { workflowId?: number; status?: string; limit?: number }): Promise<WorkflowRun[]> {
  const conditions = [eq(workflowRuns.businessId, businessId)];
  if (params?.workflowId) conditions.push(eq(workflowRuns.workflowId, params.workflowId));
  if (params?.status) conditions.push(eq(workflowRuns.status, params.status));
  return db.select().from(workflowRuns).where(and(...conditions)).orderBy(desc(workflowRuns.createdAt)).limit(params?.limit || 100);
}

export async function updateWorkflowRun(id: number, data: Partial<WorkflowRun>): Promise<WorkflowRun> {
  const [updated] = await db.update(workflowRuns).set({ ...data, updatedAt: new Date() }).where(eq(workflowRuns.id, id)).returning();
  return updated;
}

export async function getActiveRunsForCustomer(customerId: number, businessId: number, workflowId?: number): Promise<WorkflowRun[]> {
  const conditions = [
    eq(workflowRuns.customerId, customerId),
    eq(workflowRuns.businessId, businessId),
    eq(workflowRuns.status, 'active'),
  ];
  if (workflowId) conditions.push(eq(workflowRuns.workflowId, workflowId));
  return db.select().from(workflowRuns).where(and(...conditions)).limit(100);
}

export async function getDueWorkflowRuns(limit?: number): Promise<WorkflowRun[]> {
  return db.select().from(workflowRuns).where(
    and(
      eq(workflowRuns.status, 'active'),
      lte(workflowRuns.nextStepAt, new Date()),
    )
  ).orderBy(workflowRuns.nextStepAt).limit(limit || 50);
}

export async function cancelWorkflowRunsForCustomer(businessId: number, customerId: number, reason: string): Promise<number> {
  const result = await db.update(workflowRuns)
    .set({ status: 'cancelled', cancelReason: reason, updatedAt: new Date() })
    .where(and(
      eq(workflowRuns.businessId, businessId),
      eq(workflowRuns.customerId, customerId),
      eq(workflowRuns.status, 'active'),
    ))
    .returning();
  return result.length;
}
