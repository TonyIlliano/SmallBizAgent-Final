import { db } from '../db';
import { auditLogs } from '@shared/schema';

export type AuditAction =
  | 'login' | 'login_failed' | 'logout' | 'logout_all_devices'
  | '2fa_enabled' | '2fa_disabled' | '2fa_setup_started'
  | 'password_change' | 'password_reset_requested' | 'password_reset_completed'
  | 'settings_change' | 'business_update'
  | 'api_key_created' | 'api_key_deleted'
  | 'data_export' | 'data_delete' | 'account_deleted'
  | 'phone_provisioned' | 'phone_released'
  | 'subscription_created' | 'subscription_cancelled'
  | 'location_added' | 'location_switched';

export async function logAudit(params: {
  userId?: number | null;
  businessId?: number | null;
  action: AuditAction;
  resource?: string;
  resourceId?: number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      businessId: params.businessId ?? null,
      action: params.action,
      resource: params.resource ?? null,
      resourceId: params.resourceId ?? null,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    });
  } catch (error) {
    // Audit logging should never break the main flow
    console.error('[AuditService] Error logging audit event:', error);
  }
}

// Helper to extract IP and user agent from Express request
export function getRequestContext(req: any): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.headers?.['user-agent'] || 'unknown',
  };
}
