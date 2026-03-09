import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { appointments, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Check if user is authenticated
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Check if user is an admin
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Check if user is not a staff member (owner/admin only)
export function isOwnerOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user?.role === 'staff') {
    return res.status(403).json({ error: 'This feature is only available to business owners.' });
  }
  next();
}

// Check if user belongs to the business in the request (supports multi-location)
export async function belongsToBusiness(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Admin can access any business
  if (req.user?.role === 'admin') {
    return next();
  }

  const businessId = parseInt(req.params.businessId || req.params.id || req.body.businessId);

  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: 'Invalid business ID' });
  }

  // Check active businessId first (fast path)
  if (req.user?.businessId === businessId) {
    return next();
  }

  // Check user_business_access for multi-location support
  try {
    const { storage } = await import('../storage');
    const hasAccess = await storage.hasBusinessAccess(req.user!.id, businessId);
    if (hasAccess) {
      return next();
    }
  } catch (err) {
    console.error('Error checking business access:', err);
  }

  return res.status(403).json({ error: 'Access denied to this business' });
}

// Helper functions for non-middleware contexts
export function checkIsAdmin(user: any): boolean {
  return user?.role === 'admin';
}

export function checkBelongsToBusiness(user: any, businessId: number): boolean {
  // Sync check — for multi-location async check use belongsToBusiness middleware
  return user?.role === 'admin' || user?.businessId === businessId;
}

// Async version that checks user_business_access table for multi-location support
export async function checkBelongsToBusinessAsync(user: any, businessId: number): Promise<boolean> {
  if (user?.role === 'admin') return true;
  if (user?.businessId === businessId) return true;
  try {
    const { storage } = await import('../storage');
    return await storage.hasBusinessAccess(user.id, businessId);
  } catch (err) {
    console.warn(`[Auth] Failed to check business access for user ${user?.id}, business ${businessId}:`, err);
    return false;
  }
}

// Check if user has access to an appointment
export async function canAccessAppointment(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Admin can access any appointment
  if (req.user?.role === 'admin') {
    return next();
  }

  const appointmentId = parseInt(req.params.appointmentId);
  
  if (!appointmentId || isNaN(appointmentId)) {
    return res.status(400).json({ error: 'Invalid appointment ID' });
  }

  try {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (req.user?.businessId !== appointment.businessId) {
      return res.status(403).json({ error: 'Access denied to this appointment' });
    }

    next();
  } catch (error) {
    console.error('Error checking appointment access:', error);
    res.status(500).json({ error: 'Error checking appointment access' });
  }
}