import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database before importing auth middleware
vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock('@shared/schema', () => ({
  appointments: { id: 'id', businessId: 'business_id' },
  users: { id: 'id' },
}));

import { isAuthenticated, isAdmin, isOwnerOrAdmin, checkIsAdmin, checkBelongsToBusiness } from './auth';

// ── Helpers ──

function mockReq(overrides: any = {}) {
  return {
    isAuthenticated: vi.fn().mockReturnValue(true),
    user: { id: 1, businessId: 1, role: 'owner' },
    params: {},
    body: {},
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const mockNext = vi.fn();

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAuthenticated', () => {
    it('calls next() when user is authenticated', () => {
      const req = mockReq();
      const res = mockRes();

      isAuthenticated(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 401 when user is not authenticated', () => {
      const req = mockReq({ isAuthenticated: vi.fn().mockReturnValue(false) });
      const res = mockRes();

      isAuthenticated(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    });
  });

  describe('isAdmin', () => {
    it('calls next() when user is admin', () => {
      const req = mockReq({ user: { id: 1, role: 'admin' } });
      const res = mockRes();

      isAdmin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('returns 401 when user is not authenticated', () => {
      const req = mockReq({ isAuthenticated: vi.fn().mockReturnValue(false) });
      const res = mockRes();

      isAdmin(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 403 when user is not admin', () => {
      const req = mockReq({ user: { id: 1, role: 'owner' } });
      const res = mockRes();

      isAdmin(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    });

    it('returns 403 when user is staff', () => {
      const req = mockReq({ user: { id: 1, role: 'staff' } });
      const res = mockRes();

      isAdmin(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('isOwnerOrAdmin', () => {
    it('calls next() for owner role', () => {
      const req = mockReq({ user: { id: 1, role: 'owner' } });
      const res = mockRes();

      isOwnerOrAdmin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('calls next() for admin role', () => {
      const req = mockReq({ user: { id: 1, role: 'admin' } });
      const res = mockRes();

      isOwnerOrAdmin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('returns 403 for staff role', () => {
      const req = mockReq({ user: { id: 1, role: 'staff' } });
      const res = mockRes();

      isOwnerOrAdmin(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'This feature is only available to business owners.',
      });
    });

    it('returns 401 when not authenticated', () => {
      const req = mockReq({ isAuthenticated: vi.fn().mockReturnValue(false) });
      const res = mockRes();

      isOwnerOrAdmin(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('checkIsAdmin (helper)', () => {
    it('returns true for admin user', () => {
      expect(checkIsAdmin({ role: 'admin' })).toBe(true);
    });

    it('returns false for owner user', () => {
      expect(checkIsAdmin({ role: 'owner' })).toBe(false);
    });

    it('returns false for staff user', () => {
      expect(checkIsAdmin({ role: 'staff' })).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(checkIsAdmin(null)).toBe(false);
      expect(checkIsAdmin(undefined)).toBe(false);
    });
  });

  describe('checkBelongsToBusiness (helper)', () => {
    it('returns true when user businessId matches', () => {
      expect(checkBelongsToBusiness({ businessId: 5, role: 'owner' }, 5)).toBe(true);
    });

    it('returns false when user businessId does not match', () => {
      expect(checkBelongsToBusiness({ businessId: 5, role: 'owner' }, 99)).toBe(false);
    });

    it('returns true for admin regardless of businessId', () => {
      expect(checkBelongsToBusiness({ businessId: 5, role: 'admin' }, 99)).toBe(true);
    });

    it('returns false for null user', () => {
      expect(checkBelongsToBusiness(null, 5)).toBe(false);
    });

    it('prevents business A from accessing business B data', () => {
      const businessAUser = { id: 1, businessId: 1, role: 'owner' };
      const businessBId = 2;

      expect(checkBelongsToBusiness(businessAUser, businessBId)).toBe(false);
    });

    it('staff cannot access other business data', () => {
      const staffUser = { id: 5, businessId: 1, role: 'staff' };

      expect(checkBelongsToBusiness(staffUser, 1)).toBe(true);
      expect(checkBelongsToBusiness(staffUser, 2)).toBe(false);
    });
  });
});
