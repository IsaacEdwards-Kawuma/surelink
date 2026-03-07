/**
 * SureLink API smoke tests. Run with: npm test
 * Requires server running: npm start (in another terminal).
 */
const BASE = process.env.API_BASE || 'http://localhost:3000';

async function request(method, path, body) {
  const url = BASE + path;
  const opts = { method, headers: {} };
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
