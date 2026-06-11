/**
 * callTools/logisticsTools — call logistics: human transfer, voicemail,
 * upcoming appointments, callbacks.
 * Extracted from callToolHandlers.ts (audit R1 split).
 */

import { storage } from '../../storage';
import twilioService from '../twilioService';
import { getCachedBusiness } from './cache';
import { parseNaturalDate, parseNaturalTime, formatDateForVoice } from './datetime';
import type { FunctionResult, TransferToHumanParams, LeaveMessageParams, ScheduleCallbackParams } from './types';

/**
 * Transfer call to a human
 */
export async function transferToHuman(
  businessId: number,
  params: {
    reason?: string;
    urgent?: boolean;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  // Get the receptionist config for transfer numbers
  const config = await storage.getReceptionistConfig(businessId);
  const transferNumbers: string[] = Array.isArray(config?.transferPhoneNumbers)
    ? config.transferPhoneNumbers
    : [];

  if (transferNumbers.length === 0 && business.phone) {
    transferNumbers.push(business.phone);
  }

  if (transferNumbers.length === 0) {
    // No transfer number available, take a message instead
    return {
      result: {
        canTransfer: false,
        message: "I apologize, but I'm not able to transfer you right now. Can I take a message and have someone call you back as soon as possible?"
      }
    };
  }

  // Log the transfer request
  if (callerPhone) {
    try {
      await storage.createCallLog({
        businessId,
        callerId: callerPhone,
        callerName: '',
        transcript: `Transfer requested: ${params.reason || 'Customer requested to speak with someone'}`,
        intentDetected: params.urgent ? 'urgent-transfer' : 'transfer-request',
        isEmergency: params.urgent || false,
        callDuration: 0,
        recordingUrl: null,
        status: 'transferring',
        callTime: new Date()
      });
    } catch (error) {
      console.error('Error logging transfer request:', error);
    }
  }

  // Notify the business owner via SMS that a transfer is incoming
  try {
    const { default: twilioService } = await import('../twilioService');
    const notifyNumber = transferNumbers[0];
    const callerName = callerPhone || 'Unknown caller';
    const reason = params.reason || 'requested to speak with someone';
    const urgentTag = params.urgent ? ' [URGENT]' : '';
    await twilioService.sendSms(
      notifyNumber,
      `${urgentTag} Incoming transfer: ${callerName} ${reason}. Call is being transferred to you now.`,
      undefined,
      businessId
    );
  } catch (smsError) {
    console.error('Error sending transfer notification SMS:', smsError);
  }

  // The actual SIP transfer is handled by Retell's native transfer_to_human tool.
  // This custom tool just logs and notifies — the AI should call transfer_to_human next.
  return {
    result: {
      logged: true,
      message: "Transfer request logged. Now transferring the call.",
      reason: params.reason || 'Customer requested to speak with someone'
    }
  };
}

/**
 * Leave a message/voicemail
 */
export async function leaveMessage(
  businessId: number,
  params: {
    message: string;
    urgent?: boolean;
    callbackRequested?: boolean;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  try {
    // Create a call log with the message
    await storage.createCallLog({
      businessId,
      callerId: callerPhone || 'Unknown',
      callerName: '',
      transcript: `MESSAGE: ${params.message}`,
      intentDetected: params.urgent ? 'urgent-message' : 'voicemail',
      isEmergency: params.urgent || false,
      callDuration: 0,
      recordingUrl: null,
      status: params.callbackRequested ? 'callback-requested' : 'message-left',
      callTime: new Date()
    });

    // If urgent, send SMS to business owner
    if (params.urgent && business.phone) {
      try {
        await twilioService.sendSms(
          business.phone,
          `URGENT MESSAGE from ${callerPhone || 'Unknown'}: ${params.message.substring(0, 140)}...`
        );
      } catch (smsError) {
        console.error('Failed to send urgent message SMS:', smsError);
      }
    }

    return {
      result: {
        success: true,
        message: params.callbackRequested
          ? "I've recorded your message and someone will call you back as soon as possible. Is there anything else I can help with before we hang up?"
          : "Your message has been recorded. Thank you for calling. Is there anything else I can help with?"
      }
    };
  } catch (error) {
    console.error('Error saving message:', error);
    return {
      result: {
        success: false,
        error: "I'm having trouble saving your message. Could you please call back or try again?"
      }
    };
  }
}

/**
 * Get customer's upcoming appointments
 */
export async function getUpcomingAppointments(
  businessId: number,
  callerPhone?: string
): Promise<FunctionResult> {
  if (!callerPhone) {
    return {
      result: {
        found: false,
        message: "I need your phone number to look up your appointments. What phone number is your appointment under?"
      }
    };
  }

  const customer = await storage.getCustomerByPhone(callerPhone, businessId);

  if (!customer) {
    return {
      result: {
        found: false,
        appointments: [],
        message: "I don't see any appointments under this phone number. Would you like to schedule one?"
      }
    };
  }

  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const now = new Date();
  const upcomingStatuses = ['scheduled', 'confirmed', 'pending'];
  const upcoming = appointments
    .filter(apt => new Date(apt.startDate) > now && apt.status && upcomingStatuses.includes(apt.status))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 5);

  if (upcoming.length === 0) {
    return {
      result: {
        found: true,
        customerName: `${customer.firstName} ${customer.lastName}`,
        appointments: [],
        message: `Hi ${customer.firstName}! I don't see any upcoming appointments for you. Would you like to schedule one?`
      }
    };
  }

  const custBusiness = await getCachedBusiness(businessId);
  const custTimezone = custBusiness?.timezone || 'America/New_York';
  const appointmentList = upcoming.map(apt => {
    const date = new Date(apt.startDate);
    return {
      id: apt.id,
      date: date.toLocaleDateString('en-US', { timeZone: custTimezone, weekday: 'long', month: 'long', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { timeZone: custTimezone, hour: 'numeric', minute: '2-digit', hour12: true }),
      notes: apt.notes
    };
  });

  const nextApt = appointmentList[0];

  return {
    result: {
      found: true,
      customerName: `${customer.firstName} ${customer.lastName}`,
      appointments: appointmentList,
      message: upcoming.length === 1
        ? `Hi ${customer.firstName}! You have an appointment scheduled for ${nextApt.date} at ${nextApt.time}. Is there anything you'd like to change about that appointment?`
        : `Hi ${customer.firstName}! Your next appointment is ${nextApt.date} at ${nextApt.time}. You have ${upcoming.length} total upcoming appointments. Would you like details on any of them?`
    }
  };
}

/**
 * Schedule a callback for the customer
 */
export async function scheduleCallback(
  businessId: number,
  params: {
    preferredTime?: string;
    preferredDate?: string;
    reason?: string;
    urgent?: boolean;
  },
  callerPhone?: string
): Promise<FunctionResult> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { result: { success: false, error: 'Business not found' } };
  }

  if (!callerPhone) {
    return {
      result: {
        success: false,
        error: 'I need your phone number to schedule a callback. What number should we call you back at?'
      }
    };
  }

  // Parse preferred callback time
  // Format times directly to avoid UTC/timezone offset issues on Railway
  const formatTime12h = (h: number, m: number) => {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const amPm = h < 12 ? 'AM' : 'PM';
    return `${hour12}:${m.toString().padStart(2, '0')} ${amPm}`;
  };

  let callbackTime = 'as soon as possible';
  if (params.preferredDate && params.preferredTime) {
    const date = parseNaturalDate(params.preferredDate);
    const time = parseNaturalTime(params.preferredTime);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const [h, m] = time.split(':').map(Number);
    callbackTime = `${dateStr} around ${formatTime12h(h, m)}`;
  } else if (params.preferredTime) {
    const time = parseNaturalTime(params.preferredTime);
    const [h, m] = time.split(':').map(Number);
    callbackTime = `around ${formatTime12h(h, m)}`;
  }

  try {
    // Log the callback request
    await storage.createCallLog({
      businessId,
      callerId: callerPhone,
      callerName: '',
      transcript: `CALLBACK REQUESTED: ${params.reason || 'Customer requested callback'}\nPreferred time: ${callbackTime}`,
      intentDetected: params.urgent ? 'urgent-callback' : 'callback-request',
      isEmergency: params.urgent || false,
      callDuration: 0,
      recordingUrl: null,
      status: 'callback-scheduled',
      callTime: new Date()
    });

    // Send SMS to business
    if (business.phone) {
      try {
        const urgentPrefix = params.urgent ? 'URGENT ' : '';
        await twilioService.sendSms(
          business.phone,
          `${urgentPrefix}CALLBACK REQUEST from ${callerPhone}: ${params.reason || 'No reason specified'}. Preferred time: ${callbackTime}`
        );
      } catch (smsError) {
        console.error('Failed to send callback SMS:', smsError);
      }
    }

    // Send confirmation to customer
    try {
      await twilioService.sendSms(
        callerPhone,
        `${business.name} has received your callback request. We'll call you back ${callbackTime}. Thank you!`,
        undefined,
        businessId || undefined
      );
    } catch (smsError) {
      console.error('Failed to send customer callback confirmation:', smsError);
    }

    return {
      result: {
        success: true,
        callbackTime,
        message: `I've scheduled a callback for you ${callbackTime}. You'll receive a text confirmation. Is there anything else I can help with?`
      }
    };
  } catch (error) {
    console.error('Error scheduling callback:', error);
    return {
      result: {
        success: false,
        error: 'I had trouble scheduling the callback. Let me take your information and have someone call you back.'
      }
    };
  }
}

