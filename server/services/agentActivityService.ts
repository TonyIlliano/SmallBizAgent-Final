import { storage } from '../storage';

export async function logAgentAction(params: {
  businessId: number;
  agentType: string;
  action: string;
  customerId?: number;
  referenceType?: string;
  referenceId?: number;
  details?: any;
}): Promise<void> {
  try {
    await storage.createAgentActivityLog({
      businessId: params.businessId,
      agentType: params.agentType,
      action: params.action,
      customerId: params.customerId ?? null,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      details: params.details ?? null,
    });
  } catch (err) {
    console.error('[AgentActivity] Failed to log action:', err);
  }
}

export default { logAgentAction };
