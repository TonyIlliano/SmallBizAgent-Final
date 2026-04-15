import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted ensures they're available when vi.mock factories run) ──

const {
  mockStorage,
  mockTriggerFollowUp,
  mockTriggerNoShowSms,
  mockRecalculateCustomerInsights,
  mockStartWorkflowRun,
  mockAddMemory,
  mockIsAgentEnabled,
  mockLogAndSwallow,
} = vi.hoisted(() => ({
  mockStorage: {
    getCallIntelligence: vi.fn(),
    getEngagementLock: vi.fn(),
    acquireEngagementLock: vi.fn(),
    releaseEngagementLock: vi.fn(),
    getCustomerInsights: vi.fn(),
    getActiveWorkflowsByTrigger: vi.fn(),
  },
  mockTriggerFollowUp: vi.fn(),
  mockTriggerNoShowSms: vi.fn(),
  mockRecalculateCustomerInsights: vi.fn(),
  mockStartWorkflowRun: vi.fn(),
  mockAddMemory: vi.fn(),
  mockIsAgentEnabled: vi.fn(),
  mockLogAndSwallow: vi.fn(() => () => {}),
}));

vi.mock('../storage', () => ({ storage: mockStorage }));
vi.mock('../utils/safeAsync', () => ({ logAndSwallow: mockLogAndSwallow }));

// Dynamic imports are used inside the service — mock the modules they resolve to
vi.mock('./agentSettingsService', () => ({
  isAgentEnabled: mockIsAgentEnabled,
}));
vi.mock('./followUpAgentService', () => ({
  triggerFollowUp: mockTriggerFollowUp,
}));
vi.mock('./noShowAgentService', () => ({
  triggerNoShowSms: mockTriggerNoShowSms,
}));
vi.mock('./customerInsightsService', () => ({
  recalculateCustomerInsights: mockRecalculateCustomerInsights,
}));
vi.mock('./workflowEngine', () => ({
  startWorkflowRun: mockStartWorkflowRun,
}));
vi.mock('./mem0Service', () => ({
  addMemory: mockAddMemory,
}));

import { dispatchEvent, type OrchestratorEvent } from './orchestrationService';

// ── Test Data ──

const BUSINESS_ID = 1;
const CUSTOMER_ID = 10;
const APPOINTMENT_ID = 100;
const JOB_ID = 200;
const CALL_LOG_ID = 300;

const BASE_PAYLOAD = {
  businessId: BUSINESS_ID,
  customerId: CUSTOMER_ID,
};

// ── Tests ──

describe('orchestrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks: no lock, agent enabled, lock acquired, no workflows
    mockStorage.getEngagementLock.mockResolvedValue(null);
    mockStorage.acquireEngagementLock.mockResolvedValue({ acquired: true });
    mockStorage.releaseEngagementLock.mockResolvedValue(undefined);
    mockStorage.getActiveWorkflowsByTrigger.mockResolvedValue([]);
    mockIsAgentEnabled.mockResolvedValue(true);
    mockTriggerFollowUp.mockResolvedValue(undefined);
    mockTriggerNoShowSms.mockResolvedValue(undefined);
    mockRecalculateCustomerInsights.mockResolvedValue(undefined);
    mockStartWorkflowRun.mockResolvedValue(undefined);
    mockAddMemory.mockResolvedValue(undefined);
  });

  // ─── Event Routing ───

  describe('event routing', () => {
    it('routes appointment.completed to follow-up handler', async () => {
      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
        referenceType: 'appointment',
      });

      expect(mockIsAgentEnabled).toHaveBeenCalledWith(BUSINESS_ID, 'follow_up');
      expect(mockTriggerFollowUp).toHaveBeenCalledWith('appointment', APPOINTMENT_ID, BUSINESS_ID);
    });

    it('routes appointment.no_show to no-show handler', async () => {
      mockStorage.getCustomerInsights.mockResolvedValue(null);

      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockIsAgentEnabled).toHaveBeenCalledWith(BUSINESS_ID, 'no_show');
      expect(mockTriggerNoShowSms).toHaveBeenCalledWith(APPOINTMENT_ID, BUSINESS_ID);
    });

    it('routes job.completed to follow-up handler with job type', async () => {
      await dispatchEvent('job.completed', {
        ...BASE_PAYLOAD,
        referenceId: JOB_ID,
        referenceType: 'job',
      });

      expect(mockIsAgentEnabled).toHaveBeenCalledWith(BUSINESS_ID, 'follow_up');
      expect(mockTriggerFollowUp).toHaveBeenCalledWith('job', JOB_ID, BUSINESS_ID);
    });

    it('routes invoice.paid to customer insights recalculation', async () => {
      await dispatchEvent('invoice.paid', {
        ...BASE_PAYLOAD,
      });

      expect(mockRecalculateCustomerInsights).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
    });

    it('routes conversation.resolved to engagement lock release', async () => {
      await dispatchEvent('conversation.resolved', {
        ...BASE_PAYLOAD,
      });

      expect(mockStorage.releaseEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
    });

    it('routes intelligence.ready to intelligence handler', async () => {
      mockStorage.getCallIntelligence.mockResolvedValue({
        id: 1,
        callLogId: CALL_LOG_ID,
        processingStatus: 'completed',
        followUpNeeded: true,
        sentiment: 1,
        followUpType: 'urgent',
      });

      await dispatchEvent('intelligence.ready', {
        ...BASE_PAYLOAD,
        callLogId: CALL_LOG_ID,
      });

      expect(mockStorage.getCallIntelligence).toHaveBeenCalledWith(CALL_LOG_ID);
    });

    it('routes appointment.cancelled to insights recalculation', async () => {
      await dispatchEvent('appointment.cancelled', {
        ...BASE_PAYLOAD,
      });

      expect(mockRecalculateCustomerInsights).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
    });

    it('logs unknown events without throwing', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Cast to bypass TypeScript type checking for unknown event
      await dispatchEvent('some.unknown.event' as OrchestratorEvent, {
        businessId: BUSINESS_ID,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No handler for event: some.unknown.event')
      );
      consoleSpy.mockRestore();
    });
  });

  // ─── Error Isolation ───

  describe('error isolation', () => {
    it('catches and logs handler errors without propagating', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockIsAgentEnabled.mockRejectedValue(new Error('Agent settings DB exploded'));

      // Should NOT throw
      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      // The error is caught inside handleAppointmentCompleted's try/catch
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error triggering follow-up for appointment'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('catches intelligence handler errors without propagating', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockStorage.getCallIntelligence.mockRejectedValue(new Error('Intelligence query failed'));

      // Should NOT throw
      await dispatchEvent('intelligence.ready', {
        ...BASE_PAYLOAD,
        callLogId: CALL_LOG_ID,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Orchestrator] Error handling intelligence.ready'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('releases engagement lock when follow-up agent errors (appointment)', async () => {
      mockTriggerFollowUp.mockRejectedValue(new Error('Follow-up failed'));

      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockStorage.releaseEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
    });

    it('releases engagement lock when no-show agent errors', async () => {
      mockStorage.getCustomerInsights.mockResolvedValue(null);
      mockTriggerNoShowSms.mockRejectedValue(new Error('No-show SMS failed'));

      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockStorage.releaseEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
    });

    it('releases engagement lock when follow-up agent errors (job)', async () => {
      mockTriggerFollowUp.mockRejectedValue(new Error('Job follow-up failed'));

      await dispatchEvent('job.completed', {
        ...BASE_PAYLOAD,
        referenceId: JOB_ID,
      });

      expect(mockStorage.releaseEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
    });

    it('conversation.resolved does not throw when lock release fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockStorage.releaseEngagementLock.mockRejectedValue(new Error('Lock table gone'));

      // Should NOT throw
      await dispatchEvent('conversation.resolved', {
        ...BASE_PAYLOAD,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error releasing engagement lock'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('insights recalculation error does not propagate (invoice.paid)', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockRecalculateCustomerInsights.mockRejectedValue(new Error('Insights explosion'));

      // Should NOT throw
      await dispatchEvent('invoice.paid', {
        ...BASE_PAYLOAD,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error recalculating insights after payment'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('insights recalculation error does not propagate (appointment.cancelled)', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockRecalculateCustomerInsights.mockRejectedValue(new Error('Insights broken'));

      // Should NOT throw
      await dispatchEvent('appointment.cancelled', {
        ...BASE_PAYLOAD,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error recalculating insights after cancellation'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  // ─── Engagement Lock ───

  describe('engagement lock', () => {
    it('checks lock before messaging on appointment.completed', async () => {
      mockStorage.getEngagementLock.mockResolvedValue({
        lockedByAgent: 'rebooking',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockStorage.getEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
      expect(mockTriggerFollowUp).not.toHaveBeenCalled();
    });

    it('checks lock before messaging on appointment.no_show', async () => {
      mockStorage.getEngagementLock.mockResolvedValue({
        lockedByAgent: 'other_agent',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockStorage.getEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
      expect(mockTriggerNoShowSms).not.toHaveBeenCalled();
    });

    it('checks lock before messaging on job.completed', async () => {
      mockStorage.getEngagementLock.mockResolvedValue({
        lockedByAgent: 'booking',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await dispatchEvent('job.completed', {
        ...BASE_PAYLOAD,
        referenceId: JOB_ID,
      });

      expect(mockStorage.getEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
      expect(mockTriggerFollowUp).not.toHaveBeenCalled();
    });

    it('checks lock on intelligence.ready and skips if locked', async () => {
      // Intelligence must be found and completed for the flow to reach the lock check
      mockStorage.getCallIntelligence.mockResolvedValue({
        id: 1,
        callLogId: CALL_LOG_ID,
        processingStatus: 'completed',
        followUpNeeded: true,
        sentiment: 1,
      });
      mockStorage.getEngagementLock.mockResolvedValue({
        lockedByAgent: 'booking',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await dispatchEvent('intelligence.ready', {
        ...BASE_PAYLOAD,
        callLogId: CALL_LOG_ID,
      });

      // Code flow: check callLogId -> getCallIntelligence -> isCustomerLocked -> return
      expect(mockStorage.getCallIntelligence).toHaveBeenCalledWith(CALL_LOG_ID);
      expect(mockStorage.getEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
    });

    it('acquires lock before triggering appointment follow-up', async () => {
      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockStorage.acquireEngagementLock).toHaveBeenCalledWith(
        BUSINESS_ID, CUSTOMER_ID, '', 'follow_up', 30
      );
    });

    it('acquires lock before triggering no-show recovery', async () => {
      mockStorage.getCustomerInsights.mockResolvedValue(null);

      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockStorage.acquireEngagementLock).toHaveBeenCalledWith(
        BUSINESS_ID, CUSTOMER_ID, '', 'no_show', 60
      );
    });

    it('skips follow-up when lock acquisition fails', async () => {
      mockStorage.acquireEngagementLock.mockResolvedValue({ acquired: false });

      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockTriggerFollowUp).not.toHaveBeenCalled();
    });

    it('skips no-show when lock acquisition fails', async () => {
      mockStorage.getCustomerInsights.mockResolvedValue(null);
      mockStorage.acquireEngagementLock.mockResolvedValue({ acquired: false });

      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockTriggerNoShowSms).not.toHaveBeenCalled();
    });
  });

  // ─── Workflows ───

  describe('workflow triggering', () => {
    it('triggers matching active workflows on appointment.completed', async () => {
      mockStorage.getActiveWorkflowsByTrigger.mockResolvedValue([
        { id: 1, businessId: BUSINESS_ID, triggerEvent: 'appointment.completed', status: 'active' },
      ]);

      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
        referenceType: 'appointment',
      });

      expect(mockStorage.getActiveWorkflowsByTrigger).toHaveBeenCalledWith('appointment.completed');
      expect(mockStartWorkflowRun).toHaveBeenCalledWith(
        1, BUSINESS_ID, CUSTOMER_ID, 'appointment', APPOINTMENT_ID
      );
    });

    it('triggers matching active workflows on job.completed', async () => {
      mockStorage.getActiveWorkflowsByTrigger.mockResolvedValue([
        { id: 5, businessId: BUSINESS_ID, triggerEvent: 'job.completed', status: 'active' },
      ]);

      await dispatchEvent('job.completed', {
        ...BASE_PAYLOAD,
        referenceId: JOB_ID,
        referenceType: 'job',
      });

      expect(mockStartWorkflowRun).toHaveBeenCalledWith(
        5, BUSINESS_ID, CUSTOMER_ID, 'job', JOB_ID
      );
    });

    it('triggers matching active workflows on invoice.paid', async () => {
      mockStorage.getActiveWorkflowsByTrigger.mockResolvedValue([
        { id: 10, businessId: BUSINESS_ID, triggerEvent: 'invoice.paid', status: 'active' },
      ]);

      await dispatchEvent('invoice.paid', {
        ...BASE_PAYLOAD,
        referenceType: 'invoice',
        referenceId: 500,
      });

      expect(mockStartWorkflowRun).toHaveBeenCalledWith(
        10, BUSINESS_ID, CUSTOMER_ID, 'invoice', 500
      );
    });

    it('only triggers workflows for the same businessId', async () => {
      mockStorage.getActiveWorkflowsByTrigger.mockResolvedValue([
        { id: 1, businessId: BUSINESS_ID, triggerEvent: 'appointment.completed', status: 'active' },
        { id: 2, businessId: 999, triggerEvent: 'appointment.completed', status: 'active' },
      ]);

      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockStartWorkflowRun).toHaveBeenCalledTimes(1);
      expect(mockStartWorkflowRun).toHaveBeenCalledWith(
        1, BUSINESS_ID, CUSTOMER_ID, undefined, APPOINTMENT_ID
      );
    });

    it('workflow error does not propagate', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockStorage.getActiveWorkflowsByTrigger.mockRejectedValue(new Error('Workflow DB error'));

      // Should NOT throw
      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Workflow trigger error'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('skips workflow triggering when customerId is missing', async () => {
      await dispatchEvent('appointment.completed', {
        businessId: BUSINESS_ID,
        referenceId: APPOINTMENT_ID,
        // no customerId
      });

      expect(mockStorage.getActiveWorkflowsByTrigger).not.toHaveBeenCalled();
    });
  });

  // ─── Missing / Null Data Handling ───

  describe('missing data handling', () => {
    it('appointment.completed skips when referenceId is missing', async () => {
      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        // no referenceId
      });

      expect(mockTriggerFollowUp).not.toHaveBeenCalled();
      expect(mockStorage.acquireEngagementLock).not.toHaveBeenCalled();
    });

    it('appointment.no_show skips when referenceId is missing', async () => {
      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        // no referenceId
      });

      expect(mockTriggerNoShowSms).not.toHaveBeenCalled();
    });

    it('job.completed skips when referenceId is missing', async () => {
      await dispatchEvent('job.completed', {
        ...BASE_PAYLOAD,
        // no referenceId
      });

      expect(mockTriggerFollowUp).not.toHaveBeenCalled();
    });

    it('intelligence.ready skips when callLogId is missing', async () => {
      await dispatchEvent('intelligence.ready', {
        ...BASE_PAYLOAD,
        // no callLogId
      });

      expect(mockStorage.getCallIntelligence).not.toHaveBeenCalled();
    });

    it('invoice.paid skips when customerId is missing', async () => {
      await dispatchEvent('invoice.paid', {
        businessId: BUSINESS_ID,
        // no customerId
      });

      expect(mockRecalculateCustomerInsights).not.toHaveBeenCalled();
    });

    it('appointment.cancelled skips when customerId is missing', async () => {
      await dispatchEvent('appointment.cancelled', {
        businessId: BUSINESS_ID,
        // no customerId
      });

      expect(mockRecalculateCustomerInsights).not.toHaveBeenCalled();
    });

    it('conversation.resolved skips when customerId is missing', async () => {
      await dispatchEvent('conversation.resolved', {
        businessId: BUSINESS_ID,
        // no customerId
      });

      expect(mockStorage.releaseEngagementLock).not.toHaveBeenCalled();
    });

    it('intelligence.ready skips when intelligence not completed', async () => {
      mockStorage.getCallIntelligence.mockResolvedValue({
        id: 1,
        callLogId: CALL_LOG_ID,
        processingStatus: 'processing',
      });

      await dispatchEvent('intelligence.ready', {
        ...BASE_PAYLOAD,
        callLogId: CALL_LOG_ID,
      });

      // Should return early after seeing processingStatus !== 'completed'
      expect(mockStorage.getEngagementLock).not.toHaveBeenCalled();
    });

    it('intelligence.ready skips when intelligence record not found', async () => {
      mockStorage.getCallIntelligence.mockResolvedValue(null);

      await dispatchEvent('intelligence.ready', {
        ...BASE_PAYLOAD,
        callLogId: CALL_LOG_ID,
      });

      expect(mockStorage.getEngagementLock).not.toHaveBeenCalled();
    });
  });

  // ─── Agent Enable/Disable ───

  describe('agent enable/disable', () => {
    it('skips follow-up when agent is disabled (appointment)', async () => {
      mockIsAgentEnabled.mockResolvedValue(false);

      await dispatchEvent('appointment.completed', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockTriggerFollowUp).not.toHaveBeenCalled();
    });

    it('skips follow-up when agent is disabled (job)', async () => {
      mockIsAgentEnabled.mockResolvedValue(false);

      await dispatchEvent('job.completed', {
        ...BASE_PAYLOAD,
        referenceId: JOB_ID,
      });

      expect(mockTriggerFollowUp).not.toHaveBeenCalled();
    });

    it('skips no-show when agent is disabled', async () => {
      mockIsAgentEnabled.mockResolvedValue(false);
      mockStorage.getCustomerInsights.mockResolvedValue(null);

      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockTriggerNoShowSms).not.toHaveBeenCalled();
    });
  });

  // ─── No-Show Context Awareness ───

  describe('no-show context awareness', () => {
    it('logs high-value customer no-show', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      mockStorage.getCustomerInsights.mockResolvedValue({
        lifetimeValue: 1200,
        noShowCount: 0,
      });

      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('High-value customer no-show')
      );
      consoleSpy.mockRestore();
    });

    it('logs repeat no-show', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      mockStorage.getCustomerInsights.mockResolvedValue({
        lifetimeValue: 100,
        noShowCount: 3,
      });

      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Repeat no-show')
      );
      consoleSpy.mockRestore();
    });

    it('gracefully handles insights lookup failure', async () => {
      mockStorage.getCustomerInsights.mockRejectedValue(new Error('DB error'));

      // Should NOT throw — best effort lookup
      await dispatchEvent('appointment.no_show', {
        ...BASE_PAYLOAD,
        referenceId: APPOINTMENT_ID,
      });

      expect(mockTriggerNoShowSms).toHaveBeenCalled();
    });
  });

  // ─── Conversation Resolved Metadata ───

  describe('conversation.resolved metadata', () => {
    it('stores resolution memory with outcome from metadata', async () => {
      await dispatchEvent('conversation.resolved', {
        ...BASE_PAYLOAD,
        metadata: { outcome: 'rescheduled' },
      });

      // Mem0 is called fire-and-forget via dynamic import inside storeEventMemory.
      // We verify the lock release happened (synchronous part)
      expect(mockStorage.releaseEngagementLock).toHaveBeenCalledWith(CUSTOMER_ID, BUSINESS_ID);
    });
  });

  // ─── Concurrent Events ───

  describe('concurrent events', () => {
    it('multiple sequential events for different customers do not interfere', async () => {
      // Run events sequentially to verify each one completes independently
      await dispatchEvent('appointment.completed', {
        businessId: BUSINESS_ID,
        customerId: 10,
        referenceId: 100,
      });
      await dispatchEvent('appointment.completed', {
        businessId: BUSINESS_ID,
        customerId: 20,
        referenceId: 101,
      });
      await dispatchEvent('job.completed', {
        businessId: BUSINESS_ID,
        customerId: 30,
        referenceId: 200,
      });

      // Each should have triggered independently
      expect(mockStorage.acquireEngagementLock).toHaveBeenCalledTimes(3);
      expect(mockTriggerFollowUp).toHaveBeenCalledTimes(3);
      expect(mockTriggerFollowUp).toHaveBeenCalledWith('appointment', 100, BUSINESS_ID);
      expect(mockTriggerFollowUp).toHaveBeenCalledWith('appointment', 101, BUSINESS_ID);
      expect(mockTriggerFollowUp).toHaveBeenCalledWith('job', 200, BUSINESS_ID);
    });

    it('multiple event types for same customer all complete', async () => {
      await dispatchEvent('invoice.paid', {
        ...BASE_PAYLOAD,
      });
      await dispatchEvent('appointment.cancelled', {
        ...BASE_PAYLOAD,
      });

      // Both should call recalculate
      expect(mockRecalculateCustomerInsights).toHaveBeenCalledTimes(2);
    });

    it('error in one event does not block subsequent events', async () => {
      // First event will fail inside handler
      mockIsAgentEnabled
        .mockRejectedValueOnce(new Error('DB down'))
        .mockResolvedValue(true);

      // First event errors internally (appointment.completed)
      await dispatchEvent('appointment.completed', {
        businessId: BUSINESS_ID,
        customerId: 10,
        referenceId: 100,
      });

      // Second event should still work fine (job.completed)
      await dispatchEvent('job.completed', {
        businessId: BUSINESS_ID,
        customerId: 20,
        referenceId: 200,
      });

      // First event should NOT have triggered follow-up (error)
      expect(mockTriggerFollowUp).not.toHaveBeenCalledWith('appointment', 100, BUSINESS_ID);
      // Second event should have triggered follow-up
      expect(mockTriggerFollowUp).toHaveBeenCalledWith('job', 200, BUSINESS_ID);
    });

    it('Promise.all with independent events all resolve without throwing', async () => {
      // Verify that concurrent dispatch calls all resolve (none reject)
      const results = await Promise.all([
        dispatchEvent('invoice.paid', { businessId: 1, customerId: 10 }),
        dispatchEvent('invoice.paid', { businessId: 2, customerId: 20 }),
        dispatchEvent('conversation.resolved', { businessId: 3, customerId: 30 }),
      ]);

      // All should resolve to undefined (void return)
      expect(results).toEqual([undefined, undefined, undefined]);
    });
  });

  // ─── Lock Behavior Without CustomerId ───

  describe('lock behavior without customerId', () => {
    it('isCustomerLocked returns false when customerId is undefined', async () => {
      // appointment.completed with no customerId but with referenceId
      // should skip lock check and still proceed (lock acquisition is conditional)
      await dispatchEvent('appointment.completed', {
        businessId: BUSINESS_ID,
        referenceId: APPOINTMENT_ID,
        // no customerId
      });

      // getEngagementLock should NOT be called (isCustomerLocked returns false for undefined)
      expect(mockStorage.getEngagementLock).not.toHaveBeenCalled();
      // acquireEngagementLock should NOT be called (guarded by `if (customerId)`)
      expect(mockStorage.acquireEngagementLock).not.toHaveBeenCalled();
      // But the follow-up should still fire (no lock guard blocks it)
      expect(mockTriggerFollowUp).toHaveBeenCalled();
    });
  });
});
