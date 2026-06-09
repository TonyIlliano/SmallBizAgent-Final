/**
 * Quote Acceptance Service — HVAC Step 5
 *
 * Atomic quote → repair-job conversion. Called when a customer approves a
 * quote (via SMS APPROVE/Y keyword or via portal click), this service:
 *
 *   1. Marks the quote as 'converted' (existing status enum value).
 *   2. Creates a fresh repair `jobs` row, linked back to the source
 *      diagnostic job via `sourceQuoteId` so the dispatcher can trace
 *      "diagnostic job N → quote N → repair job M".
 *   3. Mirrors the quote's line items into the new repair job's
 *      line items (prices already include the member-discount snapshot
 *      from send-time).
 *   4. Returns the new job ID + a `notified: boolean` summary.
 *
 * Idempotency: if the quote is ALREADY converted (status='converted') AND a
 * job with `sourceQuoteId = quote.id` already exists, returns that existing
 * job's ID without creating a duplicate. Defends against the customer
 * texting "Y" twice from two devices, retry races, and accidental re-fires
 * from any future webhook integration.
 *
 * Transaction: the quote-status update + new-job insert + line-item inserts
 * all land together via `db.transaction()`. Either all three succeed or
 * none of them do — no partial conversion state.
 *
 * Out of scope for v1 (deferred per plan §4.4):
 *   - Auto-creating the follow-up appointment (dispatcher schedules it
 *     manually from the new job's detail page).
 *   - Owner notification (deferred until we have a clean orchestrator hook
 *     for it; for now the new job just lands on their dispatch board).
 *   - Voice approval via Retell tool.
 *   - Stripe Payment Link embedded in the approval reply.
 */

import { db } from '../db';
import { quotes, jobs as jobsTable } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { storage } from '../storage';

const LOG_PREFIX = '[QuoteAcceptance]';

export interface QuoteAcceptanceResult {
  ok: boolean;
  newJobId: number | null;
  quoteAlreadyConverted: boolean;
  /** Set when a non-recoverable validation failed (e.g., quote not found / wrong business). */
  reason?:
    | 'quote_not_found'
    | 'quote_belongs_to_other_business'
    | 'quote_expired'
    | 'quote_already_declined'
    | 'quote_has_no_source_job'
    | 'quote_has_no_line_items'
    | 'database_error';
  message?: string;
}

/**
 * Apply the customer's acceptance of a quote: flip status, create the repair
 * job + line items, return the new job ID. Tenant-scoped on the `quote`
 * lookup — pass the businessId you trust (usually from the SMS routing
 * context or the portal access token's owning quote).
 */
export async function handleQuoteAcceptance(
  quoteId: number,
  businessId: number,
): Promise<QuoteAcceptanceResult> {
  try {
    const quote = await storage.getQuoteById(quoteId, businessId);
    if (!quote) {
      return {
        ok: false,
        newJobId: null,
        quoteAlreadyConverted: false,
        reason: 'quote_not_found',
        message: 'Quote not found',
      };
    }
    if (quote.businessId !== businessId) {
      // Defense in depth — getQuoteById already filters but if a future
      // caller bypasses, this catches it.
      return {
        ok: false,
        newJobId: null,
        quoteAlreadyConverted: false,
        reason: 'quote_belongs_to_other_business',
        message: 'Quote does not belong to this business',
      };
    }

    // Idempotency: if we already converted this quote, look up the existing
    // repair job and return its ID. The customer SMS-ing "Y" twice OR a
    // webhook retry must not generate a duplicate.
    if (quote.status === 'converted') {
      const existingJob = await findRepairJobForQuote(quote.id, businessId);
      if (existingJob?.id) {
        console.log(
          `${LOG_PREFIX} Quote ${quote.id} already converted — returning existing job ${existingJob.id}`,
        );
        return {
          ok: true,
          newJobId: existingJob.id,
          quoteAlreadyConverted: true,
        };
      }
      // Quote is marked converted but no repair job exists — this is a
      // recoverable state from a partial earlier run. Fall through and
      // create the repair job.
      console.warn(
        `${LOG_PREFIX} Quote ${quote.id} status='converted' but no repair job found — creating one now`,
      );
    }

    // Hard rejections that the SMS handler / portal route should translate
    // into a clean user-facing message.
    if (quote.status === 'declined') {
      return {
        ok: false,
        newJobId: null,
        quoteAlreadyConverted: false,
        reason: 'quote_already_declined',
        message: 'This quote was previously declined',
      };
    }
    // Expired-by-validUntil check: don't auto-convert a quote whose price
    // is no longer guaranteed.
    if (quote.validUntil) {
      const expiresAt = new Date(`${quote.validUntil}T23:59:59`);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        return {
          ok: false,
          newJobId: null,
          quoteAlreadyConverted: false,
          reason: 'quote_expired',
          message: 'This quote has expired — please contact us for a new one',
        };
      }
    }
    if (!quote.jobId) {
      // Quote was created without a source job link. Can still convert into
      // a fresh job for the same customer, but the dispatcher loses the
      // diagnostic→repair trace. Today's send-quote endpoint always
      // populates jobId, so this is a guard against legacy / hand-created
      // quotes only.
      return {
        ok: false,
        newJobId: null,
        quoteAlreadyConverted: false,
        reason: 'quote_has_no_source_job',
        message: 'Quote is not linked to a job, cannot auto-create repair',
      };
    }

    // Fetch the supporting context — source job (for triage carry-forward
    // + staff default), quote items (to mirror), and validate we have items
    // to copy.
    const [sourceJob, quoteItems] = await Promise.all([
      storage.getJob(quote.jobId),
      storage.getQuoteItems(quote.id),
    ]);

    if (!quoteItems || quoteItems.length === 0) {
      return {
        ok: false,
        newJobId: null,
        quoteAlreadyConverted: false,
        reason: 'quote_has_no_line_items',
        message: 'Quote has no line items to convert',
      };
    }

    // Carry forward the structured triage from the source diagnostic job
    // (Phase 1 work). Even though the tech is doing the actual repair, the
    // urgency/issue/symptoms/access notes are still relevant — the AC is
    // still broken, parking instructions still apply, etc.
    const triageCarry = sourceJob
      ? {
          urgency: sourceJob.urgency ?? null,
          issueType: sourceJob.issueType ?? null,
          symptoms: sourceJob.symptoms ?? null,
          accessNotes: sourceJob.accessNotes ?? null,
        }
      : { urgency: null, issueType: null, symptoms: null, accessNotes: null };

    // All three writes in one transaction: flip quote status + insert repair
    // job + insert mirrored line items.
    const newJobId = await db.transaction(async (tx) => {
      // 1. Flip the quote status. Done first so a row-level race with another
      //    "Y" SMS sees the quote as already-converted and short-circuits at
      //    the idempotency check above.
      await tx
        .update(quotes)
        .set({ status: 'converted', updatedAt: new Date() })
        .where(and(eq(quotes.id, quote.id), eq(quotes.businessId, businessId)));

      // 2. Insert the repair job.
      const [insertedJob] = await tx
        .insert(jobsTable)
        .values({
          businessId,
          customerId: quote.customerId,
          // Preserve the tech assignment from the diagnostic visit by default;
          // dispatcher can reassign before scheduling.
          staffId: sourceJob?.staffId ?? null,
          title: `Repair from quote ${quote.quoteNumber}`,
          description: quote.notes || `Approved quote ${quote.quoteNumber}`,
          status: 'pending',
          // Triage carry-forward
          urgency: triageCarry.urgency as any,
          issueType: triageCarry.issueType,
          symptoms: triageCarry.symptoms,
          accessNotes: triageCarry.accessNotes,
          // Reverse-pointer back to the quote
          sourceQuoteId: quote.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // 3. Mirror line items 1:1. Prices already include the member-discount
      //    snapshot from send-time, so the repair job's billing math matches
      //    what the customer just approved.
      for (const item of quoteItems) {
        await tx.insert(
          (await import('@shared/schema')).jobLineItems,
        ).values({
          jobId: insertedJob.id,
          // jobLineItems requires a `type` — quote items don't carry the
          // labor/parts/materials breakdown today, so default to 'service'
          // which matches what the auto-generated invoice path uses too.
          // Owner / tech can edit per-line in the job form later.
          type: 'service',
          description: item.description,
          quantity: typeof item.quantity === 'number' ? item.quantity : 1,
          unitPrice: item.unitPrice,
          amount: item.amount,
        });
      }

      return insertedJob.id;
    });

    console.log(
      `${LOG_PREFIX} Converted quote ${quote.id} → repair job ${newJobId} (business ${businessId})`,
    );

    return {
      ok: true,
      newJobId,
      quoteAlreadyConverted: false,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Failed to convert quote ${quoteId}:`, errorMessage);
    return {
      ok: false,
      newJobId: null,
      quoteAlreadyConverted: false,
      reason: 'database_error',
      message: 'Could not convert quote — please try again or contact support',
    };
  }
}

/**
 * Look up an existing repair job that was created from a given quote.
 * Tenant-scoped. Used by the idempotency path so re-fires of acceptance
 * return the existing repair job ID instead of creating a duplicate.
 */
async function findRepairJobForQuote(
  quoteId: number,
  businessId: number,
): Promise<{ id: number } | null> {
  try {
    const [row] = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.sourceQuoteId, quoteId),
          eq(jobsTable.businessId, businessId),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error(
      `${LOG_PREFIX} findRepairJobForQuote lookup failed for quote ${quoteId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
