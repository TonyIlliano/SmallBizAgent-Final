import type { Response } from "express";

/**
 * Send a consistent JSON error response.
 *
 * Usage:
 *   return apiError(res, 400, 'Invalid input');
 *   return apiError(res, 404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
 */
export function apiError(res: Response, status: number, message: string, code?: string) {
  return res.status(status).json({ error: message, ...(code ? { code } : {}) });
}
