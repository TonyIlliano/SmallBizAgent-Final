/**
 * Call Tool Handlers — provider-agnostic FACADE for the voice AI tool layer.
 *
 * The implementation lives in server/services/callTools/ (audit R1 split):
 *
 *   cache.ts           — BusinessDataCache + cached getters (dataCache is public:
 *                        5 route files invalidate it after DB mutations)
 *   datetime.ts        — timezone-aware date/time parsing + formatting (pure)
 *   types.ts           — FunctionResult, EndOfCallData, tool param interfaces
 *   bookingTools.ts    — availability slots, book/recurring/reschedule/cancel/confirm
 *   crmTools.ts        — recognizeCaller, customer CRUD, equipment, membership
 *   infoTools.ts       — hours, services, staff schedules, estimates, wait times
 *   logisticsTools.ts  — human transfer, voicemail, callbacks
 *   restaurantTools.ts — POS ordering (Clover/Square/Heartland) + reservations
 *   endOfCall.ts       — post-call logging, intelligence kickoff, webhooks
 *
 * This file keeps the dispatcher (dispatchToolCall) and the full public
 * surface stable: every import path that worked against the old 6,100-line
 * monolith still works (dataCache, dispatchToolCall, processEndOfCall,
 * getAvailableSlotsForDay, parseNaturalDate/Time, createDateInTimezone,
 * getCurrentBusinessStatus, EndOfCallData, FunctionResult).
 *
 * Works with any voice AI platform (Retell AI, Vapi, etc.) via
 * dispatchToolCall() and processEndOfCall().
 */

// ═══════════════════════════════════════════════════════════════════════════
// Domain modules (audit R1 split). Public surface is unchanged: everything
// previously exported from this file is still exported from this file.
// ═══════════════════════════════════════════════════════════════════════════
import {
  dataCache,
  getCachedBusinessHours,
  getCachedServices,
  getCachedStaff,
  getCachedStaffHours,
  getCachedBusiness,
  getCachedStaffServiceMap,
  isStaffOffOnDate,
  getUpcomingTimeOff,
  groupConsecutiveDays,
  getAppointmentsOptimized,
} from './callTools/cache';
// Re-export: 5 route files + the voice tests import dataCache from here.
export { dataCache };

import {
  formatDateForVoice,
  getNowInTimezone,
  getLocalTimeInTimezone,
  getLocalDateString,
  getTodayInTimezone,
  createDateInTimezone,
  parseNaturalDate,
  parseNaturalTime,
} from './callTools/datetime';
// Re-export: SMS reply routing + conversational booking import these from here.
export { createDateInTimezone, parseNaturalDate, parseNaturalTime };

import {
  handleGetMenu,
  handleGetMenuCategory,
  handleCreateOrder,
  handleCheckReservationAvailability,
  handleMakeReservation,
  handleCancelReservation,
} from './callTools/restaurantTools';

import {
  getServices, getStaffMembers, getStaffSchedule, getBusinessHours, getEstimate,
  getCurrentBusinessStatus, getDirections, checkWaitTime, getServiceDetails,
} from './callTools/infoTools';
export { getCurrentBusinessStatus };

import {
  getCustomerInfo, createCustomer, recognizeCaller, updateCustomerInfo,
  captureEquipment, checkMembership, extractCallerNameFromTranscript,
} from './callTools/crmTools';

import {
  transferToHuman, leaveMessage, getUpcomingAppointments, scheduleCallback,
} from './callTools/logisticsTools';

import { processEndOfCall } from './callTools/endOfCall';
export { processEndOfCall };

import { parseTimeToMinutes } from './callTools/datetime';

import type {
  FunctionResult, EndOfCallData,
  BookAppointmentParams, BookRecurringAppointmentParams, CreateCustomerParams,
  RescheduleAppointmentParams, CancelAppointmentParams, GetEstimateParams,
  TransferToHumanParams, LeaveMessageParams, ScheduleCallbackParams,
  UpdateCustomerInfoParams, CaptureEquipmentParams, CheckMembershipParams,
  ConfirmAppointmentParams, CreateOrderParams, CheckReservationAvailabilityParams,
  MakeReservationParams, CancelReservationParams,
} from './callTools/types';
export type { FunctionResult, EndOfCallData };

import {
  checkAvailability, bookAppointment, bookRecurringAppointment,
  rescheduleAppointment, cancelAppointment, confirmAppointment,
  getAvailableSlotsForDay, isDateRangeRequest,
} from './callTools/bookingTools';
// Re-export: systemPromptBuilder + SMS reply routing + voice tests import this from here.
export { getAvailableSlotsForDay };




/**
 * Central tool dispatcher — maps function names to handler implementations.
 * Called by provider-specific webhook handlers (retellWebhookHandler, etc.).
 */
export async function dispatchToolCall(
  name: string,
  businessId: number,
  parameters: Record<string, any>,
  callerPhone?: string
): Promise<FunctionResult | { error: string }> {
  // Log function calls with caller info for debugging recognition issues
  if (name === 'recognizeCaller') {
    console.log(`[dispatchToolCall] recognizeCaller called with callerPhone=${callerPhone || 'MISSING'}, businessId=${businessId}`);
  }

  try {
    switch (name) {
      case 'checkAvailability':
        // Validate parameters
        if (!parameters.date) {
          console.warn('checkAvailability called without date parameter');
          return {
            result: {
              available: false,
              error: 'I need to know what day you\'d like to check. What date works best for you?'
            }
          };
        }
        try {
          const availResult = await checkAvailability(businessId, parameters.date, parameters.serviceId, parameters.staffId, parameters.staffName);
          return availResult;
        } catch (err) {
          console.error(`checkAvailability FAILED for business ${businessId}:`, err);
          return {
            result: {
              available: false,
              error: 'Technical error checking availability',
              message: "I'm having trouble checking our schedule right now. Let me take your information and have someone call you back to schedule. What's a good number to reach you?"
            }
          };
        }

      case 'bookAppointment':
        return await bookAppointment(businessId, parameters as BookAppointmentParams, callerPhone);

      case 'bookRecurringAppointment':
        return await bookRecurringAppointment(businessId, parameters as BookRecurringAppointmentParams, callerPhone);

      case 'getCustomerInfo':
        return await getCustomerInfo(businessId, parameters.phoneNumber || callerPhone);

      case 'getServices':
        try {
          const servicesResult = await getServices(businessId);
          return servicesResult;
        } catch (err) {
          console.error(`getServices FAILED for business ${businessId}:`, err);
          return {
            result: {
              services: [],
              error: 'Technical error fetching services',
              message: "I'm having trouble accessing our services right now. I can still help you schedule a general appointment. What day works best for you?"
            }
          };
        }

      case 'getStaffMembers':
        try {
          const staffResult = await getStaffMembers(businessId);
          return staffResult;
        } catch (err) {
          console.error(`getStaffMembers FAILED for business ${businessId}:`, err);
          return {
            result: {
              staff: [],
              error: 'Technical error fetching staff',
              message: "I'm having trouble accessing our team information right now, but I can still help you schedule an appointment."
            }
          };
        }

      case 'getStaffSchedule':
        try {
          const scheduleResult = await getStaffSchedule(businessId, parameters.staffName, parameters.staffId);
          return scheduleResult;
        } catch (err) {
          console.error(`getStaffSchedule FAILED:`, err);
          return {
            result: {
              error: 'Technical error fetching schedule',
              message: "I'm having trouble accessing their schedule right now. Would you like me to check their availability for a specific day instead?"
            }
          };
        }

      case 'createCustomer':
        return await createCustomer(businessId, parameters as CreateCustomerParams);

      case 'rescheduleAppointment':
        return await rescheduleAppointment(businessId, parameters as RescheduleAppointmentParams, callerPhone);

      case 'cancelAppointment':
        return await cancelAppointment(businessId, parameters as CancelAppointmentParams, callerPhone);

      case 'getBusinessHours':
        return await getBusinessHours(businessId);

      case 'getEstimate':
        return await getEstimate(businessId, parameters as GetEstimateParams);

      case 'transferToHuman':
        return await transferToHuman(businessId, parameters as TransferToHumanParams, callerPhone);

      case 'leaveMessage':
        return await leaveMessage(businessId, parameters as LeaveMessageParams, callerPhone);

      case 'getUpcomingAppointments':
        return await getUpcomingAppointments(businessId, callerPhone);

      case 'scheduleCallback':
        return await scheduleCallback(businessId, parameters as ScheduleCallbackParams, callerPhone);

      case 'recognizeCaller':
        return await recognizeCaller(businessId, callerPhone);

      case 'updateCustomerInfo':
        return await updateCustomerInfo(businessId, parameters as UpdateCustomerInfoParams, callerPhone);

      case 'captureEquipment':
        return await captureEquipment(businessId, parameters as CaptureEquipmentParams);

      case 'checkMembership':
        return await checkMembership(businessId, parameters as CheckMembershipParams);

      case 'getDirections':
        return await getDirections(businessId, callerPhone, parameters?.sendSms);

      case 'checkWaitTime':
        return await checkWaitTime(businessId);

      case 'confirmAppointment':
        return await confirmAppointment(businessId, parameters as ConfirmAppointmentParams, callerPhone);

      case 'getServiceDetails':
        return await getServiceDetails(businessId, parameters.serviceName);

      // ========== Restaurant Ordering Functions (Clover POS) ==========
      case 'getMenu':
        return await handleGetMenu(businessId);

      case 'getMenuCategory':
        return await handleGetMenuCategory(businessId, parameters.categoryName);

      case 'createOrder':
        return await handleCreateOrder(businessId, parameters as CreateOrderParams, callerPhone);

      // ========== Restaurant Reservation Functions ==========
      case 'checkReservationAvailability':
        return await handleCheckReservationAvailability(businessId, parameters as CheckReservationAvailabilityParams);

      case 'makeReservation':
        return await handleMakeReservation(businessId, parameters as MakeReservationParams, callerPhone || '');

      case 'cancelReservation':
        return await handleCancelReservation(businessId, parameters as CancelReservationParams, callerPhone || '');

      default:
        return { error: `Unknown function: ${name}` };
    }
  } catch (error) {
    console.error(`Error handling function ${name}:`, error);
    return { error: String(error) };
  }
}

// Default export (all named exports are already inline above)
export default {
  dispatchToolCall,
  processEndOfCall,
};
