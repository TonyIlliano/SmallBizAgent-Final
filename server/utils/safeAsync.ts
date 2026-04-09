/**
 * Safe async error handler for fire-and-forget promises.
 *
 * Replaces empty `.catch(() => {})` patterns with proper error logging.
 * Use instead of silently swallowing errors:
 *
 * BEFORE: somePromise.catch(() => {});
 * AFTER:  somePromise.catch(logAndSwallow('ServiceName'));
 *
 * Errors are logged with context but do NOT propagate — safe for fire-and-forget usage.
 */
export function logAndSwallow(context: string) {
  return (err: unknown) => {
    console.error(
      `[${context}] Fire-and-forget failure:`,
      err instanceof Error ? err.message : String(err)
    );
  };
}
