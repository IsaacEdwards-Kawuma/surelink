// db/index.js — PostgreSQL connection (free tier: Render, Neon, Supabase)
const { Pool } = require('pg');
require('dotenv').config();

let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.startsWith('postgresql://')) {
  console.error('❌ DATABASE_URL is required and must be a postgresql:// URL. Add your Neon connection string in Render Environment.');
  throw new Error('DATABASE_URL is required');
}

try {
  const u = new URL(DATABASE_URL);
  const host = (u.hostname || '').toLowerCase();
  if (host === 'base' || host === 'host') {
    console.error('❌ DATABASE_URL has invalid host ("' + host + '"). Paste the full Neon URL from Neon dashboard (host like ep-xxx.region.aws.neon.tech).');
    throw new Error('Invalid DATABASE_URL host');
  }
} catch (e) {
  if (e.message === 'Invalid DATABASE_URL host') throw e;
  if (e.code === 'ERR_INVALID_URL') {
    console.error('❌ DATABASE_URL is not a valid URL. Check Render Environment.');
    throw new Error('DATABASE_URL must be a valid postgresql:// URL');
  }
}

if (DATABASE_URL.includes('sslmode=require') && !DATABASE_URL.includes('uselibpqcompat')) {
  DATABASE_URL = DATABASE_URL.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

// Never log or expose DATABASE_URL (it contains credentials)
DATABASE_URL = '[REDACTED]';

// Convert ? placeholders to $1, $2 for pg
function toPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

async function query(sql, params = []) {
  const text = toPg(sql);
  const res = await pool.query(text, Array.isArray(params) ? params : [params]);
  return res;
}

async function get(sql, ...params) {
  const res = await query(sql, params);
  return res.rows[0] || null;
}

async function all(sql, ...params) {
  const res = await query(sql, params);
  return res.rows;
}

async function run(sql, ...params) {
  const res = await query(sql, params);
  return { changes: res.rowCount || 0 };
}

async function parseSetting(key) {
  const row = await get('SELECT value FROM settings WHERE key = $1', key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

async function saveSetting(key, value, user = 'system') {
  await query(`
    INSERT INTO settings (key, value, updated_at, updated_by)
    VALUES ($1, $2, NOW(), $3)
    ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by
  `, [key, JSON.stringify(value), user]);
}

async function logAction(userName, action, detail, ip = '') {
  await query(`
    INSERT INTO admin_log (timestamp, user_name, action, detail, ip_address)
    VALUES (NOW(), $1, $2, $3, $4)
  `, [userName, action, detail || '', ip || '']);
}

// Next sequential user ID by role: ADM-001, ADM-002, ATT-001, ATT-002, ...
function nextUserIdPrefix(role) {
  const r = (role || '').toString().toLowerCase();
  if (r === 'admin') return 'ADM';
  if (r === 'attendant') return 'ATT';
  return 'USR'; // other roles
}

async function nextUserId(role) {
  const prefix = nextUserIdPrefix(role);
  const pattern = prefix + '-%';
  const row = await get(
    "SELECT id FROM users WHERE id LIKE $1 ORDER BY id DESC LIMIT 1",
    pattern
  );
  if (!row || !row.id) return prefix + '-001';
  const match = row.id.match(/-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return prefix + '-' + String(num).padStart(3, '0');
}

// Run multiple queries in a transaction; callback receives { get, all, run } using same client
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      get: (sql, ...params) => {
        const text = toPg(sql);
        return client.query(text, params).then(r => r.rows[0] || null);
      },
      all: (sql, ...params) => {
        const text = toPg(sql);
        return client.query(text, params).then(r => r.rows);
      },
      run: (sql, ...params) => {
        const text = toPg(sql);
        return client.query(text, params).then(r => ({ changes: r.rowCount || 0 }));
      }
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Apply lightweight migrations for existing DBs (no separate setup run required on deploy). */
async function ensureSchemaMigrations() {
  try {
    const hasExpKind = await get(
      "SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'expense_kind'"
    );
    if (!hasExpKind) {
      await run("ALTER TABLE expenses ADD COLUMN expense_kind TEXT DEFAULT 'OPEX'");
      console.log('[db] Migration applied: expenses.expense_kind');
    }

    const hasWeeklyTarget = await get(
      "SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'weekly_target'"
    );
    if (!hasWeeklyTarget) {
      await run("ALTER TABLE users ADD COLUMN weekly_target NUMERIC DEFAULT 0");
      console.log('[db] Migration applied: users.weekly_target');
    }

    const hasDailyRecon = await get(
      "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'daily_reconciliations'"
    );
    if (!hasDailyRecon) {
      await run(`
        CREATE TABLE daily_reconciliations (
          date TEXT PRIMARY KEY,
          cashier_name TEXT DEFAULT '',
          cashier_book_total NUMERIC DEFAULT 0,
          cash_at_hand NUMERIC DEFAULT 0,
          notes TEXT DEFAULT '',
          status TEXT DEFAULT 'open',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          reconciled_by TEXT DEFAULT '',
          reconciled_at TEXT DEFAULT ''
        )
      `);
      console.log('[db] Migration applied: daily_reconciliations table');
    }
  } catch (e) {
    console.warn('[db] ensureSchemaMigrations:', e.message);
  }
}

const db = {
  pool,
  query,
  get,
  all,
  run,
  parseSetting,
  saveSetting,
  logAction,
  transaction,
  nextUserId,
  ensureSchemaMigrations,
};

module.exports = db;
