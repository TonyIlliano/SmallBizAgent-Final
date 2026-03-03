import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { users, businesses, businessGroups, userBusinessAccess } from '@shared/schema';

// Create location router
const router = Router();

// Middleware for checking authentication
const isAuthenticated = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

// ─── Validation Schemas ────────────────────────────────────────────────────────

const switchLocationSchema = z.object({
  businessId: z.number(),
});

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  billingEmail: z.string().email().optional(),
});

const addLocationSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  email: z.string().email('Valid email is required'),
  type: z.string().optional().default('general'),
  timezone: z.string().optional().default('America/New_York'),
  locationLabel: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
});

// ─── GET /api/user/locations ────────────────────────────────────────────────────
// List all locations/businesses the current user has access to
router.get('/user/locations', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get all business IDs the user has access to via user_business_access
    const accessRecords = await db
      .select({
        businessId: userBusinessAccess.businessId,
        role: userBusinessAccess.role,
      })
      .from(userBusinessAccess)
      .where(eq(userBusinessAccess.userId, userId));

    if (accessRecords.length === 0) {
      // Fall back to the user's primary businessId if no access records exist
      if (req.user!.businessId) {
        const [primaryBusiness] = await db
          .select()
          .from(businesses)
          .where(eq(businesses.id, req.user!.businessId))
          .limit(1);

        return res.json({
          locations: primaryBusiness ? [{
            ...primaryBusiness,
            accessRole: 'owner',
          }] : [],
          activeBusinessId: req.user!.businessId,
        });
      }
      return res.json({ locations: [], activeBusinessId: null });
    }

    // Fetch all linked businesses
    const businessIds = accessRecords.map(r => r.businessId);
    const locationList = [];

    for (const record of accessRecords) {
      const [biz] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, record.businessId))
        .limit(1);

      if (biz) {
        locationList.push({
          ...biz,
          accessRole: record.role,
        });
      }
    }

    res.json({
      locations: locationList,
      activeBusinessId: req.user!.businessId,
    });
  } catch (error: any) {
    console.error('Error fetching user locations:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/user/switch-location ─────────────────────────────────────────────
// Switch the user's active business
router.post('/user/switch-location', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validationResult = switchLocationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: validationResult.error.errors });
    }

    const { businessId } = validationResult.data;
    const userId = req.user!.id;

    // Validate the user has access to this business via user_business_access
    const [accessRecord] = await db
      .select()
      .from(userBusinessAccess)
      .where(
        and(
          eq(userBusinessAccess.userId, userId),
          eq(userBusinessAccess.businessId, businessId)
        )
      )
      .limit(1);

    // Also allow admins to switch to any business
    if (!accessRecord && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have access to this business' });
    }

    // Verify the business exists and is active
    const [targetBusiness] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);

    if (!targetBusiness) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (targetBusiness.isActive === false) {
      return res.status(400).json({ error: 'This location is deactivated' });
    }

    // Update the user's active businessId in the database
    await db
      .update(users)
      .set({ businessId, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Refresh the session with updated user data
    const updatedUser = await storage.getUser(userId);
    if (updatedUser) {
      req.user = updatedUser as Express.User;

      // Regenerate session to reflect the change
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    res.json({
      message: 'Switched location successfully',
      activeBusinessId: businessId,
      business: targetBusiness,
    });
  } catch (error: any) {
    console.error('Error switching location:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/business-groups ──────────────────────────────────────────────────
// Create a new business group
router.post('/business-groups', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validationResult = createGroupSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: validationResult.error.errors });
    }

    const { name, billingEmail } = validationResult.data;
    const userId = req.user!.id;

    // Create the business group
    const [newGroup] = await db
      .insert(businessGroups)
      .values({
        name,
        ownerUserId: userId,
        billingEmail: billingEmail || req.user!.email,
      })
      .returning();

    // If the user already has a business, link it to this group
    if (req.user!.businessId) {
      await db
        .update(businesses)
        .set({ businessGroupId: newGroup.id, updatedAt: new Date() })
        .where(eq(businesses.id, req.user!.businessId));
    }

    res.status(201).json(newGroup);
  } catch (error: any) {
    console.error('Error creating business group:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/business-groups/:id ───────────────────────────────────────────────
// Get group details with all locations
router.get('/business-groups/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // Fetch the group
    const [group] = await db
      .select()
      .from(businessGroups)
      .where(eq(businessGroups.id, groupId))
      .limit(1);

    if (!group) {
      return res.status(404).json({ error: 'Business group not found' });
    }

    // Only the group owner or an admin can view group details
    if (group.ownerUserId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch all locations in this group
    const locations = await db
      .select()
      .from(businesses)
      .where(eq(businesses.businessGroupId, groupId));

    res.json({
      ...group,
      locations,
    });
  } catch (error: any) {
    console.error('Error fetching business group:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/business-groups/:id/add-location ────────────────────────────────
// Add a new business/location to the group
router.post('/business-groups/:id/add-location', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const validationResult = addLocationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: validationResult.error.errors });
    }

    // Verify the group exists and user is the owner (or admin)
    const [group] = await db
      .select()
      .from(businessGroups)
      .where(eq(businessGroups.id, groupId))
      .limit(1);

    if (!group) {
      return res.status(404).json({ error: 'Business group not found' });
    }

    if (group.ownerUserId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only the group owner can add locations' });
    }

    const locationData = validationResult.data;

    // Create the new business record linked to this group
    const [newBusiness] = await db
      .insert(businesses)
      .values({
        name: locationData.name,
        email: locationData.email,
        type: locationData.type,
        timezone: locationData.timezone,
        locationLabel: locationData.locationLabel || null,
        address: locationData.address || null,
        city: locationData.city || null,
        state: locationData.state || null,
        zip: locationData.zip || null,
        phone: locationData.phone || null,
        businessGroupId: groupId,
        isActive: true,
      })
      .returning();

    // Add user_business_access for the group owner
    await db
      .insert(userBusinessAccess)
      .values({
        userId: group.ownerUserId,
        businessId: newBusiness.id,
        role: 'owner',
      });

    // Update the group's location count
    const locationCount = await db
      .select()
      .from(businesses)
      .where(eq(businesses.businessGroupId, groupId));

    // If this is the user's first business, set it as their active one
    if (!req.user!.businessId) {
      await db
        .update(users)
        .set({ businessId: newBusiness.id, updatedAt: new Date() })
        .where(eq(users.id, req.user!.id));
    }

    res.status(201).json({
      business: newBusiness,
      group: {
        ...group,
        totalLocations: locationCount.length,
      },
    });
  } catch (error: any) {
    console.error('Error adding location to group:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── DELETE /api/business-groups/:groupId/locations/:businessId ─────────────────
// Deactivate (soft-delete) a location from the group
router.delete('/business-groups/:groupId/locations/:businessId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const businessId = parseInt(req.params.businessId);

    if (isNaN(groupId) || isNaN(businessId)) {
      return res.status(400).json({ error: 'Invalid group ID or business ID' });
    }

    // Verify the group exists and user is the owner (or admin)
    const [group] = await db
      .select()
      .from(businessGroups)
      .where(eq(businessGroups.id, groupId))
      .limit(1);

    if (!group) {
      return res.status(404).json({ error: 'Business group not found' });
    }

    if (group.ownerUserId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only the group owner can deactivate locations' });
    }

    // Verify the business belongs to this group
    const [business] = await db
      .select()
      .from(businesses)
      .where(
        and(
          eq(businesses.id, businessId),
          eq(businesses.businessGroupId, groupId)
        )
      )
      .limit(1);

    if (!business) {
      return res.status(404).json({ error: 'Business not found in this group' });
    }

    // Soft-deactivate the business
    await db
      .update(businesses)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(businesses.id, businessId));

    // If the user's active business is the one being deactivated, switch to another
    if (req.user!.businessId === businessId) {
      const [anotherBusiness] = await db
        .select()
        .from(businesses)
        .where(
          and(
            eq(businesses.businessGroupId, groupId),
            eq(businesses.isActive, true)
          )
        )
        .limit(1);

      if (anotherBusiness) {
        await db
          .update(users)
          .set({ businessId: anotherBusiness.id, updatedAt: new Date() })
          .where(eq(users.id, req.user!.id));
      }
    }

    res.json({
      message: 'Location deactivated successfully',
      businessId,
      groupId,
    });
  } catch (error: any) {
    console.error('Error deactivating location:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
