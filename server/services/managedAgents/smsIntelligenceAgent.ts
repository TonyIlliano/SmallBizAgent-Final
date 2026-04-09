/**
 * SMS Intelligence Agent — Custom Tool Handlers
 *
 * Handles inbound customer SMS that need AI reasoning:
 * freeform text, ambiguous intent, multi-turn rescheduling,
 * multi-appointment disambiguation, campaign replies.
 *
 * CRITICAL: All SMS sending goes through twilioService.sendSms()
 * for TCPA compliance (suppression list, opt-in checks, sanitization).
 */

import { storage } from '../../storage';

export const SMS_AGENT_SYSTEM = `You are the SMS Intelligence agent for SmallBizAgent. You handle inbound
customer SMS replies that require AI reasoning.

When a customer texts a reply, you:
1. Load their context (who they are, what appointments they have, conversation history)
2. Classify the intent (confirm, cancel, reschedule, question, complaint, campaign reply)
3. Take the appropriate action using available tools
4. Compose and send a response SMS

CRITICAL SMS COMPLIANCE RULES:
- NEVER send SMS to customers without smsOptIn = true
- ALWAYS check suppression list via checkSmsCompliance before sending
- ALWAYS check engagement lock before sending
- Marketing SMS MUST check marketingOptIn (not just smsOptIn)
- All marketing SMS MUST include "Reply STOP to unsubscribe"
- STOP keyword = opt out of marketing only, NOT transactional
- All SMS goes through sendSms tool (handles suppression/sanitization)

For RESCHEDULE:
- Parse natural date/time ("Thursday at 3pm")
- Check slot availability before confirming
- If requested slot is taken, offer 2-3 alternatives
- Update the appointment record directly

For multi-appointment disambiguation:
- If customer has 2+ upcoming appointments, list them numbered
- Ask which one they mean before taking action

Keep SMS responses short (under 160 chars when possible). Be friendly but concise.`;

/**
 * Create tool handlers scoped to a specific business.
 * Each handler receives the tool input and returns the result.
 */
export function createSmsToolHandlers(businessId: number) {
  return {
    async loadCustomerContext(input: { customerPhone: string }): Promise<any> {
      const customer = await storage.getCustomerByPhone(input.customerPhone, businessId);
      if (!customer) return { found: false };

      const appointments = await storage.getAppointmentsByCustomerId(customer.id);
      const upcoming = appointments.filter(a => {
        const start = a.startDate ? new Date(a.startDate) : null;
        return start && start > new Date() && a.status !== 'cancelled';
      });

      return {
        found: true,
        customerId: customer.id,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown',
        phone: customer.phone,
        smsOptIn: customer.smsOptIn,
        marketingOptIn: customer.marketingOptIn,
        upcomingAppointments: upcoming.map(a => ({
          id: a.id,
          startDate: a.startDate,
          endDate: a.endDate,
          status: a.status,
          serviceId: a.serviceId,
        })),
        totalAppointments: appointments.length,
      };
    },

    async checkEngagementLock(input: { customerId: number }): Promise<any> {
      const lock = await storage.getEngagementLock(input.customerId, businessId);
      return {
        locked: !!lock,
        lockedBy: lock?.lockedByAgent || null,
        expiresAt: lock?.expiresAt || null,
      };
    },

    async acquireEngagementLock(input: { customerId: number; customerPhone?: string }): Promise<any> {
      try {
        const result = await storage.acquireEngagementLock(businessId, input.customerId, input.customerPhone || '', 'sms-intelligence', 15);
        return { acquired: result.acquired };
      } catch {
        return { acquired: false, reason: 'Lock already held by another agent' };
      }
    },

    async releaseEngagementLock(input: { customerId: number }): Promise<any> {
      await storage.releaseEngagementLock(input.customerId, businessId);
      return { released: true };
    },

    async checkAvailability(input: { date: string; serviceId?: number }): Promise<any> {
      try {
        const { getAvailableSlotsForDay } = await import('../callToolHandlers');
        const business = await storage.getBusiness(businessId);
        if (!business) return { error: 'Business not found' };

        const hours = await storage.getBusinessHours(businessId);
        const dateObj = new Date(input.date);
        const appointments = await storage.getUpcomingAppointmentsByBusinessId(businessId);

        let duration = 60; // default
        if (input.serviceId) {
          const svc = await storage.getService(input.serviceId);
          if (svc?.duration) duration = svc.duration;
        }

        const result = await getAvailableSlotsForDay(
          businessId,
          dateObj,
          hours,
          appointments,
          duration,
          undefined,
          30,
          business.timezone || 'America/New_York',
        );
        return { date: input.date, availableSlots: result.slots.slice(0, 5), isClosed: result.isClosed };
      } catch (err) {
        return { error: 'Could not check availability', details: (err as Error).message };
      }
    },

    async rescheduleAppointment(input: { appointmentId: number; newDate: string; newStartTime: string }): Promise<any> {
      const apt = await storage.getAppointment(input.appointmentId);
      if (!apt || apt.businessId !== businessId) {
        return { error: 'Appointment not found' };
      }

      const startDate = new Date(`${input.newDate}T${input.newStartTime}`);
      const duration = 60; // default 60 min
      if (apt.serviceId) {
        const svc = await storage.getService(apt.serviceId);
        if (svc?.duration) {
          // duration is in minutes
        }
      }
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

      await storage.updateAppointment(input.appointmentId, {
        startDate,
        endDate,
        status: 'scheduled',
      });

      return { success: true, newStartDate: startDate.toISOString(), newEndDate: endDate.toISOString() };
    },

    async cancelAppointment(input: { appointmentId: number }): Promise<any> {
      const apt = await storage.getAppointment(input.appointmentId);
      if (!apt || apt.businessId !== businessId) {
        return { error: 'Appointment not found' };
      }
      await storage.updateAppointment(input.appointmentId, { status: 'cancelled' });
      return { success: true, cancelled: true };
    },

    async confirmAppointment(input: { appointmentId: number }): Promise<any> {
      const apt = await storage.getAppointment(input.appointmentId);
      if (!apt || apt.businessId !== businessId) {
        return { error: 'Appointment not found' };
      }
      await storage.updateAppointment(input.appointmentId, { status: 'confirmed' });
      return { success: true, confirmed: true };
    },

    async sendSms(input: { to: string; body: string; isMarketing?: boolean }): Promise<any> {
      try {
        const { sendSms: twilioSendSms } = await import('../twilioService');
        const business = await storage.getBusiness(businessId);
        if (!business) return { error: 'Business not found' };

        // Compliance is handled inside twilioService.sendSms (suppression list, sanitization)
        await twilioSendSms(
          input.to,
          input.body,
          business.twilioPhoneNumber || undefined,
        );
        return { sent: true };
      } catch (err) {
        return { error: 'Failed to send SMS', details: (err as Error).message };
      }
    },

    async checkSmsCompliance(input: { customerPhone: string }): Promise<any> {
      const customer = await storage.getCustomerByPhone(input.customerPhone, businessId);
      if (!customer) return { canSend: false, reason: 'Customer not found' };

      // Note: suppression list is checked inside twilioService.sendSms() automatically
      return {
        canSend: (customer.smsOptIn ?? false),
        smsOptIn: customer.smsOptIn ?? false,
        marketingOptIn: customer.marketingOptIn ?? false,
      };
    },

    async resolveConversation(input: { conversationId: number }): Promise<any> {
      await storage.updateSmsConversation(input.conversationId, { state: 'resolved' });
      return { resolved: true };
    },

    async createSmsConversation(input: { customerId: number; customerPhone: string; agentType: string }): Promise<any> {
      const conv = await storage.createSmsConversation({
        businessId,
        customerId: input.customerId,
        customerPhone: input.customerPhone,
        agentType: input.agentType,
        state: 'active',
        context: {},
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
      return { conversationId: conv.id, state: conv.state };
    },
  };
}

/**
 * Custom tool definitions for the SMS Intelligence agent.
 * These are sent to the Managed Agent API when creating the agent.
 */
export const SMS_TOOL_DEFINITIONS = [
  {
    name: 'loadCustomerContext',
    description: 'Load customer profile, upcoming appointments, and conversation history by phone number',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerPhone: { type: 'string', description: 'Customer phone number in E.164 format' },
      },
      required: ['customerPhone'],
    },
  },
  {
    name: 'checkEngagementLock',
    description: 'Check if another agent is currently messaging this customer',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'number', description: 'Customer ID' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'acquireEngagementLock',
    description: 'Acquire exclusive lock to prevent other agents from messaging this customer',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'number', description: 'Customer ID' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'releaseEngagementLock',
    description: 'Release the engagement lock after conversation ends',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'number', description: 'Customer ID' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'checkAvailability',
    description: 'Check available appointment slots for a specific date',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        serviceId: { type: 'number', description: 'Optional service ID to filter by' },
        staffId: { type: 'number', description: 'Optional staff ID to filter by' },
      },
      required: ['date'],
    },
  },
  {
    name: 'rescheduleAppointment',
    description: 'Move an appointment to a new date and time',
    input_schema: {
      type: 'object' as const,
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID to reschedule' },
        newDate: { type: 'string', description: 'New date in YYYY-MM-DD format' },
        newStartTime: { type: 'string', description: 'New start time in HH:MM format (24h)' },
      },
      required: ['appointmentId', 'newDate', 'newStartTime'],
    },
  },
  {
    name: 'cancelAppointment',
    description: 'Cancel an appointment',
    input_schema: {
      type: 'object' as const,
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID to cancel' },
      },
      required: ['appointmentId'],
    },
  },
  {
    name: 'confirmAppointment',
    description: 'Confirm an appointment',
    input_schema: {
      type: 'object' as const,
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID to confirm' },
      },
      required: ['appointmentId'],
    },
  },
  {
    name: 'sendSms',
    description: 'Send an SMS message to a customer. All compliance checks happen automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Phone number to send to in E.164 format' },
        body: { type: 'string', description: 'SMS message body (keep under 160 chars)' },
        isMarketing: { type: 'boolean', description: 'Whether this is a marketing message (adds STOP footer)' },
      },
      required: ['to', 'body'],
    },
  },
  {
    name: 'checkSmsCompliance',
    description: 'Check if a customer can receive SMS (opt-in status, suppression list)',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerPhone: { type: 'string', description: 'Customer phone number' },
      },
      required: ['customerPhone'],
    },
  },
  {
    name: 'resolveConversation',
    description: 'Mark an SMS conversation as resolved',
    input_schema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'number', description: 'Conversation ID' },
      },
      required: ['conversationId'],
    },
  },
  {
    name: 'createSmsConversation',
    description: 'Start tracking a new multi-turn SMS conversation',
    input_schema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'number', description: 'Customer ID' },
        customerPhone: { type: 'string', description: 'Customer phone number' },
        agentType: { type: 'string', description: 'Agent type (e.g. reschedule, booking, support)' },
      },
      required: ['customerId', 'customerPhone', 'agentType'],
    },
  },
];
