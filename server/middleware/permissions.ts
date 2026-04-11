/**
 * Role-Based Permission Middleware
 *
 * Defines what each role can access and provides middleware
 * to enforce permissions on routes.
 *
 * Roles (highest to lowest):
 *   admin   — Platform-wide access (SmallBizAgent staff)
 *   owner   — Full business access (user.role === 'user' + owns business)
 *   manager — Operational access (appointments, customers, jobs, call logs — NO billing/settings)
 *   staff   — Own schedule only (own appointments, own time-off)
 *
 * Usage:
 *   router.get('/invoices', isAuthenticated, requireRole('owner', 'manager'), handler);
 *   router.put('/settings', isAuthenticated, requireRole('owner'), handler);
 */

import { Request, Response, NextFunction } from 'express';

export type AppRole = 'admin' | 'owner' | 'manager' | 'staff';

/**
 * Permission matrix — what each role can access.
 * Used by frontend to show/hide UI elements.
 */
export const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin: ['*'], // Everything
  owner: [
    'dashboard', 'customers', 'appointments', 'jobs', 'invoices', 'quotes',
    'receptionist', 'analytics', 'marketing', 'agents', 'settings', 'billing',
    'team', 'recurring', 'website', 'gbp', 'campaigns',
  ],
  manager: [
    'dashboard', 'customers', 'appointments', 'jobs', 'invoices', 'quotes',
    'receptionist', 'analytics', 'recurring', 'team_view',
  ],
  staff: [
    'staff_dashboard', 'own_appointments', 'own_schedule', 'own_time_off',
  ],
};

/**
 * Get the effective role for a user.
 * Maps the database role values to our permission roles:
 *   - 'admin' → admin
 *   - 'user' → owner (business owners)
 *   - 'staff' → staff (unless user_business_access says 'manager')
 */
export function getEffectiveRole(user: any): AppRole {
  if (!user) return 'staff';
  if (user.role === 'admin') return 'admin';
  if (user.role === 'user') return 'owner';
  // For staff, check if they have manager role in user_business_access
  // This is set in the accessRole field by the auth layer
  if (user.accessRole === 'manager') return 'manager';
  return 'staff';
}

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: AppRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

/**
 * Middleware: require the user to have one of the specified roles.
 *
 * Usage:
 *   router.get('/invoices', isAuthenticated, requireRole('owner', 'manager'), handler);
 *
 * Admin always passes (platform-wide access).
 */
export function requireRole(...allowedRoles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const effectiveRole = getEffectiveRole(req.user);

    // Admin always has access
    if (effectiveRole === 'admin') return next();

    if (allowedRoles.includes(effectiveRole)) {
      return next();
    }

    return res.status(403).json({
      error: 'Access denied',
      message: `This feature requires ${allowedRoles.join(' or ')} access.`,
      requiredRoles: allowedRoles,
      currentRole: effectiveRole,
    });
  };
}

/**
 * Middleware: require a specific permission (more granular than role).
 *
 * Usage:
 *   router.put('/settings', isAuthenticated, requirePermission('settings'), handler);
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const effectiveRole = getEffectiveRole(req.user);

    if (hasPermission(effectiveRole, permission)) {
      return next();
    }

    return res.status(403).json({
      error: 'Access denied',
      message: `You don't have permission to access ${permission}.`,
    });
  };
}

/**
 * Get permissions list for a user (for frontend).
 * Returned in GET /api/user response.
 */
export function getUserPermissions(user: any): {
  role: AppRole;
  permissions: string[];
} {
  const role = getEffectiveRole(user);
  return {
    role,
    permissions: ROLE_PERMISSIONS[role] || [],
  };
}
