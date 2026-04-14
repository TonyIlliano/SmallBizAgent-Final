/**
 * Distributed tracing / request context via AsyncLocalStorage.
 *
 * Provides a request ID that propagates through the entire request lifecycle
 * without needing to pass it explicitly through every function call.
 *
 * Usage from anywhere in server code:
 *   import { getRequestId, getRequestContext } from './utils/requestContext';
 *   console.log(`[${getRequestId()}] something happened`);
 */
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current request ID, or 'unknown' if called outside a request.
 */
export function getRequestId(): string {
  return asyncLocalStorage.getStore()?.requestId ?? "unknown";
}

/**
 * Returns the full request context, or a fallback with 'unknown' request ID.
 */
export function getRequestContext(): RequestContext {
  return (
    asyncLocalStorage.getStore() ?? {
      requestId: "unknown",
      method: "",
      path: "",
      startTime: 0,
    }
  );
}

/**
 * Express middleware that assigns a request ID and stores it in AsyncLocalStorage.
 *
 * - Reads `x-request-id` from incoming headers (propagated from load balancers)
 * - Falls back to a new UUID if not present
 * - Sets the `x-request-id` response header for client correlation
 * - Stores context in AsyncLocalStorage for access anywhere in the call stack
 *
 * Mount this BEFORE all other middleware.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId =
    (req.headers["x-request-id"] as string) || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const context: RequestContext = {
    requestId,
    method: req.method,
    path: req.path,
    startTime: Date.now(),
  };

  asyncLocalStorage.run(context, () => next());
}
