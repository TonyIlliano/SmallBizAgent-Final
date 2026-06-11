/**
 * callTools/types — shared interfaces for the voice tool layer.
 * Extracted from callToolHandlers.ts (audit R1 split).
 */

/**
 * Provider-agnostic end-of-call data interface.
 * Each voice AI provider's webhook handler normalizes its payload into this shape.
 */
export interface EndOfCallData {
  businessId: number;
  callerPhone: string | null;
  transcript: string | null;
  callDurationSeconds: number;
  endedReason: string;
  recordingUrl: string | null;
  callStartedAt: string | null;
  callEndedAt: string | null;
  calledNumber: string | null;
}

export interface FunctionResult {
  result: any;
}

/**
 * ===========================================
 * TOOL CALL PARAMETER INTERFACES
 * ===========================================
 * Typed interfaces for each tool function's parameters,
 * replacing `as any` casts in the dispatch function.
 */

export interface BookAppointmentParams {
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  date: string;
  time: string;
  serviceId?: number;
  serviceName?: string;
  staffId?: number;
  staffName?: string;
  notes?: string;
  estimatedDuration?: number;
}

export interface BookRecurringAppointmentParams {
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  serviceId?: number;
  serviceName?: string;
  staffId?: number;
  staffName?: string;
  startDate: string;
  time: string;
  frequency: string;
  occurrences?: number;
  notes?: string;
}

export interface CreateCustomerParams {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
}

export interface RescheduleAppointmentParams {
  appointmentId?: number;
  newDate: string;
  newTime: string;
  reason?: string;
  staffName?: string;
}

export interface CancelAppointmentParams {
  appointmentId?: number;
  reason?: string;
}

export interface GetEstimateParams {
  serviceNames?: string[];
  description?: string;
}

export interface TransferToHumanParams {
  reason?: string;
  urgent?: boolean;
}

export interface LeaveMessageParams {
  message: string;
  urgent?: boolean;
  callbackRequested?: boolean;
}

export interface ScheduleCallbackParams {
  preferredTime?: string;
  preferredDate?: string;
  reason?: string;
  urgent?: boolean;
}

export interface UpdateCustomerInfoParams {
  customerId?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
}

// Step 3 of HVAC roadmap. The captureEquipment tool persists customer-mentioned
// equipment (make, model, location, etc.) during natural conversation.
export interface CaptureEquipmentParams {
  customerId?: number;
  equipmentType: string;
  make?: string;
  model?: string;
  installDate?: string;
  location?: string;
  notes?: string;
}

// Step 4 of HVAC roadmap. The checkMembership tool returns the caller's
// active plan + benefits remaining so the AI can reference them mid-call
// ("you've got 1 tune-up left", "your Elite plan waives the diagnostic fee").
export interface CheckMembershipParams {
  customerId?: number;
}

export interface ConfirmAppointmentParams {
  appointmentId?: number;
  confirmed: boolean;
}

export interface CreateOrderParams {
  items: Array<{
    itemId?: string;
    cloverItemId?: string;
    quantity: number;
    modifiers?: Array<{ modifierId?: string; cloverId?: string }>;
    notes?: string;
  }>;
  callerPhone?: string;
  callerName?: string;
  orderType?: string;
  orderNotes?: string;
}

export interface CheckReservationAvailabilityParams {
  date: string;
  partySize: number;
}

export interface MakeReservationParams {
  date: string;
  time: string;
  partySize: number;
  customerName: string;
  specialRequests?: string;
}

export interface CancelReservationParams {
  customerName: string;
  date?: string;
}

// Legacy interface kept for backward compatibility during migration
export interface _LegacyVapiWebhookRequest {
  message: {
    type: string;
    call?: {
      id: string;
      phoneNumber?: {
        number: string;
      };
      customer?: {
        number: string;
      };
      assistant?: {
        metadata?: {
          businessId?: string;
        };
      };
      metadata?: {
        businessId?: string;
      };
    };
    functionCall?: {
      name: string;
      parameters: Record<string, any>;
    };
    transcript?: string;
    endedReason?: string;
    assistant?: {
      metadata?: {
        businessId?: string;
      };
    };
  };
  metadata?: {
    businessId?: string;
  };
}

// FunctionResult already defined above — removed duplicate

