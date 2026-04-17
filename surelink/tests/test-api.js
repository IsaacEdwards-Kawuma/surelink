/**
 * SureLink API smoke tests. Run with: npm test
 * Requires server running: npm start (in another terminal).
 *
 * Optional: API_BASE=http://host:port npm test
 * Optional: SMOKE_TOKEN=<JWT> — if set, runs one authenticated GET /api/sales
 */
const BASE = (process.env.API_BASE || 'http://localhost:3000').replace(/\/+$/, '');

async function request(method, path, body, headers) {
  const url = BASE + path;
  const opts = { method, headers: { ...(headers || {}) } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

async function run() {
  let failed = 0;

  // Health
  const health = await request('GET', '/api/health');
  if (health.status !== 200 && health.status !== 503) {
    console.error('FAIL /api/health: expected 200 or 503, got', health.status);
    failed++;
  } else if (health.data && !health.data.version) {
    console.error('FAIL /api/health: response missing version');
    failed++;
  } else {
    console.log('OK  /api/health', health.status, health.data?.database || '');
  }

  // Auth status (no auth required)
  const status = await request('GET', '/api/auth/status');
  if (status.status !== 200) {
    console.error('FAIL /api/auth/status: expected 200, got', status.status);
    failed++;
  } else if (status.data && typeof status.data.firstRun !== 'boolean') {
    console.error('FAIL /api/auth/status: response missing firstRun');
    failed++;
  } else {
    console.log('OK  /api/auth/status', status.data?.firstRun, 'userCount:', status.data?.userCount);
  }

  // Login user list (public, for PIN screen)
  const users = await request('GET', '/api/auth/users');
  if (users.status !== 200 || !Array.isArray(users.data)) {
    console.error('FAIL /api/auth/users: expected 200 + JSON array, got', users.status, typeof users.data);
    failed++;
  } else {
    console.log('OK  /api/auth/users', users.data.length, 'active');
  }

  // Protected route rejects missing token
  const salesNoAuth = await request('GET', '/api/sales');
  if (salesNoAuth.status !== 401) {
    console.error('FAIL /api/sales (no auth): expected 401, got', salesNoAuth.status);
    failed++;
  } else {
    console.log('OK  /api/sales (no auth) → 401');
  }

  // SPA shell served
  const root = await request('GET', '/');
  if (root.status !== 200 || !root.text || root.text.length < 500) {
    console.error('FAIL GET /: expected 200 + HTML body, got', root.status, 'len', root.text?.length);
    failed++;
  } else if (!/SureLink|Business Manager|WiFi/i.test(root.text)) {
    console.error('FAIL GET /: HTML missing expected app title markers');
    failed++;
  } else {
    console.log('OK  GET / (index.html)');
  }

  const token = process.env.SMOKE_TOKEN;
  if (token) {
    const salesAuth = await request('GET', '/api/sales', null, { Authorization: 'Bearer ' + token });
    if (salesAuth.status !== 200 || !Array.isArray(salesAuth.data)) {
      console.error('FAIL /api/sales (auth): expected 200 + array, got', salesAuth.status);
      failed++;
    } else {
      console.log('OK  /api/sales (auth)', salesAuth.data.length, 'rows');
    }
  } else {
    console.log('SKIP /api/sales (auth) — set SMOKE_TOKEN to run');
  }

  if (failed) {
    console.error('\n' + failed + ' test(s) failed.');
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

run().catch((e) => {
  console.error('Error:', e.message);
  if (e.cause && e.cause.code === 'ECONNREFUSED') {
    console.error('Is the server running? Start with: npm start');
  }
  process.exit(1);
});
