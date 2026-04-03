/**
 * Create a Demo Retell Agent for the SmallBizAgent landing page
 *
 * This script:
 * 1. Creates an LLM with a demo business prompt
 * 2. Creates an Agent with a professional voice
 * 3. Outputs the agent ID and phone number setup instructions
 *
 * Usage: npx tsx scripts/create-demo-agent.ts
 */

import 'dotenv/config';

const RETELL_API_KEY = process.env.RETELL_API_KEY;
if (!RETELL_API_KEY) {
  console.error('❌ RETELL_API_KEY not found in .env');
  process.exit(1);
}

const RETELL_BASE = 'https://api.retellai.com';

async function retellPost(path: string, body: any) {
  const res = await fetch(`${RETELL_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RETELL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Retell API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function retellGet(path: string) {
  const res = await fetch(`${RETELL_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Retell API error ${res.status}: ${text}`);
  }
  return res.json();
}

const DEMO_PROMPT = `## Identity
You are the AI receptionist for SmallBizAgent Demo — a showcase of what an AI phone receptionist can do for any small business. You're friendly, professional, and conversational.

## Your Role
You're demonstrating the SmallBizAgent platform to potential customers. You can pretend to be a receptionist for ANY type of business the caller asks about. If they ask about a salon, you're a salon receptionist. If they ask about plumbing, you're a plumbing receptionist. If they don't specify, default to a general home services business called "Tony's Home Services."

## Default Business: Tony's Home Services
- Services: Drain Cleaning ($150, 1 hour), AC Tune-Up ($199, 1.5 hours), Electrical Inspection ($125, 45 min), Water Heater Install ($350, 3 hours), General Handyman ($95/hour)
- Hours: Monday-Friday 8 AM to 6 PM, Saturday 9 AM to 2 PM, Closed Sunday
- Available slots: Tomorrow morning at 9 AM and 11 AM, afternoon at 2 PM. Day after tomorrow: 10 AM and 3 PM.
- Address: 123 Main Street, Anytown USA
- Technicians: Mike (plumbing specialist), Sarah (HVAC), Dave (electrical)

## If Caller Asks About a Different Business Type
Adapt naturally. For example:
- "Salon" → You're "Bella's Hair Studio" — Haircuts $45, Color $120, Highlights $150. Stylists: Emma, Sofia, James.
- "Dental" → You're "Bright Smile Dental" — Cleanings $150, Fillings $200, Whitening $350. Dr. Chen and Dr. Patel.
- "Restaurant" → You're "Marco's Italian Kitchen" — Reservations for parties of 1-8. Open Tue-Sun 5-10 PM.
- "Auto shop" → You're "FastLane Auto Repair" — Oil Change $49, Brake Inspection $75, Diagnostics $95.

## Rules
- Keep responses SHORT — 1-2 sentences max. This is a phone call, not an essay.
- Be warm and natural. Use the caller's name if they give it.
- When "booking," confirm the service, date/time, and their name. Say you'll send a confirmation text.
- If asked "what is this?" or "is this real?", explain: "This is a live demo of SmallBizAgent — an AI receptionist that answers calls 24/7 for small businesses. Everything you're hearing is AI. Pretty cool, right? You can learn more at smallbizagent.ai."
- NEVER say you're an AI unless directly asked. Just be a great receptionist.
- If the caller seems confused or wants to talk to a human, say: "This is actually a demo of SmallBizAgent's AI receptionist. If you'd like to try it for your own business, visit smallbizagent.ai for a free 14-day trial!"

## Conversation Style
- Friendly but efficient
- Mirror the caller's energy — casual if they're casual, professional if they're formal
- Ask one question at a time
- Confirm details back before "booking"`;

async function main() {
  console.log('🤖 Creating SmallBizAgent Demo Agent on Retell AI...\n');

  // Step 1: Create LLM
  console.log('Step 1: Creating LLM...');
  const llm = await retellPost('/create-retell-llm', {
    model: 'gpt-4o-mini',
    general_prompt: DEMO_PROMPT,
    general_tools: [],
    begin_message: "Thanks for calling! This is a live demo of SmallBizAgent's AI receptionist. Go ahead and try it out — ask about booking an appointment, pricing, or anything you'd ask a real receptionist. What type of business would you like me to be today?",
    model_temperature: 0.6,
    max_tokens: 200,
  });
  console.log(`   ✅ LLM created: ${llm.llm_id}`);

  // Step 2: Create Agent
  console.log('Step 2: Creating Agent...');
  const agent = await retellPost('/create-agent', {
    agent_name: 'SmallBizAgent Demo',
    response_engine: {
      type: 'retell-llm',
      llm_id: llm.llm_id,
    },
    voice_id: '11labs-Adrian', // Professional male voice
    language: 'en-US',
    voice_temperature: 0.5,
    voice_speed: 1.0,
    responsiveness: 0.8,
    interruption_sensitivity: 0.6,
    enable_backchannel: true,
    backchannel_frequency: 0.7,
    reminder_trigger_ms: 10000,
    reminder_max_count: 2,
    ambient_sound: 'call-center',
    ambient_sound_volume: 0.3,
    end_call_after_silence_ms: 30000,
    max_call_duration_ms: 300000, // 5 minutes max
    post_call_analysis_data: [
      { type: 'string', name: 'call_summary', description: 'Brief summary of what the caller wanted' },
      { type: 'enum', name: 'caller_intent', description: 'What did the caller want?', choices: ['booking', 'pricing', 'info', 'demo_question', 'other'] },
    ],
  });
  console.log(`   ✅ Agent created: ${agent.agent_id}`);

  // Step 3: Check if we can create a phone number
  console.log('\nStep 3: Getting a phone number...');
  try {
    const phoneNumber = await retellPost('/create-phone-number', {
      agent_id: agent.agent_id,
      area_code: 732, // NJ area code — change to whatever you prefer
    });
    console.log(`   ✅ Phone number: ${phoneNumber.phone_number}`);
    console.log(`   Phone number ID: ${phoneNumber.phone_number_id}`);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 DEMO AGENT IS LIVE!');
    console.log('='.repeat(60));
    console.log(`\nAgent ID:     ${agent.agent_id}`);
    console.log(`LLM ID:       ${llm.llm_id}`);
    console.log(`Phone Number: ${phoneNumber.phone_number}`);
    console.log(`\n📱 Call ${phoneNumber.phone_number} right now to test it!`);
    console.log(`\n🔧 Next steps:`);
    console.log(`   1. Call the number and test different scenarios`);
    console.log(`   2. Add to Railway env: VITE_DEMO_PHONE_NUMBER=${phoneNumber.phone_number}`);
    console.log(`   3. Redeploy and the landing page will show the number automatically`);
  } catch (phoneErr: any) {
    console.log(`   ⚠️  Could not auto-create phone number: ${phoneErr.message}`);
    console.log(`   You can manually add one in the Retell dashboard for agent: ${agent.agent_id}`);

    console.log('\n' + '='.repeat(60));
    console.log('🤖 DEMO AGENT CREATED (no phone number yet)');
    console.log('='.repeat(60));
    console.log(`\nAgent ID: ${agent.agent_id}`);
    console.log(`LLM ID:   ${llm.llm_id}`);
    console.log(`\n🔧 Next steps:`);
    console.log(`   1. Go to retellai.com → Agents → ${agent.agent_id}`);
    console.log(`   2. Add a phone number (Buy Number or import from Twilio)`);
    console.log(`   3. Call it and test`);
    console.log(`   4. Add to Railway env: VITE_DEMO_PHONE_NUMBER=+1XXXXXXXXXX`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
