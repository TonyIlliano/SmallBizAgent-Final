import { storage } from '../storage';
import { createAppointmentSafely, findAvailableTimeSlots, isTimeSlotAvailable } from './appointmentService';
import { createCallLog } from './callLogService';
import { InsertAppointment, InsertCallLog } from '@shared/schema';
import { db } from '../db';

// Define response types
interface VirtualReceptionistResponse {
  action: string;
  response: string;
  intent: string;
  confidence: number;
  isEmergency: boolean;
  emergencySeverity?: number;
  isBusinessHours: boolean;
  responseParams?: any;
}

interface AppointmentResponse {
  success: boolean;
  appointmentId?: number;
  message: string;
  timeSlots?: { date: Date, available: boolean }[];
  error?: string;
}

/**
 * Process an appointment booking request from the virtual receptionist
 * 
 * @param businessId The business ID
 * @param customerId The customer ID
 * @param appointmentData Partial appointment data from the conversation
 * @param conversationContext Additional context from the conversation
 * @returns Promise resolving to an appointment response
 */
export async function processAppointmentRequest(
  businessId: number,
  customerId: number,
  appointmentData: Partial<InsertAppointment>,
  conversationContext: any
): Promise<AppointmentResponse> {
  try {
    // If we have a specific date/time request, try to book it directly
    if (appointmentData.startDate && appointmentData.endDate) {
      // Check if the requested time slot is available
      const isAvailable = await isTimeSlotAvailable(
        businessId,
        appointmentData.startDate,
        appointmentData.endDate,
        appointmentData.staffId
      );

      if (!isAvailable) {
        // Slot is not available, offer alternatives
        const startOfDay = new Date(appointmentData.startDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(appointmentData.startDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        // Find alternative slots on the same day
        const alternativeSlots = await findAvailableTimeSlots(
          businessId,
          startOfDay,
          endOfDay,
          appointmentData.serviceId,
          appointmentData.staffId
        );
        
        return {
          success: false,
          message: "The requested time is not available. Here are some alternative times that are available.",
          timeSlots: alternativeSlots,
          error: "Requested time slot is already booked."
        };
      }

      // If we have all required data, try to create the appointment
      if (appointmentData.businessId && appointmentData.customerId &&
          appointmentData.startDate && appointmentData.endDate) {
            
        // Create a full appointment object
        const fullAppointmentData: InsertAppointment = {
          businessId: businessId,
          customerId: customerId,
          startDate: appointmentData.startDate,
          endDate: appointmentData.endDate,
          status: 'scheduled',
          notes: `Booked by virtual receptionist${appointmentData.notes ? ': ' + appointmentData.notes : ''}`,
          staffId: appointmentData.staffId,
          serviceId: appointmentData.serviceId
        };

        // Attempt to create the appointment
        const result = await createAppointmentSafely(fullAppointmentData);
        
        if (result.success && result.appointment) {
          // Log the successful appointment creation
          await logAppointmentCreation(businessId, customerId, result.appointment.id, conversationContext);
          
          return {
            success: true,
            appointmentId: result.appointment.id,
            message: `Appointment successfully scheduled for ${appointmentData.startDate.toLocaleString()}`
          };
        } else {
          return {
            success: false,
            message: "Unable to schedule appointment",
            error: result.error || "Unknown error occurred"
          };
        }
      }
    }
    
    // If we don't have specific date/time or we're looking for available slots
    // Find available slots within the next 7 days
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    
    const availableSlots = await findAvailableTimeSlots(
      businessId,
      startDate,
      endDate,
      appointmentData.serviceId,
      appointmentData.staffId
    );
    
    if (availableSlots.length === 0) {
      return {
        success: false,
        message: "No available appointment slots in the next 7 days. Would you like to check availability further in the future?",
        timeSlots: []
      };
    }
    
    return {
      success: false, // Not yet booked, but providing options
      message: "Here are the available appointment slots in the next 7 days.",
      timeSlots: availableSlots
    };
    
  } catch (error) {
    console.error('Error processing appointment request:', error);
    return {
      success: false,
      message: "Sorry, I encountered an error while scheduling your appointment.",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Log the virtual receptionist's successful appointment creation
 * 
 * @param businessId The business ID
 * @param customerId The customer ID
 * @param appointmentId The created appointment ID
 * @param conversationContext The conversation context
 */
async function logAppointmentCreation(
  businessId: number,
  customerId: number,
  appointmentId: number,
  conversationContext: any
): Promise<void> {
  try {
    // Get customer information
    const customer = await storage.getCustomer(customerId);
    
    // Create a call log entry
    if (customer) {
      const callLog: InsertCallLog = {
        businessId,
        callerId: customer.phone,
        callerName: `${customer.firstName} ${customer.lastName}`,
        transcript: conversationContext.transcript || "Appointment scheduling conversation",
        intentDetected: "appointment",
        isEmergency: false,
        callDuration: conversationContext.duration || 0,
        status: "answered",
        callTime: new Date()
      };
      
      await createCallLog(callLog, { appointmentId });
    }
  } catch (error) {
    console.error('Error logging appointment creation:', error);
    // Non-critical error, doesn't need to be propagated up
  }
}

/**
 * Process a call through the virtual receptionist
 * 
 * @param callData Call data including businessId, callerId, text, etc.
 * @returns Promise resolving to a virtual receptionist response
 */
export async function processCall(callData: any): Promise<VirtualReceptionistResponse> {
  try {
    const { businessId, callerId, text, name, email, history } = callData;
    
    // Get business configuration
    const config = await storage.getReceptionistConfig(businessId);
    if (!config) {
      throw new Error('Virtual receptionist configuration not found');
    }
    
    // Check business hours
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    // Get business hours for today
    const businessHours = await storage.getBusinessHours(businessId);
    const todaysHours = businessHours.find(h => h.day.toLowerCase() === day.toLowerCase());
    
    const isBusinessHours = todaysHours && !todaysHours.isClosed && 
                           todaysHours.open && todaysHours.close &&
                           time >= todaysHours.open && time <= todaysHours.close;
    
    // Emergency detection with severity levels
    let isEmergency = false;
    let emergencySeverity = 0;
    let emergencyKeywords: string[] = [];
    
    if (config.emergencyKeywords) {
      const emergencyConfig = JSON.parse(config.emergencyKeywords as string);
      emergencyKeywords = Array.isArray(emergencyConfig) ? emergencyConfig : [];
      
      const textLowercase = text.toLowerCase();
      
      // Check for emergency keywords
      const matchedKeywords = emergencyKeywords.filter(keyword => 
        textLowercase.includes(keyword.toLowerCase())
      );
      
      if (matchedKeywords.length > 0) {
        isEmergency = true;
        emergencySeverity = 3; // High severity for direct matches
      }
    }
    
    // Intent detection
    const intents = {
      appointment: ['schedule', 'appointment', 'book', 'reserve', 'set up a time', 'make an appointment'],
      inquiry: ['price', 'cost', 'estimate', 'how much', 'information', 'details', 'question'],
      status: ['status', 'update', 'progress', 'how is', 'when will', 'completion'],
      complaint: ['problem', 'issue', 'unhappy', 'dissatisfied', 'poor', 'bad', 'complaint'],
      payment: ['pay', 'payment', 'invoice', 'bill', 'receipt', 'charge', 'credit card'],
      location: ['address', 'where', 'location', 'directions', 'how to get', 'find you'],
      hours: ['hours', 'open', 'close', 'time', 'schedule', 'when are you open'],
      services: ['service', 'offer', 'provide', 'do you', 'can you', 'available']
    };
    
    // Detect intent
    let detectedIntent = 'general';
    let intentConfidence = 0;
    
    const textLowercase = text.toLowerCase();
    for (const [intent, patterns] of Object.entries(intents)) {
      for (const pattern of patterns) {
        if (textLowercase.includes(pattern)) {
          detectedIntent = intent;
          intentConfidence = 0.7;
          
          // If multiple words from the same intent match, increase confidence
          const additionalMatches = patterns.filter(p => p !== pattern && textLowercase.includes(p)).length;
          if (additionalMatches > 0) {
            intentConfidence = Math.min(0.95, intentConfidence + (additionalMatches * 0.1));
          }
          
          break;
        }
      }
      if (intentConfidence > 0) break;
    }
    
    // Emergency overrides any other intent
    if (isEmergency) {
      detectedIntent = 'emergency';
      intentConfidence = 0.9 + (emergencySeverity * 0.03); // 0.93 - 0.99 based on severity
    }
    
    // Personalize the response
    const greeting = name ? `Hello ${name}. ` : '';
    
    // Determine action and response based on intent and business hours
    let action = '';
    let response = '';
    let responseParams = {};
    
    if (detectedIntent === 'emergency') {
      action = 'transfer_emergency';
      response = `${greeting}I understand this is an emergency situation. I'll connect you with our on-call staff immediately.`;
      responseParams = { emergencySeverity };
    } else if (!isBusinessHours) {
      // After hours handling
      if (detectedIntent === 'appointment') {
        action = 'schedule_appointment';
        response = `${greeting}${config.afterHoursMessage || 'Our office is currently closed.'} I can help you schedule an appointment for when we're open.`;
      } else if (config.voicemailEnabled) {
        action = 'take_voicemail';
        response = `${greeting}${config.afterHoursMessage || 'Our office is currently closed.'} Would you like to leave a voicemail?`;
      } else {
        action = 'provide_info';
        response = `${greeting}${config.afterHoursMessage || 'Our office is currently closed.'} I'd be happy to provide information about our services or take a message.`;
      }
    } else {
      // During business hours
      switch (detectedIntent) {
        case 'appointment':
          action = 'schedule_appointment';
          response = `${greeting}I'd be happy to help you schedule an appointment. What day and time works best for you?`;
          break;
        case 'inquiry':
          action = 'provide_info';
          response = `${greeting}I'd be happy to provide information about our services and pricing. What specific service are you interested in?`;
          break;
        case 'status':
          action = 'check_status';
          response = `${greeting}I can help you check the status of your service. Could you please provide your name or phone number so I can look that up for you?`;
          break;
        case 'complaint':
          action = 'transfer_to_manager';
          response = `${greeting}I'm sorry to hear you're experiencing an issue. Let me connect you with our customer service manager who can help resolve this for you.`;
          break;
        case 'payment':
          action = 'payment_options';
          response = `${greeting}I can help you with payment options or questions about your invoice. What specifically do you need assistance with?`;
          break;
        case 'location':
          action = 'provide_location';
          response = `${greeting}I'd be happy to provide our location and directions. Our address is [ADDRESS], and we're located [DIRECTIONS].`;
          break;
        case 'hours':
          action = 'provide_hours';
          let businessHoursText = 'Our business hours are: ';
          businessHours.forEach((hour, i) => {
            if (i > 0) businessHoursText += ', ';
            businessHoursText += `${capitalizeFirstLetter(hour.day)}: `;
            if (hour.isClosed) {
              businessHoursText += 'Closed';
            } else {
              businessHoursText += `${formatTime(hour.open || '')} to ${formatTime(hour.close || '')}`;
            }
          });
          response = `${greeting}${businessHoursText}`;
          break;
        case 'services':
          action = 'list_services';
          response = `${greeting}We offer a variety of services including [SERVICES]. Is there a specific service you're interested in?`;
          break;
        default:
          action = 'continue_conversation';
          response = `${greeting}${config.greeting || 'How can I assist you today?'}`;
      }
    }
    
    return {
      action,
      response,
      intent: detectedIntent,
      confidence: intentConfidence,
      isEmergency,
      emergencySeverity,
      isBusinessHours,
      responseParams
    };
  } catch (error) {
    console.error('Error processing virtual receptionist call:', error);
    
    // Return a fallback response
    return {
      action: 'handle_error',
      response: "I apologize, but I'm experiencing a technical issue. Please try again later or leave a message.",
      intent: 'error',
      confidence: 1.0,
      isEmergency: false,
      isBusinessHours: true
    };
  }
}

/**
 * Format time from 24-hour format to 12-hour format
 * @param time24 Time in 24-hour format (HH:MM)
 * @returns Formatted time in 12-hour format
 */
function formatTime(time24: string): string {
  if (!time24 || !time24.includes(':')) return '';
  
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Capitalize the first letter of a string
 * @param str String to capitalize
 * @returns Capitalized string
 */
function capitalizeFirstLetter(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Create an auxiliary service to handle call log creation
export async function createCallLog(
  logData: InsertCallLog, 
  additionalData?: { appointmentId?: number }
) {
  try {
    const callLog = await storage.createCallLog(logData);
    return callLog;
  } catch (error) {
    console.error('Error creating call log:', error);
    throw error;
  }
}