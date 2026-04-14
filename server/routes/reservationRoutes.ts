import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";

const router = Router();

// Helper function to get businessId from authenticated user or API key
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as any).apiKeyBusinessId) {
    return (req as any).apiKeyBusinessId;
  }
  return 0;
};

// Helper to verify resource belongs to user's business
const verifyBusinessOwnership = (resource: any, req: Request): boolean => {
  if (!resource) return false;
  const userBusinessId = getBusinessId(req);
  return resource.businessId === userBusinessId;
};

// =================== RESTAURANT RESERVATIONS API ===================

router.get("/restaurant-reservations", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const params: any = {};

    if (req.query.startDate) {
      const d = new Date(req.query.startDate as string);
      params.startDate = d.toISOString().split('T')[0];
    }
    if (req.query.endDate) {
      const d = new Date(req.query.endDate as string);
      params.endDate = d.toISOString().split('T')[0];
    }
    if (req.query.date) {
      params.date = req.query.date as string;
    }
    if (req.query.status) {
      params.status = req.query.status as string;
    }
    if (req.query.customerId) {
      const customerId = parseInt(req.query.customerId as string);
      if (isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      params.customerId = customerId;
    }

    const reservations = await storage.getRestaurantReservations(businessId, params);

    // Populate customer data for each reservation
    const populatedReservations = await Promise.all(
      reservations.map(async (reservation) => {
        const customer = await storage.getCustomer(reservation.customerId);
        return { ...reservation, customer };
      })
    );

    res.json(populatedReservations);
  } catch (error) {
    res.status(500).json({ message: "Error fetching reservations" });
  }
});

router.get("/restaurant-reservations/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid reservation ID" });
    }
    const reservation = await storage.getRestaurantReservation(id);
    if (!reservation || !verifyBusinessOwnership(reservation, req)) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    const customer = await storage.getCustomer(reservation.customerId);
    res.json({ ...reservation, customer });
  } catch (error) {
    res.status(500).json({ message: "Error fetching reservation" });
  }
});

router.put("/restaurant-reservations/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid reservation ID" });
    }
    const existing = await storage.getRestaurantReservation(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    // Only allow updating specific fields from the dashboard
    const allowedFields: (keyof typeof req.body)[] = ['status', 'specialRequests', 'partySize'];
    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const updated = await storage.updateRestaurantReservation(id, updates);
    const customer = await storage.getCustomer(updated.customerId);
    res.json({ ...updated, customer });
  } catch (error) {
    res.status(500).json({ message: "Error updating reservation" });
  }
});

export default router;
