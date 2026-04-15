/**
 * Production Readiness Check
 *
 * Run before going live or after each deploy to verify all systems are operational.
 * Usage: npx tsx scripts/check-production-readiness.ts
 *
 * Checks:
 * 1. Required environment variables
 * 2. Database connectivity
 * 3. Stripe API + webhook secret
 * 4. Twilio API credentials
 * 5. Retell AI API
 * 6. Anthropic Claude API
 * 7. Subscription plans exist in DB
 * 8. Admin account exists
 */

import 'dotenv/config';

const BASE_URL = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:5000';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

const results: CheckResult[] = [];

function pass(name: string, details: string) {
  results.push({ name, status: 'pass', details });
}
function fail(name: string, details: string) {
  results.push({ name, status: 'fail', details });
}
function warn(name: string, details: string) {
  results.push({ name, status: 'warn', details });
}

async function checkEnvVars() {
  const required = [
    'DATABASE_URL', 'SESSION_SECRET', 'APP_URL',
    'ANTHROPIC_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'RETELL_API_KEY',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length === 0) {
    pass('Environment Variables', `All ${required.length} required vars set`);
  } else {
    fail('Environment Variables', `Missing: ${missing.join(', ')}`);
  }

  // Check for default/weak secrets
  if (process.env.SESSION_SECRET === 'dev-only-secret-change-in-production') {
    fail('Session Secret', 'Using default dev secret — change for production');
  }

  // Check APP_URL is valid
  if (process.env.APP_URL) {
    try {
      const url = new URL(process.env.APP_URL);
      if (url.protocol === 'https:') {
        pass('APP_URL', `${process.env.APP_URL} (HTTPS)`);
      } else {
        warn('APP_URL', `${process.env.APP_URL} (not HTTPS — fine for dev, required for production)`);
      }
    } catch {
      fail('APP_URL', `Invalid URL: ${process.env.APP_URL}`);
    }
  }
}

async function checkDatabase() {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
    const client = await pool.connect();
    const { rows } = await client.query('SELECT COUNT(*) as count FROM subscription_plans WHERE active = true');
    client.release();
    await pool.end();
    const planCount = parseInt(rows[0].count);
    if (planCount >= 6) {
      pass('Database + Plans', `Connected. ${planCount} active subscription plans found`);
    } else if (planCount > 0) {
      warn('Database + Plans', `Connected but only ${planCount} active plans (expected 6 for Starter/Growth/Pro monthly+annual)`);
    } else {
      fail('Database + Plans', 'Connected but 0 active subscription plans — run migrations');
    }
  } catch (e: any) {
    fail('Database', `Connection failed: ${e.message}`);
  }
}

async function checkStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    fail('Stripe', 'STRIPE_SECRET_KEY not set');
    return;
  }
  try {
    const res = await fetch('https://api.stripe.com/v1/products?limit=3&active=true', {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (res.ok) {
      const data = await res.json();
      pass('Stripe API', `Connected. ${data.data.length} active products found`);
    } else {
      fail('Stripe API', `API returned ${res.status}: ${await res.text()}`);
    }
  } catch (e: any) {
    fail('Stripe API', `Connection failed: ${e.message}`);
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    fail('Stripe Webhook', 'STRIPE_WEBHOOK_SECRET not set — webhook events cannot be verified');
  } else if (process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    pass('Stripe Webhook', 'Secret configured (whsec_...)');
  } else {
    warn('Stripe Webhook', 'Secret set but does not start with whsec_ — verify it is correct');
  }
}

async function checkTwilio() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    fail('Twilio', 'Credentials not set');
    return;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
      },
    });
    if (res.ok) {
      const data = await res.json();
      pass('Twilio', `Connected. Account: ${data.friendly_name}, Status: ${data.status}`);
    } else {
      fail('Twilio', `API returned ${res.status}`);
    }
  } catch (e: any) {
    fail('Twilio', `Connection failed: ${e.message}`);
  }
}

async function checkRetell() {
  if (!process.env.RETELL_API_KEY) {
    fail('Retell AI', 'RETELL_API_KEY not set');
    return;
  }
  try {
    const res = await fetch('https://api.retellai.com/v2/list-phone-numbers', {
      headers: { Authorization: `Bearer ${process.env.RETELL_API_KEY}` },
    });
    if (res.ok) {
      const data = await res.json();
      pass('Retell AI', `Connected. ${Array.isArray(data) ? data.length : '?'} phone numbers registered`);
    } else {
      fail('Retell AI', `API returned ${res.status}`);
    }
  } catch (e: any) {
    fail('Retell AI', `Connection failed: ${e.message}`);
  }
}

async function checkAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    fail('Anthropic Claude', 'ANTHROPIC_API_KEY not set');
    return;
  }
  // Just verify the key format — don't make an actual API call (costs money)
  if (process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
    pass('Anthropic Claude', 'API key configured (sk-ant-...)');
  } else {
    warn('Anthropic Claude', 'API key set but does not start with sk-ant- — verify it is correct');
  }
}

async function checkHealthEndpoint() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      pass('Health Endpoint', `${BASE_URL}/health returns ${data.status}, uptime: ${data.uptime}s`);
    } else {
      warn('Health Endpoint', `${BASE_URL}/health returned ${res.status} (server may not be running locally)`);
    }
  } catch {
    warn('Health Endpoint', `Could not reach ${BASE_URL}/health (server may not be running)`);
  }
}

async function checkAdminAccount() {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
    const client = await pool.connect();
    const { rows } = await client.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    client.release();
    await pool.end();
    const adminCount = parseInt(rows[0].count);
    if (adminCount > 0) {
      pass('Admin Account', `${adminCount} admin account(s) exist`);
    } else {
      warn('Admin Account', 'No admin accounts found — create one via ADMIN_EMAIL/ADMIN_PASSWORD env vars or register + promote');
    }
  } catch (e: any) {
    fail('Admin Account', `Query failed: ${e.message}`);
  }
}

// ── Run all checks ──────────────────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  SmallBizAgent Production Readiness');
  console.log('========================================\n');

  await checkEnvVars();
  await Promise.all([
    checkDatabase(),
    checkStripe(),
    checkTwilio(),
    checkRetell(),
    checkAnthropic(),
    checkHealthEndpoint(),
    checkAdminAccount(),
  ]);

  // Print results
  const passed = results.filter(r => r.status === 'pass');
  const warned = results.filter(r => r.status === 'warn');
  const failed = results.filter(r => r.status === 'fail');

  for (const r of results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'WARN' : 'FAIL';
    const color = r.status === 'pass' ? '\x1b[32m' : r.status === 'warn' ? '\x1b[33m' : '\x1b[31m';
    console.log(`${color}[${icon}]\x1b[0m ${r.name}: ${r.details}`);
  }

  console.log(`\n----------------------------------------`);
  console.log(`Results: ${passed.length} passed, ${warned.length} warnings, ${failed.length} failed`);

  if (failed.length === 0 && warned.length === 0) {
    console.log('\x1b[32m\nAll checks passed. Ready for production.\x1b[0m\n');
  } else if (failed.length === 0) {
    console.log('\x1b[33m\nNo failures but some warnings. Review before launch.\x1b[0m\n');
  } else {
    console.log('\x1b[31m\nFailed checks must be resolved before going live.\x1b[0m\n');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Readiness check crashed:', e);
  process.exit(1);
});
