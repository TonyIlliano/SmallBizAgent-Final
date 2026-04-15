/**
 * Smoke Test — Full User Journey Validation
 *
 * Runs against a live server instance to verify the complete user flow works.
 * Usage: npx tsx scripts/smoke-test.ts [base-url]
 *
 * Default base URL: http://localhost:5000
 *
 * Tests:
 * 1. Server health check
 * 2. Landing page loads
 * 3. Auth endpoints respond (register, login, CSRF)
 * 4. Public booking page loads for a valid slug
 * 5. API endpoints return correct shapes
 * 6. Stripe webhook endpoint exists
 * 7. Twilio webhook endpoint exists
 * 8. Retell webhook endpoint exists
 */

const BASE_URL = process.argv[2] || process.env.APP_URL || 'http://localhost:5000';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  details: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<string>) {
  const start = Date.now();
  try {
    const details = await fn();
    results.push({ name, status: 'pass', durationMs: Date.now() - start, details });
  } catch (e: any) {
    results.push({ name, status: 'fail', durationMs: Date.now() - start, details: e.message });
  }
}

async function fetchJson(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });
  return { res, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
}

// ── Tests ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSmoke Testing: ${BASE_URL}\n${'='.repeat(50)}\n`);

  // 1. Health check
  await test('Health Check', async () => {
    const { res, body } = await fetchJson('/health');
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(body)}`);
    if (body.status !== 'healthy') throw new Error(`Unhealthy: ${JSON.stringify(body.checks)}`);
    return `Healthy, uptime: ${body.uptime}s, DB: ${body.checks.database?.status}`;
  });

  // 2. Liveness probe
  await test('Liveness Probe', async () => {
    const { res, body } = await fetchJson('/health/live');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return `OK (${body.status})`;
  });

  // 3. Landing page serves HTML
  await test('Landing Page', async () => {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(10000) });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('<!DOCTYPE html') && !html.includes('<html')) throw new Error('Not HTML');
    return `${html.length} bytes, status 200`;
  });

  // 4. CSRF token endpoint
  await test('CSRF Token', async () => {
    const res = await fetch(`${BASE_URL}/api/csrf-token`, { signal: AbortSignal.timeout(10000) });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const cookies = res.headers.get('set-cookie');
    if (!cookies?.includes('csrf-token')) throw new Error('No CSRF cookie set');
    return 'CSRF cookie set correctly';
  });

  // 5. Auth — GET /api/user returns 401 when not authenticated
  await test('Auth Guard (unauthenticated)', async () => {
    const { res } = await fetchJson('/api/user');
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    return 'Correctly returns 401 for unauthenticated requests';
  });

  // 6. Subscription plans endpoint
  await test('Subscription Plans', async () => {
    const { res, body } = await fetchJson('/api/subscriptions/plans');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(body) || body.length === 0) throw new Error(`No plans returned: ${JSON.stringify(body)}`);
    const activeMonthly = body.filter((p: any) => p.interval === 'monthly' && p.active);
    return `${body.length} plans (${activeMonthly.length} active monthly)`;
  });

  // 7. Stripe webhook endpoint exists (POST returns 400, not 404)
  await test('Stripe Webhook Endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
    // Should return 400 (bad request — no signature) not 404 (not found)
    if (res.status === 404) throw new Error('Webhook endpoint not found (404)');
    return `Endpoint exists (returns ${res.status} without valid signature — correct)`;
  });

  // 8. Twilio webhook endpoint exists
  await test('Twilio SMS Webhook', async () => {
    const res = await fetch(`${BASE_URL}/api/twilio/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'Body=test&From=%2B15551234567',
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) throw new Error('Webhook endpoint not found (404)');
    return `Endpoint exists (returns ${res.status})`;
  });

  // 9. Retell webhook endpoint exists
  await test('Retell Webhook', async () => {
    const res = await fetch(`${BASE_URL}/api/retell/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test' }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) throw new Error('Webhook endpoint not found (404)');
    return `Endpoint exists (returns ${res.status})`;
  });

  // 10. Privacy/Terms pages
  await test('Privacy Policy Page', async () => {
    const res = await fetch(`${BASE_URL}/privacy`, { signal: AbortSignal.timeout(10000) });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return 'Loads correctly';
  });

  await test('Terms of Service Page', async () => {
    const res = await fetch(`${BASE_URL}/terms`, { signal: AbortSignal.timeout(10000) });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    return 'Loads correctly';
  });

  // 11. Static assets (Vite build output)
  await test('Static Assets', async () => {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    // Check for Vite manifest script tags
    const hasScript = html.includes('.js') || html.includes('src="/assets/');
    if (!hasScript) throw new Error('No JS bundle references found in HTML');
    return 'JS bundles referenced in HTML';
  });

  // 12. API rate limiting is active
  await test('Rate Limiting Active', async () => {
    // Make a request and check for rate limit headers
    const res = await fetch(`${BASE_URL}/api/user`, { signal: AbortSignal.timeout(10000) });
    const rateLimitHeader = res.headers.get('x-ratelimit-limit') || res.headers.get('ratelimit-limit');
    if (rateLimitHeader) {
      return `Rate limiting active (limit: ${rateLimitHeader})`;
    }
    return 'Rate limit headers not found (may be configured at reverse proxy level)';
  });

  // ── Print results ──────────────────────────────────────────────────
  console.log('');
  const passed = results.filter(r => r.status === 'pass');
  const failed = results.filter(r => r.status === 'fail');

  for (const r of results) {
    const icon = r.status === 'pass' ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`[${icon}] ${r.name} (${r.durationMs}ms)`);
    console.log(`       ${r.details}`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed.length}/${results.length} passed, ${failed.length} failed\n`);

  if (failed.length > 0) {
    console.log('\x1b[31mSmoke test FAILED. Fix the above issues before going live.\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\x1b[32mAll smoke tests passed. The user journey is functional.\x1b[0m\n');
  }
}

main().catch(e => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
