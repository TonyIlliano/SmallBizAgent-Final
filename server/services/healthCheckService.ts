import { db } from "../db";
import { healthChecks } from "@shared/schema";
import { sql, eq, and, gte, desc } from "drizzle-orm";

export interface HealthCheckResult {
  serviceName: string;
  status: "healthy" | "degraded" | "down";
  responseTimeMs: number;
  errorMessage?: string;
  checkedAt: Date;
}

/**
 * Ping a service and measure response time.
 * Returns status based on latency thresholds.
 */
async function timedCheck(
  name: string,
  fn: () => Promise<void>,
  degradedThresholdMs = 500
): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout (10s)")), 10000)
      ),
    ]);
    const elapsed = Date.now() - start;
    return {
      serviceName: name,
      status: elapsed > degradedThresholdMs ? "degraded" : "healthy",
      responseTimeMs: elapsed,
      checkedAt: new Date(),
    };
  } catch (err: unknown) {
    return {
      serviceName: name,
      status: "down",
      responseTimeMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : String(err),
      checkedAt: new Date(),
    };
  }
}

export async function checkDatabase(): Promise<HealthCheckResult> {
  return timedCheck("Database", async () => {
    await db.execute(sql`SELECT 1`);
  }, 100);
}

export async function checkTwilio(): Promise<HealthCheckResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return { serviceName: "Twilio", status: "down", responseTimeMs: 0, errorMessage: "Not configured", checkedAt: new Date() };
  }
  return timedCheck("Twilio", async () => {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  });
}

export async function checkRetell(): Promise<HealthCheckResult> {
  const key = process.env.RETELL_API_KEY;
  if (!key) {
    return { serviceName: "Retell AI", status: "down", responseTimeMs: 0, errorMessage: "Not configured", checkedAt: new Date() };
  }
  return timedCheck("Retell AI", async () => {
    // Use list-phone-numbers as a lightweight ping — returns 200 with valid key, 401 with invalid
    // Both mean the API is reachable (healthy). Only 5xx or timeout = down.
    const resp = await fetch("https://api.retellai.com/list-phone-numbers", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (resp.status >= 500) throw new Error(`HTTP ${resp.status}`);
    // 200, 401, 403 all mean the API is up
  });
}

export async function checkStripe(): Promise<HealthCheckResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { serviceName: "Stripe", status: "down", responseTimeMs: 0, errorMessage: "Not configured", checkedAt: new Date() };
  }
  return timedCheck("Stripe", async () => {
    const resp = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  });
}

export async function checkOpenAI(): Promise<HealthCheckResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { serviceName: "OpenAI", status: "down", responseTimeMs: 0, errorMessage: "Not configured", checkedAt: new Date() };
  }
  return timedCheck("OpenAI", async () => {
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  });
}

/**
 * Run all health checks in parallel and store results to DB.
 */
export async function runAllHealthChecks(): Promise<HealthCheckResult[]> {
  const results = await Promise.allSettled([
    checkDatabase(),
    checkTwilio(),
    checkRetell(),
    checkStripe(),
    checkOpenAI(),
  ]);

  const checks: HealthCheckResult[] = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { serviceName: "Unknown", status: "down" as const, responseTimeMs: 0, errorMessage: String(r.reason), checkedAt: new Date() }
  );

  // Store to DB (fire-and-forget, don't let DB failure crash health check)
  try {
    for (const check of checks) {
      await db.insert(healthChecks).values({
        serviceName: check.serviceName,
        status: check.status,
        responseTimeMs: check.responseTimeMs,
        errorMessage: check.errorMessage || null,
      });
    }
  } catch (err) {
    console.error("[HealthCheck] Failed to store results:", err);
  }

  return checks;
}

/**
 * Get health check history for a service (or all services).
 */
export async function getHealthHistory(
  serviceName?: string,
  hours: number = 24
): Promise<HealthCheckResult[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const conditions = [gte(healthChecks.checkedAt, since)];
  if (serviceName) {
    conditions.push(eq(healthChecks.serviceName, serviceName));
  }

  const rows = await db
    .select()
    .from(healthChecks)
    .where(and(...conditions))
    .orderBy(desc(healthChecks.checkedAt))
    .limit(500);

  return rows.map((r) => ({
    serviceName: r.serviceName,
    status: r.status as "healthy" | "degraded" | "down",
    responseTimeMs: r.responseTimeMs || 0,
    errorMessage: r.errorMessage || undefined,
    checkedAt: r.checkedAt || new Date(),
  }));
}

/**
 * Delete health check records older than the specified number of days.
 */
export async function pruneHealthHistory(daysToKeep: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(healthChecks)
    .where(sql`${healthChecks.checkedAt} < ${cutoff}`);
  return 0; // drizzle delete doesn't return count easily
}
