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
      getAvailableStaffForSlot: vi.fn(),
      getStaffHours: vi.fn(),
      getStaffTimeOffForDate: vi.fn(),
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

/** Return a future date string (YYYY-MM-DD) guaranteed to be a weekday */
function getFutureWeekday(): { dateStr: string; dayName: string } {
  const date = new Date();
  date.setDate(date.getDate() + 7); // 7 days from now
  // If it lands on weekend, push to Monday
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  const dateStr = date.toISOString().split('T')[0];
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' }).toLowerCase();
  return { dateStr, dayName };
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
    mockStorage.getStaffHours.mockResolvedValue([]);
    mockStorage.getStaffTimeOffForDate.mockResolvedValue([]);
    mockStorage.getAvailableStaffForSlot.mockResolvedValue([makeStaffMember()]);

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
});
