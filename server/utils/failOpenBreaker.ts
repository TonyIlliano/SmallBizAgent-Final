/**
 * Fail-Open Circuit Breaker (bounded grace window)
 *
 * The billing gates (paymentRequired, planGate) historically failed OPEN on
 * any upstream error: a 2-hour Stripe outage meant every gated business got
 * free AI minutes that could never be billed retroactively. Failing CLOSED
 * immediately is worse — a 30-second Stripe blip would lock paying customers
 * out of their dashboards.
 *
 * This breaker splits the difference: the FIRST consecutive failure opens a
 * grace window (default 5 minutes) during which the gate keeps failing open.
 * If failures persist past the window, the gate fails closed (the caller
 * returns 402/503 with a clear "billing verification unavailable" message)
 * until the upstream recovers. Any success resets the window.
 *
 * Instances are per-process. On multi-instance deploys each instance tracks
 * its own window — acceptable, since the bound on free access is still
 * graceMs per instance.
 */
export class FailOpenBreaker {
  private firstFailureAt: number | null = null;
  private loggedClosed = false;

  constructor(
    private readonly name: string,
    private readonly graceMs: number = 5 * 60_000,
  ) {}

  /** Call on any successful upstream check — resets the failure window. */
  recordSuccess(): void {
    if (this.firstFailureAt !== null) {
      console.log(`[FailOpenBreaker:${this.name}] upstream recovered — failing open again`);
    }
    this.firstFailureAt = null;
    this.loggedClosed = false;
  }

  /**
   * Call on an upstream failure. Returns true while the grace window is
   * still open (caller should fail OPEN), false once it's exhausted
   * (caller should fail CLOSED).
   */
  recordFailure(): boolean {
    if (this.firstFailureAt === null) {
      this.firstFailureAt = Date.now();
    }
    const withinGrace = Date.now() - this.firstFailureAt < this.graceMs;
    if (!withinGrace && !this.loggedClosed) {
      this.loggedClosed = true;
      console.error(
        `[FailOpenBreaker:${this.name}] consecutive failures exceeded ${Math.round(this.graceMs / 1000)}s grace window — failing CLOSED until upstream recovers`,
      );
    }
    return withinGrace;
  }

  /** True when consecutive failures have exhausted the grace window. */
  isFailingClosed(): boolean {
    return this.firstFailureAt !== null && Date.now() - this.firstFailureAt >= this.graceMs;
  }

  /** Test helper — reset all state. */
  reset(): void {
    this.firstFailureAt = null;
    this.loggedClosed = false;
  }
}
