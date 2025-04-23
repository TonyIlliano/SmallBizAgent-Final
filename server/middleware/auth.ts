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

// Check if user belongs to the business in the request
export function belongsToBusiness(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Admin can access any business
  if (req.user?.role === 'admin') {
    return next();
  }

  const businessId = parseInt(req.params.businessId || req.body.businessId);
  
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: 'Invalid business ID' });
  }

  if (req.user?.businessId !== businessId) {
    return res.status(403).json({ error: 'Access denied to this business' });
  }

  next();
}

// Helper functions for non-middleware contexts
export function checkIsAdmin(user: any): boolean {
  return user?.role === 'admin';
}

export function checkBelongsToBusiness(user: any, businessId: number): boolean {
  return user?.role === 'admin' || user?.businessId === businessId;
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