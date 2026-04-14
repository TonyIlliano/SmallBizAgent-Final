import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// ────────────────────────────────────────────────────────
// Module mocks — must be declared before any app imports
// ────────────────────────────────────────────────────────

const { mockStorage } = vi.hoisted(() => {
  return {
    mockStorage: {
      getBusinessByBookingSlug: vi.fn(),
      getBusiness: vi.fn(),
      getServices: vi.fn(),
      getService: vi.fn(),
      getStaff: vi.fn(),
      getStaffMember: vi.fn(),
      getBusinessHours: vi.fn(),
      getStaffServicesForBusiness: vi.fn(),
      getStaffServices: vi.fn(),
      getCustomerByPhone: vi.fn(),
      createCustomer: vi.fn(),
      updateCustomer: vi.fn(),
      getAppointments: vi.fn(),
      createAppointment: vi.fn(),
      updateAppointment: vi.fn(),
      createJob: vi.fn(),
      getJobs: vi.fn(),
      getAvailableStaffForSlot: vi.fn(),
      getStaffHours: vi.fn(),
      getStaffHoursByDay: vi.fn(),
      getStaffTimeOffForDate: vi.fn(),
      getAppointmentByManageToken: vi.fn(),
      getCustomer: vi.fn(),
      updateJob: vi.fn(),
      getRestaurantReservations: vi.fn(),
      createRestaurantReservation: vi.fn(),
      getRestaurantReservationByManageToken: vi.fn(),
      updateRestaurantReservation: vi.fn(),
      getReservationSlotCapacity: vi.fn(),
    },
  };
});

vi.mock('../storage', () => ({ storage: mockStorage }));

vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
  pool: {
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  },
}));

vi.mock('../services/webhookService', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
  default: { fireEvent: vi.fn() },
}));

vi.mock('../services/notificationService', () => ({
  default: {
    sendAppointmentConfirmation: vi.fn().mockResolvedValue(undefined),
    sendSmsOptInWelcome: vi.fn().mockResolvedValue(undefined),
  },
  sendSmsOptInWelcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/calendarService', () => ({
  CalendarService: class MockCalendarService {
    syncAppointment = vi.fn().mockResolvedValue(undefined);
  },
}));

// ────────────────────────────────────────────────────────
// Import routes after mocks
// ────────────────────────────────────────────────────────

import bookingRoutes from '../routes/bookingRoutes';

// ────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────

let app: express.Express;

function makeBusiness(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'Test Barber Shop',
    email: 'shop@test.com',
    phone: '+15551234567',
    industry: 'barber',
    type: 'salon',
    timezone: 'America/New_York',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    website: null,
    logoUrl: null,
    brandColor: null,
    accentColor: null,
    bookingSlug: 'test-barber',
    bookingEnabled: true,
    bookingLeadTimeHours: 0,  // Allow immediate bookings for testing
    bookingBufferMinutes: 15,
    bookingSlotIntervalMinutes: 30,
    description: null,
    reservationEnabled: false,
    ...overrides,
  };
}

function makeService(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    name: 'Haircut',
    description: 'Standard haircut',
    price: 25.0,
    duration: 30,
    active: true,
    ...overrides,
  };
}

function makeStaffMember(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    userId: null,
    firstName: 'Mike',
    lastName: 'Barber',
    specialty: 'Cuts',
    bio: null,
    photoUrl: null,
    active: true,
    ...overrides,
  };
}

function makeCustomer(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+15559876543',
    email: 'jane@example.com',
    smsOptIn: false,
    ...overrides,
  };
}

function makeBusinessHours(day: string, overrides: Record<string, any> = {}) {
  return {
    id: 1,
    businessId: 1,
    day,
    open: '09:00',
    close: '17:00',
    isClosed: false,
    ...overrides,
  };
}

/** Return a future date string (YYYY-MM-DD) where new Date(dateStr) in UTC midnight
 *  resolves to a weekday in America/New_York timezone.
 *
 *  IMPORTANT: The booking route does `new Date(dateStr)` which creates UTC midnight,
 *  then computes dayName in the business timezone. UTC midnight in America/New_York
 *  is the previous evening (e.g., Monday midnight UTC = Sunday 8PM ET). To avoid
 *  confusion, we pick a date that's a WEEKDAY even after the timezone shift and
 *  compute dayName exactly as the route does.
 */
function getFutureWeekday(): { dateStr: string; dayName: string } {
  const date = new Date();
  date.setDate(date.getDate() + 8); // 8 days from now (extra buffer)

  // Keep pushing forward until the date, when parsed as UTC midnight and converted
  // to America/New_York, lands on a weekday
  for (let i = 0; i < 14; i++) {
    const candidateStr = date.toISOString().split('T')[0];
    const utcMidnight = new Date(candidateStr);
    const dayInET = utcMidnight.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' }).toLowerCase();
    const isWeekend = (dayInET === 'saturday' || dayInET === 'sunday');
    if (!isWeekend) {
      return { dateStr: candidateStr, dayName: dayInET };
    }
    date.setDate(date.getDate() + 1);
  }

  // Fallback (should never happen)
  const dateStr = date.toISOString().split('T')[0];
  const routeDate = new Date(dateStr);
  const dayName = routeDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' }).toLowerCase();
  return { dateStr, dayName };
}

/** Return business hours for all 7 days — weekdays open 9-5, weekends closed.
 *  Use this when you need to guarantee the route finds matching hours
 *  regardless of which day the dateStr resolves to.
 */
function makeAllBusinessHours() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days.map((day, i) => makeBusinessHours(day, {
    id: i + 1,
    isClosed: (day === 'saturday' || day === 'sunday'),
    open: (day === 'saturday' || day === 'sunday') ? null : '09:00',
    close: (day === 'saturday' || day === 'sunday') ? null : '17:00',
  }));
}

function makeBookingPayload(overrides: Record<string, any> = {}) {
  const { dateStr } = getFutureWeekday();
  return {
    serviceId: 1,
    date: dateStr,
    time: '10:00',
    customer: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+15559876543',
      smsOptIn: false,
    },
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api', bookingRoutes);
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════
// TEST SUITES
// ════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────
// 1. GET /api/book/:slug — Business info for booking page
// ────────────────────────────────────────────────────────

describe('GET /api/book/:slug', () => {
  it('returns business info, services, staff, and hours', async () => {
    const business = makeBusiness();
    const service = makeService();
    const staff = makeStaffMember();
    const hours = [makeBusinessHours('monday')];

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getServices.mockResolvedValue([service]);
    mockStorage.getStaff.mockResolvedValue([staff]);
    mockStorage.getBusinessHours.mockResolvedValue(hours);
    mockStorage.getStaffServicesForBusiness.mockResolvedValue([]);

    const res = await supertest(app).get('/api/book/test-barber');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('business');
    expect(res.body.business).toHaveProperty('name', 'Test Barber Shop');
    expect(res.body.business).toHaveProperty('timezone', 'America/New_York');
    expect(res.body).toHaveProperty('services');
    expect(res.body.services).toHaveLength(1);
    expect(res.body.services[0]).toHaveProperty('name', 'Haircut');
    expect(res.body).toHaveProperty('staff');
    expect(res.body.staff).toHaveLength(1);
    expect(res.body).toHaveProperty('businessHours');
  });

  it('returns 404 for invalid slug', async () => {
    mockStorage.getBusinessByBookingSlug.mockResolvedValue(null);

    const res = await supertest(app).get('/api/book/nonexistent-slug');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/business not found/i);
  });

  it('returns 400 when booking is not enabled', async () => {
    const business = makeBusiness({ bookingEnabled: false });
    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);

    const res = await supertest(app).get('/api/book/test-barber');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not available/i);
  });

  it('filters out inactive services and staff', async () => {
    const business = makeBusiness();
    const activeService = makeService({ id: 1, active: true });
    const inactiveService = makeService({ id: 2, active: false, name: 'Old Service' });
    const activeStaff = makeStaffMember({ id: 1, active: true });
    const inactiveStaff = makeStaffMember({ id: 2, active: false, firstName: 'Gone' });

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getServices.mockResolvedValue([activeService, inactiveService]);
    mockStorage.getStaff.mockResolvedValue([activeStaff, inactiveStaff]);
    mockStorage.getBusinessHours.mockResolvedValue([]);
    mockStorage.getStaffServicesForBusiness.mockResolvedValue([]);

    const res = await supertest(app).get('/api/book/test-barber');

    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(1);
    expect(res.body.staff).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────
// 2. GET /api/book/:slug/slots — Available time slots
// ────────────────────────────────────────────────────────

describe('GET /api/book/:slug/slots', () => {
  it('returns available slots for a valid date', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const { dateStr, dayName } = getFutureWeekday();

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(makeService());
    mockStorage.getBusinessHours.mockResolvedValue([makeBusinessHours(dayName)]);
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([makeStaffMember()]);
    mockStorage.getStaffHoursByDay.mockResolvedValue(null);
    mockStorage.getStaffTimeOffForDate.mockResolvedValue([]);
    mockStorage.getStaffServices.mockResolvedValue([]);

    const res = await supertest(app)
      .get(`/api/book/test-barber/slots?date=${dateStr}&serviceId=1`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('slots');
    expect(Array.isArray(res.body.slots)).toBe(true);
  });

  it('returns 400 when date is missing', async () => {
    const res = await supertest(app).get('/api/book/test-barber/slots');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date is required/i);
  });

  it('returns 404 for invalid slug', async () => {
    mockStorage.getBusinessByBookingSlug.mockResolvedValue(null);

    const res = await supertest(app)
      .get('/api/book/nonexistent/slots?date=2026-05-01');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns empty slots for a closed day', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const { dateStr, dayName } = getFutureWeekday();

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(makeService());
    // Return hours where the target day is closed
    mockStorage.getBusinessHours.mockResolvedValue([
      makeBusinessHours(dayName, { isClosed: true }),
    ]);

    const res = await supertest(app)
      .get(`/api/book/test-barber/slots?date=${dateStr}&serviceId=1`);

    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
    expect(res.body.message).toMatch(/closed/i);
  });
});

// ────────────────────────────────────────────────────────
// 3. POST /api/book/:slug — Create a booking
// ────────────────────────────────────────────────────────

describe('POST /api/book/:slug', () => {
  it('creates appointment successfully with new customer', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const customer = makeCustomer();
    const appointment = { id: 100, businessId: 1, customerId: 1, startDate: new Date(), endDate: new Date(), status: 'scheduled' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(null); // New customer
    mockStorage.createCustomer.mockResolvedValue(customer);
    mockStorage.getAppointments.mockResolvedValue([]); // No duplicates or conflicts
    mockStorage.getAvailableStaffForSlot.mockResolvedValue([makeStaffMember()]);
    mockStorage.getStaffServices.mockResolvedValue([]); // Can do all services
    mockStorage.createAppointment.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue({ ...appointment, manageToken: 'abc' });
    mockStorage.createJob.mockResolvedValue({ id: 50 });

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload());

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('appointment');
    expect(res.body.appointment).toHaveProperty('id', 100);
    expect(res.body).toHaveProperty('manageUrl');
    expect(res.body).toHaveProperty('manageToken');
    expect(mockStorage.createCustomer).toHaveBeenCalledOnce();
    expect(mockStorage.createAppointment).toHaveBeenCalledOnce();
  });

  it('reuses existing customer by phone', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const existingCustomer = makeCustomer({ id: 5, smsOptIn: false });
    const appointment = { id: 101, businessId: 1, customerId: 5, startDate: new Date(), endDate: new Date(), status: 'scheduled' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(existingCustomer);
    mockStorage.updateCustomer.mockResolvedValue(existingCustomer);
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getAvailableStaffForSlot.mockResolvedValue([makeStaffMember()]);
    mockStorage.getStaffServices.mockResolvedValue([]);
    mockStorage.createAppointment.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue(appointment);
    mockStorage.createJob.mockResolvedValue({ id: 51 });

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockStorage.createCustomer).not.toHaveBeenCalled();
    expect(mockStorage.updateCustomer).toHaveBeenCalledOnce();
  });

  it('returns 400 for missing required fields (no customer)', async () => {
    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send({
        serviceId: 1,
        date: '2026-05-01',
        time: '10:00',
        // Missing customer object
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid booking data/i);
  });

  it('returns 400 for invalid phone number format', async () => {
    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload({
        customer: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@test.com',
          phone: 'not-a-phone',
        },
      }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid booking data/i);
  });

  it('returns 400 for invalid email', async () => {
    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload({
        customer: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'not-an-email',
          phone: '+15559876543',
        },
      }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid booking data/i);
  });

  it('returns 404 for nonexistent business slug', async () => {
    mockStorage.getBusinessByBookingSlug.mockResolvedValue(null);

    const res = await supertest(app)
      .post('/api/book/nonexistent')
      .send(makeBookingPayload());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 for invalid service (wrong business)', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const wrongService = makeService({ businessId: 999 }); // Different business

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(wrongService);

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid service/i);
  });

  it('returns 409 for duplicate booking same customer same day', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const customer = makeCustomer({ id: 5 });

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(customer);
    mockStorage.updateCustomer.mockResolvedValue(customer);
    // Return an existing appointment for this customer on the same day
    mockStorage.getAppointments.mockResolvedValue([
      {
        id: 200,
        businessId: 1,
        customerId: 5,
        staffId: 1,
        serviceId: 1,
        startDate: new Date(),
        endDate: new Date(),
        status: 'scheduled',
      },
    ]);

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload());

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already have an appointment/i);
  });

  it('returns 409 for double-booked slot (conflicting time)', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService({ duration: 60 });
    const customer = makeCustomer({ id: 5 });
    const staff = makeStaffMember({ id: 1 });
    const { dateStr } = getFutureWeekday();

    // Parse the same date/time as the booking to create an overlapping appointment
    const [year, month, day] = dateStr.split('-').map(Number);
    const conflictStart = new Date(year, month - 1, day, 10, 0); // Same time: 10:00
    const conflictEnd = new Date(year, month - 1, day, 11, 0);

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(customer);
    mockStorage.updateCustomer.mockResolvedValue(customer);
    // First call for duplicate check returns empty, second call for conflict check returns overlap
    mockStorage.getAppointments
      .mockResolvedValueOnce([]) // Duplicate check — no duplicate
      .mockResolvedValueOnce([   // Conflict check — overlap exists
        {
          id: 300,
          businessId: 1,
          customerId: 99, // Different customer
          staffId: 1,
          serviceId: 1,
          startDate: conflictStart,
          endDate: conflictEnd,
          status: 'scheduled',
        },
      ]);
    mockStorage.getAvailableStaffForSlot.mockResolvedValue([staff]);
    mockStorage.getStaffServices.mockResolvedValue([]);

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload({ date: dateStr, time: '10:00' }));

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/just booked/i);
  });

  it('handles staff assignment correctly when staffId is provided', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const customer = makeCustomer();
    const appointment = { id: 102, businessId: 1, customerId: 1, startDate: new Date(), endDate: new Date(), status: 'scheduled' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(null);
    mockStorage.createCustomer.mockResolvedValue(customer);
    mockStorage.getAppointments.mockResolvedValue([]);
    // Staff services check: return the serviceId meaning they can do it
    mockStorage.getStaffServices.mockResolvedValue([1]);
    mockStorage.createAppointment.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue(appointment);
    mockStorage.createJob.mockResolvedValue({ id: 52 });

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload({ staffId: 1 }));

    expect(res.status).toBe(201);
    expect(mockStorage.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 1 })
    );
  });

  it('returns 400 when staff cannot perform the requested service', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService({ id: 1 });

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(null);
    mockStorage.createCustomer.mockResolvedValue(makeCustomer());
    mockStorage.getAppointments.mockResolvedValue([]);
    // Staff can only do service 2, not service 1
    mockStorage.getStaffServices.mockResolvedValue([2]);
    mockStorage.getStaffMember.mockResolvedValue(makeStaffMember());

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload({ staffId: 1 }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/doesn't perform/i);
  });

  it('creates a linked job on successful booking', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const customer = makeCustomer();
    const appointment = { id: 103, businessId: 1, customerId: 1, startDate: new Date(), endDate: new Date(), status: 'scheduled' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(null);
    mockStorage.createCustomer.mockResolvedValue(customer);
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getAvailableStaffForSlot.mockResolvedValue([makeStaffMember()]);
    mockStorage.getStaffServices.mockResolvedValue([]);
    mockStorage.createAppointment.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue(appointment);
    mockStorage.createJob.mockResolvedValue({ id: 53 });

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload());

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId', 53);
    expect(mockStorage.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 1,
        customerId: 1,
        appointmentId: 103,
        status: 'pending',
      })
    );
  });

  it('auto-assigns staff when no staffId is provided', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const customer = makeCustomer();
    const staff = makeStaffMember({ id: 7 });
    const appointment = { id: 104, businessId: 1, customerId: 1, staffId: 7, startDate: new Date(), endDate: new Date(), status: 'scheduled' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(null);
    mockStorage.createCustomer.mockResolvedValue(customer);
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getAvailableStaffForSlot.mockResolvedValue([staff]);
    mockStorage.getStaffServices.mockResolvedValue([]); // Can do all services
    mockStorage.createAppointment.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue(appointment);
    mockStorage.createJob.mockResolvedValue({ id: 54 });

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload()); // No staffId

    expect(res.status).toBe(201);
    expect(mockStorage.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 7 })
    );
  });

  it('includes timezone abbreviation in response', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const customer = makeCustomer();
    const appointment = { id: 105, businessId: 1, customerId: 1, startDate: new Date(), endDate: new Date(), status: 'scheduled' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(null);
    mockStorage.createCustomer.mockResolvedValue(customer);
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getAvailableStaffForSlot.mockResolvedValue([makeStaffMember()]);
    mockStorage.getStaffServices.mockResolvedValue([]);
    mockStorage.createAppointment.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue(appointment);
    mockStorage.createJob.mockResolvedValue({ id: 55 });

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload());

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('timezoneAbbr');
    expect(res.body).toHaveProperty('message');
  });

  it('rejects bookings that violate lead time (past dates)', async () => {
    // Business requires 24 hours notice
    const business = makeBusiness({ bookingLeadTimeHours: 24 });
    const service = makeService();

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);

    // Use today's date — within the 24-hour lead time window
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload({ date: todayStr, time: '10:00' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/hours notice/i);
  });
});

// ────────────────────────────────────────────────────────
// 4. GET /api/book/:slug — Staff and hours in response
// ────────────────────────────────────────────────────────

describe('GET /api/book/:slug (staff and hours detail)', () => {
  it('returns available staff with id, name, specialty, and photo', async () => {
    const business = makeBusiness();
    const staff = [
      makeStaffMember({ id: 1, firstName: 'Mike', lastName: 'Barber', specialty: 'Fades', photoUrl: 'https://example.com/mike.jpg' }),
      makeStaffMember({ id: 2, firstName: 'Sarah', lastName: 'Stylist', specialty: 'Color', bio: 'Expert colorist' }),
    ];

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getServices.mockResolvedValue([makeService()]);
    mockStorage.getStaff.mockResolvedValue(staff);
    mockStorage.getBusinessHours.mockResolvedValue([makeBusinessHours('monday')]);
    mockStorage.getStaffServicesForBusiness.mockResolvedValue([]);

    const res = await supertest(app).get('/api/book/test-barber');

    expect(res.status).toBe(200);
    expect(res.body.staff).toHaveLength(2);
    expect(res.body.staff[0]).toHaveProperty('id', 1);
    expect(res.body.staff[0]).toHaveProperty('firstName', 'Mike');
    expect(res.body.staff[0]).toHaveProperty('lastName', 'Barber');
    expect(res.body.staff[0]).toHaveProperty('specialty', 'Fades');
    expect(res.body.staff[1]).toHaveProperty('firstName', 'Sarah');
  });

  it('returns business hours for all 7 days', async () => {
    const business = makeBusiness();
    const allHours = [
      makeBusinessHours('monday'),
      makeBusinessHours('tuesday'),
      makeBusinessHours('wednesday'),
      makeBusinessHours('thursday'),
      makeBusinessHours('friday'),
      makeBusinessHours('saturday', { isClosed: true, open: null, close: null }),
      makeBusinessHours('sunday', { isClosed: true, open: null, close: null }),
    ];

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getServices.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([]);
    mockStorage.getBusinessHours.mockResolvedValue(allHours);
    mockStorage.getStaffServicesForBusiness.mockResolvedValue([]);

    const res = await supertest(app).get('/api/book/test-barber');

    expect(res.status).toBe(200);
    expect(res.body.businessHours).toHaveLength(7);
    // Verify weekday hours
    const monday = res.body.businessHours.find((h: any) => h.day === 'monday');
    expect(monday.open).toBe('09:00');
    expect(monday.close).toBe('17:00');
    expect(monday.isClosed).toBe(false);
    // Verify weekend closed
    const saturday = res.body.businessHours.find((h: any) => h.day === 'saturday');
    expect(saturday.isClosed).toBe(true);
  });

  it('includes staff-service assignments map', async () => {
    const business = makeBusiness();
    const staff = [makeStaffMember({ id: 1 }), makeStaffMember({ id: 2, firstName: 'Sarah' })];
    const services = [makeService({ id: 10 }), makeService({ id: 20, name: 'Beard Trim' })];

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getServices.mockResolvedValue(services);
    mockStorage.getStaff.mockResolvedValue(staff);
    mockStorage.getBusinessHours.mockResolvedValue([]);
    mockStorage.getStaffServicesForBusiness.mockResolvedValue([
      { staffId: 1, serviceId: 10 },
      { staffId: 1, serviceId: 20 },
      { staffId: 2, serviceId: 10 },
    ]);

    const res = await supertest(app).get('/api/book/test-barber');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('staffServices');
    // Staff 1 can do services 10 and 20
    expect(res.body.staffServices['1']).toEqual([10, 20]);
    // Staff 2 can only do service 10
    expect(res.body.staffServices['2']).toEqual([10]);
  });
});

// ────────────────────────────────────────────────────────
// 5. Availability — staff time-off blocks slots
// ────────────────────────────────────────────────────────

describe('GET /api/book/:slug/slots (staff time-off)', () => {
  it('marks all slots unavailable when only staff member has time-off', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const { dateStr } = getFutureWeekday();

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(makeService());
    // Use all 7 days to avoid timezone day-name mismatch
    mockStorage.getBusinessHours.mockResolvedValue(makeAllBusinessHours());
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([makeStaffMember()]);
    // Staff has all-day time off
    mockStorage.getStaffTimeOffForDate.mockResolvedValue([
      { id: 1, staffId: 1, businessId: 1, startDate: dateStr, endDate: dateStr, reason: 'Vacation', allDay: true, note: null },
    ]);
    mockStorage.getStaffHoursByDay.mockResolvedValue(null);
    mockStorage.getStaffServices.mockResolvedValue([]);

    const res = await supertest(app)
      .get(`/api/book/test-barber/slots?date=${dateStr}&serviceId=1`);

    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeGreaterThan(0);
    // Every slot should be unavailable
    const availableSlots = res.body.slots.filter((s: any) => s.available);
    expect(availableSlots).toHaveLength(0);
  });

  it('shows slots available when one staff has time-off but another does not', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const { dateStr } = getFutureWeekday();

    const staffA = makeStaffMember({ id: 1, firstName: 'Mike' });
    const staffB = makeStaffMember({ id: 2, firstName: 'Sarah' });

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(makeService());
    // Use all 7 days to avoid timezone day-name mismatch
    mockStorage.getBusinessHours.mockResolvedValue(makeAllBusinessHours());
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([staffA, staffB]);
    // Staff A has time off, Staff B does not
    mockStorage.getStaffTimeOffForDate.mockImplementation(async (staffId: number) => {
      if (staffId === 1) return [{ id: 1, staffId: 1, businessId: 1, startDate: dateStr, endDate: dateStr, reason: 'Sick', allDay: true, note: null }];
      return [];
    });
    mockStorage.getStaffHoursByDay.mockResolvedValue(null);
    mockStorage.getStaffServices.mockResolvedValue([]);

    const res = await supertest(app)
      .get(`/api/book/test-barber/slots?date=${dateStr}&serviceId=1`);

    expect(res.status).toBe(200);
    // Some slots should be available (Staff B is working)
    const availableSlots = res.body.slots.filter((s: any) => s.available);
    expect(availableSlots.length).toBeGreaterThan(0);
    // Available slots should only list Staff B (id: 2)
    for (const slot of availableSlots) {
      expect(slot.staffAvailable).not.toContain(1);
      expect(slot.staffAvailable).toContain(2);
    }
  });

  it('respects individual staff hours when determining slot availability', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const { dateStr } = getFutureWeekday();

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(makeService({ duration: 30 }));
    mockStorage.getBusinessHours.mockResolvedValue(makeAllBusinessHours()); // business open 9-5 weekdays
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([makeStaffMember()]);
    mockStorage.getStaffTimeOffForDate.mockResolvedValue([]);
    // Staff only works 10-14 (not full business day)
    mockStorage.getStaffHoursByDay.mockResolvedValue({
      id: 1,
      staffId: 1,
      day: 'monday',
      startTime: '10:00',
      endTime: '14:00',
      isOff: false,
    });
    mockStorage.getStaffServices.mockResolvedValue([]);

    const res = await supertest(app)
      .get(`/api/book/test-barber/slots?date=${dateStr}&serviceId=1`);

    expect(res.status).toBe(200);
    // Slots before 10:00 and after 14:00 should be unavailable
    const slot9am = res.body.slots.find((s: any) => s.time === '09:00');
    const slot10am = res.body.slots.find((s: any) => s.time === '10:00');
    const slot1330 = res.body.slots.find((s: any) => s.time === '13:30');
    const slot1400 = res.body.slots.find((s: any) => s.time === '14:00');

    if (slot9am) expect(slot9am.available).toBe(false);   // Before staff hours
    if (slot10am) expect(slot10am.available).toBe(true);   // Within staff hours
    if (slot1330) expect(slot1330.available).toBe(true);   // Within staff hours
    // 14:00 slot + 30 min service = ends at 14:30, but staff ends at 14:00 — should be unavailable
    if (slot1400) expect(slot1400.available).toBe(false);
  });

  it('marks staff as unavailable when their individual day is off', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const { dateStr } = getFutureWeekday();

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(makeService());
    mockStorage.getBusinessHours.mockResolvedValue(makeAllBusinessHours());
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([makeStaffMember()]);
    mockStorage.getStaffTimeOffForDate.mockResolvedValue([]);
    // Staff has this specific day marked as off in their schedule
    mockStorage.getStaffHoursByDay.mockResolvedValue({ isOff: true });
    mockStorage.getStaffServices.mockResolvedValue([]);

    const res = await supertest(app)
      .get(`/api/book/test-barber/slots?date=${dateStr}&serviceId=1`);

    expect(res.status).toBe(200);
    const availableSlots = res.body.slots.filter((s: any) => s.available);
    expect(availableSlots).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────
// 6. Manage appointment via token (customer self-service)
// ────────────────────────────────────────────────────────

describe('GET /api/book/:slug/manage/:token', () => {
  it('returns appointment details for valid manage token', async () => {
    const business = makeBusiness();
    const appointment = {
      id: 1,
      businessId: 1,
      customerId: 1,
      staffId: 1,
      serviceId: 1,
      startDate: new Date('2026-06-15T14:00:00Z'),
      endDate: new Date('2026-06-15T14:30:00Z'),
      status: 'scheduled',
      notes: 'Online booking',
      manageToken: 'valid-token-abc',
    };
    const customer = makeCustomer();
    const service = makeService();
    const staff = makeStaffMember();

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getAppointmentByManageToken.mockResolvedValue(appointment);
    mockStorage.getCustomer.mockResolvedValue(customer);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getStaffMember.mockResolvedValue(staff);

    const res = await supertest(app).get('/api/book/test-barber/manage/valid-token-abc');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('appointment');
    expect(res.body.appointment).toHaveProperty('id', 1);
    expect(res.body.appointment).toHaveProperty('status', 'scheduled');
    expect(res.body).toHaveProperty('service');
    expect(res.body.service).toHaveProperty('name', 'Haircut');
    expect(res.body).toHaveProperty('staff', 'Mike Barber');
    expect(res.body).toHaveProperty('customer');
    expect(res.body.customer).toHaveProperty('firstName', 'Jane');
    expect(res.body).toHaveProperty('business');
    expect(res.body.business).toHaveProperty('name', 'Test Barber Shop');
  });

  it('returns 404 for invalid manage token', async () => {
    mockStorage.getBusinessByBookingSlug.mockResolvedValue(makeBusiness());
    mockStorage.getAppointmentByManageToken.mockResolvedValue(null);

    const res = await supertest(app).get('/api/book/test-barber/manage/invalid-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 when appointment belongs to a different business', async () => {
    const business = makeBusiness();
    const appointment = {
      id: 1,
      businessId: 999, // Different business
      customerId: 1,
      staffId: 1,
      serviceId: 1,
      startDate: new Date(),
      endDate: new Date(),
      status: 'scheduled',
      notes: null,
      manageToken: 'cross-biz-token',
    };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getAppointmentByManageToken.mockResolvedValue(appointment);

    const res = await supertest(app).get('/api/book/test-barber/manage/cross-biz-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('POST /api/book/:slug/manage/:token/cancel', () => {
  it('cancels an appointment via manage token', async () => {
    const business = makeBusiness();
    const appointment = {
      id: 1,
      businessId: 1,
      customerId: 1,
      staffId: 1,
      serviceId: 1,
      startDate: new Date(),
      endDate: new Date(),
      status: 'scheduled',
      notes: 'Online booking',
      manageToken: 'cancel-token',
    };
    const cancelledAppointment = { ...appointment, status: 'cancelled' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getAppointmentByManageToken.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue(cancelledAppointment);
    mockStorage.getJobs.mockResolvedValue([]);

    const res = await supertest(app)
      .post('/api/book/test-barber/manage/cancel-token/cancel');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.message).toMatch(/cancelled/i);
    expect(mockStorage.updateAppointment).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('returns 400 for already cancelled appointment', async () => {
    mockStorage.getBusinessByBookingSlug.mockResolvedValue(makeBusiness());
    mockStorage.getAppointmentByManageToken.mockResolvedValue({
      id: 1, businessId: 1, status: 'cancelled', manageToken: 'cancel-token',
    });

    const res = await supertest(app)
      .post('/api/book/test-barber/manage/cancel-token/cancel');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been cancelled/i);
  });

  it('returns 400 for completed appointment', async () => {
    mockStorage.getBusinessByBookingSlug.mockResolvedValue(makeBusiness());
    mockStorage.getAppointmentByManageToken.mockResolvedValue({
      id: 1, businessId: 1, status: 'completed', manageToken: 'cancel-token',
    });

    const res = await supertest(app)
      .post('/api/book/test-barber/manage/cancel-token/cancel');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/completed/i);
  });

  it('also cancels the linked job when cancelling an appointment', async () => {
    const business = makeBusiness();
    const appointment = {
      id: 1, businessId: 1, customerId: 1, staffId: 1, serviceId: 1,
      startDate: new Date(), endDate: new Date(), status: 'scheduled',
      notes: '', manageToken: 'cancel-job-token',
    };
    const linkedJob = { id: 50, businessId: 1, customerId: 1, appointmentId: 1, status: 'pending' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getAppointmentByManageToken.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue({ ...appointment, status: 'cancelled' });
    mockStorage.getJobs.mockResolvedValue([linkedJob]);
    mockStorage.updateJob.mockResolvedValue({ ...linkedJob, status: 'cancelled' });

    const res = await supertest(app)
      .post('/api/book/test-barber/manage/cancel-job-token/cancel');

    expect(res.status).toBe(200);
    expect(mockStorage.updateJob).toHaveBeenCalledWith(50, { status: 'cancelled' });
  });
});

// ────────────────────────────────────────────────────────
// 7. Rapid/spam booking prevention
// ────────────────────────────────────────────────────────

describe('Booking spam prevention', () => {
  it('prevents duplicate booking for same customer on same day (409)', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const customer = makeCustomer({ id: 5, phone: '+15559876543' });

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(customer);
    mockStorage.updateCustomer.mockResolvedValue(customer);
    // Existing appointment on that day
    mockStorage.getAppointments.mockResolvedValue([{
      id: 999, businessId: 1, customerId: 5, staffId: 1, serviceId: 1,
      startDate: new Date(), endDate: new Date(), status: 'scheduled',
    }]);

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload());

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already have an appointment/i);
  });

  it('allows booking if previous appointment on same day was cancelled', async () => {
    const business = makeBusiness({ bookingLeadTimeHours: 0 });
    const service = makeService();
    const customer = makeCustomer({ id: 5, phone: '+15559876543' });
    const appointment = { id: 106, businessId: 1, customerId: 5, startDate: new Date(), endDate: new Date(), status: 'scheduled' };

    mockStorage.getBusinessByBookingSlug.mockResolvedValue(business);
    mockStorage.getService.mockResolvedValue(service);
    mockStorage.getCustomerByPhone.mockResolvedValue(customer);
    mockStorage.updateCustomer.mockResolvedValue(customer);
    // Previous appointment exists but was cancelled
    mockStorage.getAppointments.mockResolvedValue([{
      id: 999, businessId: 1, customerId: 5, staffId: 1, serviceId: 1,
      startDate: new Date(), endDate: new Date(), status: 'cancelled', // Cancelled!
    }]);
    mockStorage.getAvailableStaffForSlot.mockResolvedValue([makeStaffMember()]);
    mockStorage.getStaffServices.mockResolvedValue([]);
    mockStorage.createAppointment.mockResolvedValue(appointment);
    mockStorage.updateAppointment.mockResolvedValue(appointment);
    mockStorage.createJob.mockResolvedValue({ id: 56 });

    const res = await supertest(app)
      .post('/api/book/test-barber')
      .send(makeBookingPayload());

    // Should succeed because the previous appointment was cancelled
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
