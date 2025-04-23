import { storage } from '../storage';
import { InsertCallLog } from '@shared/schema';

/**
 * Create a call log entry
 * @param logData Data for the call log
 * @param additionalData Optional additional data related to the call
 * @returns Promise resolving to the created call log
 */
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