/**
 * Retell AI Provisioning Service
 *
 * Manages the full lifecycle of Retell AI resources for businesses:
 * create agent, connect phone (via SIP trunk), update, delete.
 *
 * Drop-in replacement for vapiProvisioningService with identical function signatures.
 *
 * SIP TRUNK SETUP NOTE:
 * The setupElasticSIPTrunk function is the most failure-prone part of this migration.
 * It involves Twilio API calls for trunk creation, origination, termination, and
 * phone number association. Built with extensive logging and idempotency.
 *
 * Retell uses Twilio Elastic SIP Trunking instead of direct phone import:
 *   1. Create Elastic SIP Trunk in Twilio
 *   2. Configure origination URI: sip:sip.retellai.com
 *   3. Configure termination with IP ACL whitelisting Retell's CIDR
 *   4. Associate the phone number with the trunk
 *   5. Import the phone number to Retell with the termination URI
 */

import { storage } from '../storage';
import retellService from './retellService';
import { Business, businessPhoneNumbers, Staff } from '@shared/schema';
import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import twilio from 'twilio';

/**
 * Business object augmented with runtime properties injected before
 * passing to the system prompt builder. These properties are NOT
 * persisted in the database — they are attached in-memory during
 * provisioning / update flows.
 */
interface BusinessWithExtras extends Business {
  _staff?: Staff[];
  _intelligenceHints?: string;
}

/**
 * Shape returned by Drizzle's `db.execute(sql`...`)` for raw SQL queries.
 * Drizzle may return `{ rows: [...] }` or a bare array depending on the driver.
 */
interface RawQueryResult {
  rows?: Array<Record<string, unknown>>;
  [index: number]: Record<string, unknown> | undefined;
}

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Retell's SIP SBC CIDR block for IP whitelisting
// 18.98.16.120/30 covers IPs: 18.98.16.120, 18.98.16.121, 18.98.16.122, 18.98.16.123
const RETELL_SIP_CIDR = '18.98.16.120/30';
const RETELL_SIP_ORIGINATION_URI = 'sip:sip.retellai.com';

// Individual IPs from the /30 CIDR block (Twilio ACL requires individual IPs)
const RETELL_SIP_IPS = [
  { ip: '18.98.16.120', label: 'retell-sip-1' },
  { ip: '18.98.16.121', label: 'retell-sip-2' },
  { ip: '18.98.16.122', label: 'retell-sip-3' },
  { ip: '18.98.16.123', label: 'retell-sip-4' },
];

// Debounce map for agent updates
const pendingUpdates = new Map<number, NodeJS.Timeout>();
const DEBOUNCE_DELAY_MS = 2000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface SIPTrunkResult {
  success: boolean;
  trunkSid?: string;
  terminationUri?: string;
  error?: string;
  failedAtStep?: string;
}

// ─── SIP Trunk Setup (Critical Path) ────────────────────────────────────────

/**
 * Set up an Elastic SIP Trunk in Twilio for Retell AI integration.
 *
 * This is the HIGHEST RISK function in the Retell migration. It involves
 * multiple sequential Twilio API calls that must all succeed. Built with:
 * - Step-by-step logging at every stage
 * - Idempotency (safe to retry — reuses existing trunk if found)
 * - Clear error messages identifying exactly which step failed
 * - Graceful cleanup hints on failure
 *
 * Steps:
 *   1. Create Elastic SIP Trunk (or reuse existing)
 *   2. Add origination URI (sip:sip.retellai.com)
 *   3. Create IP Access Control List for Retell's IPs
 *   4. Add Retell's 4 IPs to the ACL
 *   5. Set termination with the ACL on the trunk
 *   6. Associate the phone number with the trunk
 *
 * @param twilioAccountSid - Twilio account SID
 * @param twilioAuthToken - Twilio auth token
 * @param phoneNumber - E.164 phone number (e.g., +14155551234)
 * @param phoneSid - Twilio phone number SID (e.g., PN...)
 */
export async function setupElasticSIPTrunk(
  twilioAccountSid: string,
  twilioAuthToken: string,
  phoneNumber: string,
  phoneSid: string
): Promise<SIPTrunkResult> {
  const logPrefix = `[SIP Trunk ${phoneNumber}]`;
  const trunkFriendlyName = `SBA-Retell-${phoneNumber}`;
  const aclFriendlyName = `retell-sip-acl-${phoneNumber}`;

  console.log(`${logPrefix} Starting Elastic SIP Trunk setup...`);
  console.log(`${logPrefix} Phone SID: ${phoneSid}`);
  console.log(`${logPrefix} Trunk name: ${trunkFriendlyName}`);

  let client: twilio.Twilio;

  try {
    client = twilio(twilioAccountSid, twilioAuthToken);
  } catch (err) {
    console.error(`${logPrefix} Failed to initialize Twilio client:`, err);
    return {
      success: false,
      error: `Twilio client initialization failed: ${String(err)}`,
      failedAtStep: 'init',
    };
  }

  // ── Step 1: Create or reuse Elastic SIP Trunk ──────────────────────────

  let trunkSid: string;

  try {
    console.log(`${logPrefix} Step 1/6: Checking for existing trunk "${trunkFriendlyName}"...`);

    // Check if a trunk already exists for this phone number (idempotency)
    const existingTrunks = await client.trunking.v1.trunks.list({ limit: 100 });
    const existingTrunk = existingTrunks.find(
      (t) => t.friendlyName === trunkFriendlyName
    );

    if (existingTrunk) {
      trunkSid = existingTrunk.sid;
      console.log(`${logPrefix} Step 1/6: Reusing existing trunk ${trunkSid}`);
    } else {
      console.log(`${logPrefix} Step 1/6: Creating new Elastic SIP Trunk...`);
      const trunk = await client.trunking.v1.trunks.create({
        friendlyName: trunkFriendlyName,
      });
      trunkSid = trunk.sid;
      console.log(`${logPrefix} Step 1/6: Created trunk ${trunkSid}`);
    }
  } catch (err) {
    const msg = `Failed to create/find SIP trunk: ${String(err)}`;
    console.error(`${logPrefix} Step 1/6 FAILED:`, msg);
    return { success: false, error: msg, failedAtStep: 'create_trunk' };
  }

  // ── Step 2: Add origination URI ────────────────────────────────────────

  try {
    console.log(`${logPrefix} Step 2/6: Adding origination URI ${RETELL_SIP_ORIGINATION_URI}...`);

    // Check if origination URI already exists (idempotency)
    const existingOrigins = await client.trunking.v1
      .trunks(trunkSid)
      .originationUrls.list({ limit: 20 });

    const existingOrigin = existingOrigins.find(
      (o) => o.sipUrl === RETELL_SIP_ORIGINATION_URI
    );

    if (existingOrigin) {
      console.log(`${logPrefix} Step 2/6: Origination URI already exists (${existingOrigin.sid}), skipping`);
    } else {
      await client.trunking.v1
        .trunks(trunkSid)
        .originationUrls.create({
          friendlyName: 'Retell AI SIP',
          sipUrl: RETELL_SIP_ORIGINATION_URI,
          priority: 10,
          weight: 100,
          enabled: true,
        });
      console.log(`${logPrefix} Step 2/6: Origination URI added successfully`);
    }
  } catch (err) {
    const msg = `Failed to add origination URI: ${String(err)}`;
    console.error(`${logPrefix} Step 2/6 FAILED:`, msg);
    console.error(`${logPrefix} Trunk ${trunkSid} was created but origination not set. You can retry safely.`);
    return { success: false, trunkSid, error: msg, failedAtStep: 'origination_uri' };
  }

  // ── Step 3: Create IP Access Control List ──────────────────────────────

  let aclSid: string;

  try {
    console.log(`${logPrefix} Step 3/6: Creating IP Access Control List "${aclFriendlyName}"...`);

    // Check if ACL already exists (idempotency)
    const existingAcls = await client.sip.ipAccessControlLists.list({ limit: 100 });
    const existingAcl = existingAcls.find(
      (a) => a.friendlyName === aclFriendlyName
    );

    if (existingAcl) {
      aclSid = existingAcl.sid;
      console.log(`${logPrefix} Step 3/6: Reusing existing ACL ${aclSid}`);
    } else {
      const acl = await client.sip.ipAccessControlLists.create({
        friendlyName: aclFriendlyName,
      });
      aclSid = acl.sid;
      console.log(`${logPrefix} Step 3/6: Created ACL ${aclSid}`);
    }
  } catch (err) {
    const msg = `Failed to create IP ACL: ${String(err)}`;
    console.error(`${logPrefix} Step 3/6 FAILED:`, msg);
    console.error(`${logPrefix} Trunk ${trunkSid} exists with origination. ACL creation failed. You can retry safely.`);
    return { success: false, trunkSid, error: msg, failedAtStep: 'create_acl' };
  }

  // ── Step 4: Add Retell's IPs to the ACL ────────────────────────────────

  try {
    console.log(`${logPrefix} Step 4/6: Adding ${RETELL_SIP_IPS.length} Retell IPs to ACL (CIDR ${RETELL_SIP_CIDR})...`);

    // Get existing IPs in the ACL (idempotency)
    const existingIps = await client.sip
      .ipAccessControlLists(aclSid)
      .ipAddresses.list({ limit: 20 });

    const existingIpSet = new Set(existingIps.map((ip) => ip.ipAddress));

    for (const { ip, label } of RETELL_SIP_IPS) {
      if (existingIpSet.has(ip)) {
        console.log(`${logPrefix} Step 4/6: IP ${ip} (${label}) already in ACL, skipping`);
        continue;
      }

      await client.sip
        .ipAccessControlLists(aclSid)
        .ipAddresses.create({
          friendlyName: label,
          ipAddress: ip,
        });
      console.log(`${logPrefix} Step 4/6: Added IP ${ip} (${label}) to ACL`);
    }

    console.log(`${logPrefix} Step 4/6: All Retell IPs configured in ACL`);
  } catch (err) {
    const msg = `Failed to add IPs to ACL: ${String(err)}`;
    console.error(`${logPrefix} Step 4/6 FAILED:`, msg);
    console.error(`${logPrefix} ACL ${aclSid} exists but may have partial IPs. You can retry safely.`);
    return { success: false, trunkSid, error: msg, failedAtStep: 'add_ips_to_acl' };
  }

  // ── Step 5: Set termination with ACL on the trunk ──────────────────────

  try {
    console.log(`${logPrefix} Step 5/6: Setting termination credentials on trunk with ACL ${aclSid}...`);

    // Check if this ACL is already associated with the trunk's termination
    const existingTermAcls = await client.trunking.v1
      .trunks(trunkSid)
      .ipAccessControlLists.list({ limit: 20 });

    const alreadyAssociated = existingTermAcls.find((a) => a.sid === aclSid);

    if (alreadyAssociated) {
      console.log(`${logPrefix} Step 5/6: ACL ${aclSid} already associated with trunk termination, skipping`);
    } else {
      await client.trunking.v1
        .trunks(trunkSid)
        .ipAccessControlLists.create({
          ipAccessControlListSid: aclSid,
        });
      console.log(`${logPrefix} Step 5/6: Termination ACL associated with trunk`);
    }
  } catch (err) {
    const msg = `Failed to set termination on trunk: ${String(err)}`;
    console.error(`${logPrefix} Step 5/6 FAILED:`, msg);
    console.error(`${logPrefix} Trunk ${trunkSid} and ACL ${aclSid} exist. Termination association failed. You can retry safely.`);
    return { success: false, trunkSid, error: msg, failedAtStep: 'set_termination' };
  }

  // ── Step 6: Associate the phone number with the trunk ──────────────────

  try {
    console.log(`${logPrefix} Step 6/6: Associating phone ${phoneNumber} (SID: ${phoneSid}) with trunk ${trunkSid}...`);

    // Check if already associated (idempotency)
    const existingPhones = await client.trunking.v1
      .trunks(trunkSid)
      .phoneNumbers.list({ limit: 50 });

    const alreadyAssociated = existingPhones.find(
      (p) => p.phoneNumber === phoneNumber || p.sid === phoneSid
    );

    if (alreadyAssociated) {
      console.log(`${logPrefix} Step 6/6: Phone ${phoneNumber} already associated with trunk, skipping`);
    } else {
      await client.trunking.v1
        .trunks(trunkSid)
        .phoneNumbers.create({
          phoneNumberSid: phoneSid,
        });
      console.log(`${logPrefix} Step 6/6: Phone number associated with trunk`);
    }
  } catch (err) {
    const msg = `Failed to associate phone with trunk: ${String(err)}`;
    console.error(`${logPrefix} Step 6/6 FAILED:`, msg);
    console.error(`${logPrefix} Trunk ${trunkSid} is fully configured but phone not associated. You can retry safely.`);
    return { success: false, trunkSid, error: msg, failedAtStep: 'associate_phone' };
  }

  // ── Success ────────────────────────────────────────────────────────────

  // Build the termination URI that Retell needs for inbound call routing.
  // The friendly name was set to SBA-Retell-{phoneNumber} which Twilio uses as the domain.
  // Retell expects format: {friendly-name-slug}.pstn.twilio.com (NO sip: prefix)
  let terminationUri: string | undefined;
  try {
    const trunk = await client.trunking.v1.trunks(trunkSid).fetch();
    if (trunk.domainName) {
      // domainName is already the full PSTN domain (e.g., "sba-retell-14436725395.pstn.twilio.com")
      // Retell wants it WITHOUT sip: prefix
      terminationUri = trunk.domainName.replace(/^sip:/i, '');
      console.log(`${logPrefix} Termination URI from trunk.domainName: ${terminationUri}`);
    }
  } catch (err) {
    console.warn(`${logPrefix} Could not fetch domainName from trunk:`, err);
  }

  // Fallback: construct from the friendly name we used
  if (!terminationUri) {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    terminationUri = `sba-retell-${cleanPhone}.pstn.twilio.com`;
    console.log(`${logPrefix} Termination URI (constructed fallback): ${terminationUri}`);
  }

  console.log(`${logPrefix} SIP Trunk setup COMPLETE`);
  console.log(`${logPrefix}   Trunk SID: ${trunkSid}`);
  console.log(`${logPrefix}   Origination: ${RETELL_SIP_ORIGINATION_URI}`);
  console.log(`${logPrefix}   ACL: ${aclSid} (${RETELL_SIP_IPS.length} IPs)`);
  console.log(`${logPrefix}   Phone: ${phoneNumber} (${phoneSid})`);

  return {
    success: true,
    trunkSid,
    terminationUri,
  };
}

// ─── Debounced Update ────────────────────────────────────────────────────────

/**
 * Debounced version of updateRetellAgent.
 * Multiple calls within DEBOUNCE_DELAY_MS for the same business
 * are coalesced into a single update using the latest data.
 */
export function debouncedUpdateRetellAgent(businessId: number): void {
  const existing = pendingUpdates.get(businessId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(async () => {
    pendingUpdates.delete(businessId);
    try {
      console.log(`[Debounced] Executing Retell update for business ${businessId}`);
      await updateRetellAgent(businessId);
    } catch (error) {
      console.error(`[Debounced] Error updating Retell agent for business ${businessId}:`, error);
    }
  }, DEBOUNCE_DELAY_MS);

  pendingUpdates.set(businessId, timeout);
  console.log(`[Debounced] Scheduled Retell update for business ${businessId} (${DEBOUNCE_DELAY_MS}ms delay)`);
}

// ─── Provision ───────────────────────────────────────────────────────────────

/**
 * Provision a complete Retell AI setup for a business.
 * Creates LLM + agent and optionally connects phone number via SIP trunk.
 *
 * Drop-in replacement for provisionVapiForBusiness.
 */
export async function provisionRetellForBusiness(businessId: number): Promise<{
  success: boolean;
  agentId?: string;
  phoneConnected?: boolean;
  error?: string;
}> {
  if (!RETELL_API_KEY) {
    return { success: false, error: 'Retell API key not configured' };
  }

  try {
    // Get business details
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    // Get ALL business data for the system prompt — this is the AI's brain
    const [services, businessHours, receptionistConfig, staff] = await Promise.all([
      storage.getServices(businessId),
      storage.getBusinessHours(businessId),
      storage.getReceptionistConfig(businessId),
      storage.getStaff(businessId),
    ]);

    // Load AI knowledge base section for the system prompt (FAQs from business_knowledge table)
    let knowledgeSection = '';
    try {
      const { buildKnowledgeSection } = await import('./knowledgePromptBuilder');
      knowledgeSection = await buildKnowledgeSection(businessId);
    } catch (e) {
      console.warn('Could not load knowledge section:', e);
    }

    // Load intelligence hints — patterns from recent calls (unanswered Qs, popular services, objections, sentiment)
    let intelligenceHints: string | undefined;
    try {
      const { buildIntelligenceHints } = await import('./systemPromptBuilder');
      intelligenceHints = await buildIntelligenceHints(businessId);
    } catch (e) {
      console.warn('Could not load intelligence hints:', e);
    }

    // Inject staff into business object for system prompt builder (it reads business.staff or staff param)
    const augmentedBusiness: BusinessWithExtras = Object.assign(business, {
      _staff: staff,
      _intelligenceHints: intelligenceHints,
    });

    // Check if Retell agent already exists — read retellAgentId via raw SQL
    // since the column may not be in the Drizzle schema yet
    const bizResult = await db.execute(
      sql`SELECT retell_agent_id, retell_llm_id FROM businesses WHERE id = ${businessId}`
    );
    const rawResult = bizResult as unknown as RawQueryResult;
    const bizRow = rawResult.rows?.[0] || rawResult[0];
    const existingAgentId = bizRow?.retell_agent_id as string | null;
    const existingLlmId = bizRow?.retell_llm_id as string | null;

    let agentId: string;
    let llmId: string;

    if (existingAgentId && existingLlmId) {
      // Update existing LLM + agent
      console.log(`[Retell] Business ${businessId} already has agent ${existingAgentId}, updating...`);

      const updateResult = await retellService.updateLlm(
        existingLlmId,
        augmentedBusiness,
        services,
        businessHours,
        receptionistConfig,
        knowledgeSection
      );

      if (!updateResult.success) {
        console.error(`[Retell] Failed to update LLM for business ${businessId}:`, updateResult.error);
      }

      const agentUpdateResult = await retellService.updateAgent(
        existingAgentId,
        existingLlmId,
        augmentedBusiness,
        receptionistConfig
      );

      if (!agentUpdateResult.success) {
        console.error(`[Retell] Failed to update agent for business ${businessId}:`, agentUpdateResult.error);
      }

      agentId = existingAgentId;
      llmId = existingLlmId;
    } else {
      // Create new LLM first, then agent
      console.log(`[Retell] Creating new LLM + agent for business ${businessId}...`);

      const llmResult = await retellService.createLlmForBusiness(
        augmentedBusiness,
        services,
        businessHours,
        receptionistConfig,
        knowledgeSection
      );

      if (!llmResult.llmId) {
        return { success: false, error: llmResult.error || 'Failed to create Retell LLM' };
      }
      llmId = llmResult.llmId;

      const agentResult = await retellService.createAgentForBusiness(
        llmId,
        augmentedBusiness,
        receptionistConfig
      );

      if (!agentResult.agentId) {
        return { success: false, error: agentResult.error || 'Failed to create Retell agent' };
      }
      agentId = agentResult.agentId;

      // Save agent + LLM IDs to business (raw SQL — columns not in Drizzle schema yet)
      await db.execute(
        sql`UPDATE businesses SET retell_agent_id = ${agentId}, retell_llm_id = ${llmId} WHERE id = ${businessId}`
      );

      console.log(`[Retell] Created LLM ${llmId} + agent ${agentId} for business ${businessId}`);
    }

    // Connect ALL active phone numbers via SIP trunk + Retell import
    let phoneConnected = false;
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const activePhoneNumbers = await db
        .select()
        .from(businessPhoneNumbers)
        .where(
          and(
            eq(businessPhoneNumbers.businessId, businessId),
            eq(businessPhoneNumbers.status, 'active')
          )
        );

      if (activePhoneNumbers.length > 0) {
        for (const phoneRecord of activePhoneNumbers) {
          try {
            const result = await connectSinglePhoneToRetell(
              phoneRecord.twilioPhoneNumber,
              phoneRecord.twilioPhoneNumberSid,
              agentId,
              phoneRecord.id,
              businessId
            );
            if (result.success) {
              phoneConnected = true;
            }
          } catch (phoneErr) {
            console.error(
              `[Retell] Failed to connect phone ${phoneRecord.twilioPhoneNumber} for business ${businessId}:`,
              phoneErr
            );
          }
        }
      } else if (business.twilioPhoneNumber && business.twilioPhoneNumberSid) {
        // Fallback: connect the legacy single number if no multi-line records exist yet
        const phoneResult = await connectPhoneToRetell(businessId, agentId);
        phoneConnected = phoneResult.success;
      }
    }

    // Sync knowledge base to Retell (FAQs + website crawling) — fire and forget
    try {
      const kbResult = await retellService.syncKnowledgeBase(businessId);
      if (kbResult.knowledgeBaseId) {
        console.log(`[Retell] KB synced for business ${businessId}: ${kbResult.knowledgeBaseId}`);
      }
    } catch (kbErr) {
      console.warn(`[Retell] KB sync failed for business ${businessId} (non-critical):`, kbErr);
    }

    return {
      success: true,
      agentId,
      phoneConnected,
    };
  } catch (error) {
    console.error('[Retell] Error provisioning for business:', error);
    return { success: false, error: String(error) };
  }
}

// ─── Connect Phone ───────────────────────────────────────────────────────────

/**
 * Internal helper: connect a single phone number to Retell via SIP trunk.
 * Sets up the Elastic SIP Trunk in Twilio, then imports the number to Retell.
 */
async function connectSinglePhoneToRetell(
  phoneNumber: string,
  phoneSid: string,
  agentId: string,
  phoneRecordId: number,
  businessId: number
): Promise<{ success: boolean; retellPhoneNumberId?: string; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, error: 'Twilio not configured' };
  }

  // Step 1: Set up Elastic SIP Trunk
  const trunkResult = await setupElasticSIPTrunk(
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    phoneNumber,
    phoneSid
  );

  if (!trunkResult.success) {
    return {
      success: false,
      error: `SIP trunk setup failed at step "${trunkResult.failedAtStep}": ${trunkResult.error}`,
    };
  }

  // Step 2: Import phone number to Retell with the termination URI
  const importResult = await retellService.importPhoneNumber(
    phoneNumber,
    trunkResult.terminationUri!,
    agentId
  );

  if (!importResult.phoneNumberId) {
    return {
      success: false,
      error: importResult.error || 'Failed to import phone number to Retell',
    };
  }

  // Step 3: Save the Retell phone number ID to the business_phone_numbers record
  // Use raw SQL since retell_phone_number_id column may not be in Drizzle schema yet
  await db.execute(
    sql`UPDATE business_phone_numbers SET retell_phone_number_id = ${importResult.phoneNumberId}, updated_at = NOW() WHERE id = ${phoneRecordId}`
  );

  console.log(
    `[Retell] Connected phone ${phoneNumber} (record ${phoneRecordId}) to Retell for business ${businessId}`
  );

  return { success: true, retellPhoneNumberId: importResult.phoneNumberId };
}

/**
 * Connect a Twilio phone number to Retell AI for a business.
 * Uses the business's primary/legacy phone number.
 *
 * Drop-in replacement for connectPhoneToVapi.
 */
export async function connectPhoneToRetell(
  businessId: number,
  agentId?: string
): Promise<{ success: boolean; phoneNumberId?: string; error?: string }> {
  if (!RETELL_API_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, error: 'Retell or Twilio not configured' };
  }

  try {
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    if (!business.twilioPhoneNumber) {
      return { success: false, error: 'Business has no phone number' };
    }

    if (!business.twilioPhoneNumberSid) {
      return { success: false, error: 'Business has no phone number SID (needed for SIP trunk)' };
    }

    // Resolve the Retell agent ID
    let targetAgentId = agentId;
    if (!targetAgentId) {
      const bizResult = await db.execute(
        sql`SELECT retell_agent_id FROM businesses WHERE id = ${businessId}`
      );
      const cpRawResult = bizResult as unknown as RawQueryResult;
      const cpRow = cpRawResult.rows?.[0] || cpRawResult[0];
      targetAgentId = (cpRow?.retell_agent_id as string) ?? undefined;
    }

    if (!targetAgentId) {
      return { success: false, error: 'No Retell agent for this business' };
    }

    // Set up SIP trunk + import to Retell
    const trunkResult = await setupElasticSIPTrunk(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      business.twilioPhoneNumber,
      business.twilioPhoneNumberSid
    );

    if (!trunkResult.success) {
      return {
        success: false,
        error: `SIP trunk setup failed at step "${trunkResult.failedAtStep}": ${trunkResult.error}`,
      };
    }

    // Import phone number to Retell
    const importResult = await retellService.importPhoneNumber(
      business.twilioPhoneNumber,
      trunkResult.terminationUri!,
      targetAgentId
    );

    if (!importResult.phoneNumberId) {
      return { success: false, error: importResult.error || 'Failed to import phone to Retell' };
    }

    // Save Retell phone number ID
    await db.execute(
      sql`UPDATE businesses SET retell_phone_number_id = ${importResult.phoneNumberId} WHERE id = ${businessId}`
    );

    console.log(
      `[Retell] Connected phone ${business.twilioPhoneNumber} to Retell for business ${businessId}`
    );

    return { success: true, phoneNumberId: importResult.phoneNumberId };
  } catch (error) {
    console.error('[Retell] Error connecting phone:', error);
    return { success: false, error: String(error) };
  }
}

// ─── Update Agent ────────────────────────────────────────────────────────────

/**
 * Update Retell agent when business details or services change.
 *
 * Drop-in replacement for updateVapiAssistant.
 */
export async function updateRetellAgent(businessId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!RETELL_API_KEY) {
    return { success: false, error: 'Retell API key not configured' };
  }

  try {
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    // Check if agent exists via raw SQL
    const bizResult = await db.execute(
      sql`SELECT retell_agent_id, retell_llm_id FROM businesses WHERE id = ${businessId}`
    );
    const rawResult = bizResult as unknown as RawQueryResult;
    const bizRow = rawResult.rows?.[0] || rawResult[0];
    const existingAgentId = bizRow?.retell_agent_id as string | null;
    const existingLlmId = bizRow?.retell_llm_id as string | null;

    if (!existingAgentId || !existingLlmId) {
      // No agent yet, create one
      const result = await provisionRetellForBusiness(businessId);
      return { success: result.success, error: result.error };
    }

    // Get ALL business data for the system prompt — this is the AI's brain
    const [services, businessHours, receptionistConfig, staff] = await Promise.all([
      storage.getServices(businessId),
      storage.getBusinessHours(businessId),
      storage.getReceptionistConfig(businessId),
      storage.getStaff(businessId),
    ]);

    // Load AI knowledge base section for the system prompt
    let knowledgeSection = '';
    try {
      const { buildKnowledgeSection } = await import('./knowledgePromptBuilder');
      knowledgeSection = await buildKnowledgeSection(businessId);
    } catch (e) {
      console.warn('Could not load knowledge section:', e);
    }

    // Load intelligence hints (unanswered Qs, popular services, objections, sentiment)
    let intelligenceHints: string | undefined;
    try {
      const { buildIntelligenceHints } = await import('./systemPromptBuilder');
      intelligenceHints = await buildIntelligenceHints(businessId);
    } catch (e) {
      console.warn('Could not load intelligence hints:', e);
    }

    // Inject staff + intelligence hints for the prompt builder
    const augmentedBusiness: BusinessWithExtras = Object.assign(business, {
      _staff: staff,
      _intelligenceHints: intelligenceHints,
    });

    // Update the LLM (contains the system prompt, tools, etc.)
    const llmResult = await retellService.updateLlm(
      existingLlmId,
      augmentedBusiness,
      services,
      businessHours,
      receptionistConfig,
      knowledgeSection
    );

    if (!llmResult.success) {
      return { success: false, error: llmResult.error };
    }

    // Update the agent (contains voice, interruption settings, etc.)
    const agentResult = await retellService.updateAgent(
      existingAgentId,
      existingLlmId,
      augmentedBusiness,
      receptionistConfig
    );

    if (!agentResult.success) {
      return { success: false, error: agentResult.error };
    }

    // Sync knowledge base to Retell vector DB (FAQs + website content) — fire and forget
    try {
      const kbResult = await retellService.syncKnowledgeBase(businessId);
      if (kbResult.knowledgeBaseId) {
        console.log(`[Retell] KB synced for business ${businessId}: ${kbResult.knowledgeBaseId}`);
      }
    } catch (kbErr) {
      console.warn(`[Retell] KB sync failed for business ${businessId} (non-critical):`, kbErr);
    }

    console.log(`[Retell] Updated agent for business ${businessId}`);
    return { success: true };
  } catch (error) {
    console.error('[Retell] Error updating agent:', error);
    return { success: false, error: String(error) };
  }
}

// ─── Remove Agent ────────────────────────────────────────────────────────────

/**
 * Remove Retell agent when business is deleted or deactivated.
 * Note: SIP trunk is intentionally NOT deleted (can be reused if they resubscribe).
 *
 * Drop-in replacement for removeVapiAssistant.
 */
export async function removeRetellAgent(businessId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!RETELL_API_KEY) {
    return { success: false, error: 'Retell API key not configured' };
  }

  try {
    // Read current Retell IDs via raw SQL
    const bizResult = await db.execute(
      sql`SELECT retell_agent_id, retell_llm_id FROM businesses WHERE id = ${businessId}`
    );
    const removeRawResult = bizResult as unknown as RawQueryResult;
    const bizRow = removeRawResult.rows?.[0] || removeRawResult[0];
    const existingAgentId = bizRow?.retell_agent_id as string | null;
    const existingLlmId = bizRow?.retell_llm_id as string | null;

    if (!existingAgentId && !existingLlmId) {
      return { success: true }; // Nothing to delete
    }

    // Delete the agent first (depends on LLM)
    if (existingAgentId) {
      const agentResult = await retellService.deleteAgent(existingAgentId);
      if (!agentResult.success) {
        console.error(`[Retell] Failed to delete agent ${existingAgentId}:`, agentResult.error);
        // Continue — still try to delete LLM and clear IDs
      } else {
        console.log(`[Retell] Deleted agent ${existingAgentId} for business ${businessId}`);
      }
    }

    // Delete the LLM
    if (existingLlmId) {
      const llmResult = await retellService.deleteLlm(existingLlmId);
      if (!llmResult.success) {
        console.error(`[Retell] Failed to delete LLM ${existingLlmId}:`, llmResult.error);
        // Continue — still clear IDs from DB
      } else {
        console.log(`[Retell] Deleted LLM ${existingLlmId} for business ${businessId}`);
      }
    }

    // Clear all Retell IDs from the business record
    await db.execute(
      sql`UPDATE businesses SET retell_agent_id = NULL, retell_llm_id = NULL, retell_phone_number_id = NULL WHERE id = ${businessId}`
    );

    // Clear Retell phone number IDs from business_phone_numbers
    await db.execute(
      sql`UPDATE business_phone_numbers SET retell_phone_number_id = NULL WHERE business_id = ${businessId}`
    );

    console.log(`[Retell] Removed Retell resources for business ${businessId} (SIP trunk preserved for reuse)`);
    return { success: true };
  } catch (error) {
    console.error('[Retell] Error removing agent:', error);
    return { success: false, error: String(error) };
  }
}

// ─── Get Status ──────────────────────────────────────────────────────────────

/**
 * Get Retell AI status for a business.
 *
 * Drop-in replacement for getVapiStatus.
 */
export async function getRetellStatus(businessId: number): Promise<{
  configured: boolean;
  assistantId?: string;
  phoneConnected: boolean;
  phoneNumber?: string;
}> {
  const business = await storage.getBusiness(businessId);

  if (!business) {
    return { configured: false, phoneConnected: false };
  }

  // Read Retell IDs via raw SQL since columns may not be in Drizzle schema yet
  const statusResult = await db.execute(
    sql`SELECT retell_agent_id, retell_phone_number_id FROM businesses WHERE id = ${businessId}`
  );
  const statusRawResult = statusResult as unknown as RawQueryResult;
  const statusRow = statusRawResult.rows?.[0] || statusRawResult[0];
  const retellAgentId = statusRow?.retell_agent_id as string | null;
  const retellPhoneNumberId = statusRow?.retell_phone_number_id as string | null;

  return {
    configured: !!retellAgentId,
    assistantId: retellAgentId || undefined,
    phoneConnected: !!retellPhoneNumberId,
    phoneNumber: business.twilioPhoneNumber || undefined,
  };
}

// ─── Connect Specific Phone ──────────────────────────────────────────────────

/**
 * Connect a specific phone number (by business_phone_numbers ID) to Retell.
 *
 * Drop-in replacement for connectSpecificPhoneToVapi.
 */
export async function connectSpecificPhoneToRetell(
  businessId: number,
  phoneNumberId: number
): Promise<{ success: boolean; retellPhoneNumberId?: string; error?: string }> {
  if (!RETELL_API_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, error: 'Retell or Twilio not configured' };
  }

  try {
    // Read the phone number record from business_phone_numbers
    const [phoneRecord] = await db
      .select()
      .from(businessPhoneNumbers)
      .where(
        and(
          eq(businessPhoneNumbers.id, phoneNumberId),
          eq(businessPhoneNumbers.businessId, businessId)
        )
      );

    if (!phoneRecord) {
      return {
        success: false,
        error: `Phone number record ${phoneNumberId} not found for business ${businessId}`,
      };
    }

    // Get the business's Retell agent ID
    const bizResult = await db.execute(
      sql`SELECT retell_agent_id FROM businesses WHERE id = ${businessId}`
    );
    const csRawResult = bizResult as unknown as RawQueryResult;
    const csRow = csRawResult.rows?.[0] || csRawResult[0];
    const retellAgentId = csRow?.retell_agent_id as string | null;

    if (!retellAgentId) {
      return { success: false, error: 'No Retell agent for this business' };
    }

    // Connect via SIP trunk + Retell import
    const result = await connectSinglePhoneToRetell(
      phoneRecord.twilioPhoneNumber,
      phoneRecord.twilioPhoneNumberSid,
      retellAgentId,
      phoneRecord.id,
      businessId
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, retellPhoneNumberId: result.retellPhoneNumberId };
  } catch (error) {
    console.error('[Retell] Error connecting specific phone:', error);
    return { success: false, error: String(error) };
  }
}

// ─── Default Export ──────────────────────────────────────────────────────────

export default {
  provisionRetellForBusiness,
  connectPhoneToRetell,
  connectSpecificPhoneToRetell,
  updateRetellAgent,
  debouncedUpdateRetellAgent,
  removeRetellAgent,
  getRetellStatus,
  setupElasticSIPTrunk, // Exported for isolated testing
};
