import { describe, it, expect } from 'vitest';

import {
  // Table definitions
  businesses,
  users,
  customers,
  staff,
  appointments,
  jobs,
  invoices,
  callLogs,
  subscriptionPlans,
  services,
  quotes,
  webhooks,
  overageCharges,
  businessGroups,
  businessPhoneNumbers,
  agentSettings,
  smsConversations,
  auditLogs,
  // Insert schemas
  insertBusinessSchema,
  insertCustomerSchema,
  insertUserSchema,
  insertStaffSchema,
  insertAppointmentSchema,
  insertSubscriptionPlanSchema,
} from './schema';

// ── Table export existence checks ─────────────────────────────────────────
describe('Schema table exports', () => {
  it('exports the businesses table', () => {
    expect(businesses).toBeDefined();
    // Drizzle pgTable objects expose column definitions
    expect(businesses.id).toBeDefined();
    expect(businesses.name).toBeDefined();
    expect(businesses.email).toBeDefined();
  });

  it('exports the users table', () => {
    expect(users).toBeDefined();
    expect(users.id).toBeDefined();
    expect(users.username).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.password).toBeDefined();
  });

  it('exports the customers table', () => {
    expect(customers).toBeDefined();
    expect(customers.id).toBeDefined();
    expect(customers.firstName).toBeDefined();
    expect(customers.lastName).toBeDefined();
    expect(customers.phone).toBeDefined();
  });

  it('exports the staff table', () => {
    expect(staff).toBeDefined();
    expect(staff.id).toBeDefined();
    expect(staff.firstName).toBeDefined();
    expect(staff.lastName).toBeDefined();
  });

  it('exports the appointments table', () => {
    expect(appointments).toBeDefined();
    expect(appointments.id).toBeDefined();
    expect(appointments.startDate).toBeDefined();
    expect(appointments.endDate).toBeDefined();
  });

  it('exports the jobs table', () => {
    expect(jobs).toBeDefined();
    expect(jobs.id).toBeDefined();
    expect(jobs.title).toBeDefined();
  });

  it('exports the invoices table', () => {
    expect(invoices).toBeDefined();
    expect(invoices.id).toBeDefined();
    expect(invoices.amount).toBeDefined();
  });

  it('exports the callLogs table', () => {
    expect(callLogs).toBeDefined();
    expect(callLogs.id).toBeDefined();
    expect(callLogs.callDuration).toBeDefined();
  });

  it('exports the subscriptionPlans table', () => {
    expect(subscriptionPlans).toBeDefined();
    expect(subscriptionPlans.id).toBeDefined();
    expect(subscriptionPlans.price).toBeDefined();
    expect(subscriptionPlans.maxCallMinutes).toBeDefined();
  });

  it('exports the services table', () => {
    expect(services).toBeDefined();
    expect(services.id).toBeDefined();
    expect(services.name).toBeDefined();
  });

  it('exports the quotes table', () => {
    expect(quotes).toBeDefined();
    expect(quotes.id).toBeDefined();
  });

  it('exports the webhooks table', () => {
    expect(webhooks).toBeDefined();
    expect(webhooks.id).toBeDefined();
    expect(webhooks.url).toBeDefined();
  });

  it('exports the overageCharges table', () => {
    expect(overageCharges).toBeDefined();
    expect(overageCharges.id).toBeDefined();
    expect(overageCharges.overageMinutes).toBeDefined();
  });

  it('exports the businessGroups table', () => {
    expect(businessGroups).toBeDefined();
    expect(businessGroups.id).toBeDefined();
    expect(businessGroups.name).toBeDefined();
  });

  it('exports the businessPhoneNumbers table', () => {
    expect(businessPhoneNumbers).toBeDefined();
    expect(businessPhoneNumbers.id).toBeDefined();
  });

  it('exports the agentSettings table', () => {
    expect(agentSettings).toBeDefined();
    expect(agentSettings.id).toBeDefined();
    expect(agentSettings.agentType).toBeDefined();
  });

  it('exports the smsConversations table', () => {
    expect(smsConversations).toBeDefined();
    expect(smsConversations.id).toBeDefined();
  });

  it('exports the auditLogs table', () => {
    expect(auditLogs).toBeDefined();
    expect(auditLogs.id).toBeDefined();
    expect(auditLogs.action).toBeDefined();
  });
});

// ── insertBusinessSchema validation ───────────────────────────────────────
describe('insertBusinessSchema', () => {
  it('is a valid zod schema', () => {
    expect(insertBusinessSchema).toBeDefined();
    expect(typeof insertBusinessSchema.parse).toBe('function');
    expect(typeof insertBusinessSchema.safeParse).toBe('function');
  });

  it('validates a minimal valid business (name + email required)', () => {
    const result = insertBusinessSchema.safeParse({
      name: 'Test Business',
      email: 'test@example.com',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Test Business');
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('rejects when required field "name" is missing', () => {
    const result = insertBusinessSchema.safeParse({
      email: 'test@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('rejects when required field "email" is missing', () => {
    const result = insertBusinessSchema.safeParse({
      name: 'Test Business',
    });

    expect(result.success).toBe(false);
  });

  it('accepts optional fields like phone, address, city, state, zip', () => {
    const result = insertBusinessSchema.safeParse({
      name: 'Full Business',
      email: 'full@example.com',
      phone: '555-123-4567',
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      website: 'https://example.com',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('555-123-4567');
      expect(result.data.city).toBe('Springfield');
    }
  });

  it('rejects when email is not a string type', () => {
    const result = insertBusinessSchema.safeParse({
      name: 'Bad Email Biz',
      email: 12345, // wrong type
    });

    expect(result.success).toBe(false);
  });

  it('rejects when name is not a string type', () => {
    const result = insertBusinessSchema.safeParse({
      name: null,
      email: 'test@example.com',
    });

    expect(result.success).toBe(false);
  });
});

// ── insertCustomerSchema validation ───────────────────────────────────────
describe('insertCustomerSchema', () => {
  it('is a valid zod schema', () => {
    expect(insertCustomerSchema).toBeDefined();
    expect(typeof insertCustomerSchema.parse).toBe('function');
  });

  it('validates a complete customer with required fields', () => {
    const result = insertCustomerSchema.safeParse({
      businessId: 1,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+15551234567',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('John');
      expect(result.data.phone).toBe('+15551234567');
    }
  });

  it('rejects when phone is missing (required field)', () => {
    const result = insertCustomerSchema.safeParse({
      businessId: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      // phone is missing
    });

    expect(result.success).toBe(false);
  });

  it('rejects when firstName is missing', () => {
    const result = insertCustomerSchema.safeParse({
      businessId: 1,
      lastName: 'Doe',
      phone: '+15551234567',
    });

    expect(result.success).toBe(false);
  });

  it('rejects when lastName is missing', () => {
    const result = insertCustomerSchema.safeParse({
      businessId: 1,
      firstName: 'Jane',
      phone: '+15551234567',
    });

    expect(result.success).toBe(false);
  });

  it('rejects when businessId is missing', () => {
    const result = insertCustomerSchema.safeParse({
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+15551234567',
    });

    expect(result.success).toBe(false);
  });

  it('accepts optional fields like email, address, birthday, smsOptIn', () => {
    const result = insertCustomerSchema.safeParse({
      businessId: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+15559876543',
      email: 'jane@example.com',
      address: '456 Oak Ave',
      city: 'Portland',
      state: 'OR',
      zip: '97201',
      birthday: '03-15',
      smsOptIn: true,
      marketingOptIn: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('jane@example.com');
      expect(result.data.birthday).toBe('03-15');
      expect(result.data.smsOptIn).toBe(true);
    }
  });

  it('rejects when phone is a non-string type', () => {
    const result = insertCustomerSchema.safeParse({
      businessId: 1,
      firstName: 'Bob',
      lastName: 'Smith',
      phone: 5551234567, // number instead of string
    });

    expect(result.success).toBe(false);
  });
});

// ── insertUserSchema validation ───────────────────────────────────────────
describe('insertUserSchema', () => {
  it('validates a complete user with required fields', () => {
    const result = insertUserSchema.safeParse({
      username: 'johndoe',
      email: 'john@example.com',
      password: 'securepassword123',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('johndoe');
      expect(result.data.email).toBe('john@example.com');
    }
  });

  it('rejects when username is missing', () => {
    const result = insertUserSchema.safeParse({
      email: 'john@example.com',
      password: 'password123',
    });

    expect(result.success).toBe(false);
  });

  it('rejects when password is missing', () => {
    const result = insertUserSchema.safeParse({
      username: 'johndoe',
      email: 'john@example.com',
    });

    expect(result.success).toBe(false);
  });
});

// ── insertStaffSchema validation ──────────────────────────────────────────
describe('insertStaffSchema', () => {
  it('validates a valid staff member', () => {
    const result = insertStaffSchema.safeParse({
      businessId: 1,
      firstName: 'Mike',
      lastName: 'Johnson',
    });

    expect(result.success).toBe(true);
  });

  it('rejects when lastName is missing (required for disambiguation)', () => {
    const result = insertStaffSchema.safeParse({
      businessId: 1,
      firstName: 'Mike',
    });

    expect(result.success).toBe(false);
  });
});

// ── insertSubscriptionPlanSchema validation ───────────────────────────────
describe('insertSubscriptionPlanSchema', () => {
  it('validates a complete subscription plan', () => {
    const result = insertSubscriptionPlanSchema.safeParse({
      name: 'Professional',
      price: '79.00',
      interval: 'monthly',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Professional');
      expect(result.data.price).toBe('79.00');
      expect(result.data.interval).toBe('monthly');
    }
  });

  it('rejects when price is missing', () => {
    const result = insertSubscriptionPlanSchema.safeParse({
      name: 'Incomplete Plan',
      interval: 'monthly',
    });

    expect(result.success).toBe(false);
  });

  it('rejects when interval is missing', () => {
    const result = insertSubscriptionPlanSchema.safeParse({
      name: 'No Interval Plan',
      price: '49.00',
    });

    expect(result.success).toBe(false);
  });

  it('accepts optional fields like description, planTier, maxCallMinutes', () => {
    const result = insertSubscriptionPlanSchema.safeParse({
      name: 'Enterprise',
      price: '299.00',
      interval: 'monthly',
      description: 'Full-featured enterprise plan',
      planTier: 'enterprise',
      maxCallMinutes: 2000,
      overageRatePerMinute: '0.08',
      maxStaff: 50,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxCallMinutes).toBe(2000);
      expect(result.data.overageRatePerMinute).toBe('0.08');
    }
  });
});
