/**
 * Mem0 Service — Persistent AI Memory Layer
 *
 * Provides conversational memory for customers using Mem0 cloud.
 * Each customer gets a scoped memory namespace: b{businessId}_c{customerId}
 *
 * Usage:
 * - addMemory(): Fire-and-forget after calls, appointments, events
 * - searchMemory(): Retrieve relevant context for Vapi recognizeCaller()
 * - getAllMemories(): Full memory dump (admin/debug)
 * - deleteCustomerMemories(): GDPR/privacy data deletion
 *
 * Graceful degradation: If MEM0_API_KEY is not set or Mem0 is unreachable,
 * all functions return safely without throwing.
 */

import { MemoryClient } from 'mem0ai';

let client: MemoryClient | null = null;
let initialized = false;

/**
 * Initialize Mem0 client. Call once on server startup.
 * Logs a warning (not an error) if the API key is missing — Mem0 is optional.
 */
export function initMem0(): void {
  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) {
    console.warn('[Mem0] MEM0_API_KEY not set — memory features disabled');
    initialized = true;
    return;
  }

  try {
    client = new MemoryClient({ apiKey });
    initialized = true;
    console.log('[Mem0] Client initialized successfully');
  } catch (err) {
    console.error('[Mem0] Failed to initialize client:', err);
    initialized = true; // Mark as initialized so we don't retry
  }
}

/**
 * Check if Mem0 is available. Returns false if not initialized or no API key.
 */
export function isMem0Available(): boolean {
  return client !== null;
}

/**
 * Build the multi-tenant user ID for Mem0.
 * Format: b{businessId}_c{customerId} — ensures no cross-contamination between businesses.
 */
function getUserId(businessId: number, customerId: number): string {
  return `b${businessId}_c${customerId}`;
}

/**
 * Add a memory for a customer. Fire-and-forget — never throws.
 *
 * @param businessId - The business this memory belongs to
 * @param customerId - The customer this memory is about
 * @param messages - Array of {role, content} messages to store
 * @param metadata - Optional metadata (e.g., {type: 'call_intelligence', callLogId: 123})
 */
export async function addMemory(
  businessId: number,
  customerId: number,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  metadata?: Record<string, any>
): Promise<void> {
  if (!client) return;

  try {
    await client.add(messages, {
      user_id: getUserId(businessId, customerId),
      metadata: {
        businessId,
        customerId,
        ...metadata,
      },
    });
    console.log(`[Mem0] Added memory for customer ${customerId} (business ${businessId})`);
  } catch (err) {
    console.error(`[Mem0] Error adding memory for customer ${customerId}:`, err);
    // Never throw — fire-and-forget
  }
}

/**
 * Search memories for a customer. Returns formatted string of relevant memories.
 * Has a hard timeout to prevent delaying call connections.
 *
 * @param businessId - The business to search within
 * @param customerId - The customer whose memories to search
 * @param query - Natural language search query
 * @param limit - Max number of memories to return (default 5)
 * @param timeoutMs - Max time to wait (default 2000ms)
 * @returns Formatted string of relevant memories, or empty string on error/timeout
 */
export async function searchMemory(
  businessId: number,
  customerId: number,
  query: string,
  limit: number = 5,
  timeoutMs: number = 2000
): Promise<string> {
  if (!client) return '';

  try {
    // Race between search and timeout
    const searchPromise = client.search(query, {
      user_id: getUserId(businessId, customerId),
      limit,
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs)
    );

    const results = await Promise.race([searchPromise, timeoutPromise]);

    if (!results || !Array.isArray(results) || results.length === 0) {
      return '';
    }

    // Format memories into a readable string for the AI context
    const formatted = results
      .map((mem: any) => mem.memory || '')
      .filter(Boolean)
      .join(' | ');

    if (formatted) {
      console.log(`[Mem0] Found ${results.length} memories for customer ${customerId} (business ${businessId})`);
    }

    return formatted;
  } catch (err) {
    console.error(`[Mem0] Error searching memories for customer ${customerId}:`, err);
    return ''; // Graceful degradation
  }
}

/**
 * Get all memories for a customer. Used for admin/debug purposes.
 *
 * @param businessId - The business context
 * @param customerId - The customer whose memories to retrieve
 * @returns Array of memory objects, or empty array on error
 */
export async function getAllMemories(
  businessId: number,
  customerId: number
): Promise<any[]> {
  if (!client) return [];

  try {
    const memories = await client.getAll({
      user_id: getUserId(businessId, customerId),
    });
    return Array.isArray(memories) ? memories : [];
  } catch (err) {
    console.error(`[Mem0] Error getting all memories for customer ${customerId}:`, err);
    return [];
  }
}

/**
 * Delete all memories for a customer. Used for GDPR/privacy compliance.
 *
 * @param businessId - The business context
 * @param customerId - The customer whose memories to delete
 * @returns true if successful, false on error
 */
export async function deleteCustomerMemories(
  businessId: number,
  customerId: number
): Promise<boolean> {
  if (!client) return false;

  try {
    await client.deleteAll({
      user_id: getUserId(businessId, customerId),
    });
    console.log(`[Mem0] Deleted all memories for customer ${customerId} (business ${businessId})`);
    return true;
  } catch (err) {
    console.error(`[Mem0] Error deleting memories for customer ${customerId}:`, err);
    return false;
  }
}
