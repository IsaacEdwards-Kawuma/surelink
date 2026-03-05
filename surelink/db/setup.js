// db/setup.js — Run once to create all tables
// Usage: node db/setup.js

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Match db/index.js path logic so setup and server use the same file
const defaultPath = path.join(__dirname, 'surelink.db');
const DB_PATH = process.env.DB_PATH
  ? path.isAbsolute(process.env.DB_PATH)
    ? process.env.DB_PATH
    : path.join(__dirname, '..', process.env.DB_PATH)
  : defaultPath;
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance and concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('🔧 Setting up SureLink database...\n');

db.exec(`

  -- ── USERS ──────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    id_number   TEXT,
    role        TEXT NOT NULL DEFAULT 'attendant',
    pin_hash    TEXT NOT NULL,
    phone       TEXT,
    email       TEXT,
    permissions TEXT DEFAULT '[]',   -- JSON array of tab keys, or 'all'
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- ── SALES (daily entries) ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS sales (
    id          TEXT PRIMARY KEY,
    date        TEXT NOT NULL UNIQUE,
    week        TEXT,
    attendant   TEXT,
    total_rev   REAL DEFAULT 0,
    wifi        REAL DEFAULT 0,
    charging    REAL DEFAULT 0,
    expenses    REAL DEFAULT 0,
    exp_desc    TEXT,
    exp_cat     TEXT,
    exp_sub     TEXT,
    notes       TEXT,
    downtime    INTEGER DEFAULT 0,
    revenue_data TEXT DEFAULT '{}',   -- JSON: all revenue source values
    entered_by  TEXT,
    entered_at  TEXT,
    edited_by   TEXT,
    edited_at   TEXT,
    edit_history TEXT DEFAULT '[]',   -- JSON array of edit records
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
  CREATE INDEX IF NOT EXISTS idx_sales_week ON sales(week);

  -- ── VOUCHERS ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS vouchers (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    package_id  TEXT,
    type        TEXT,
    duration    TEXT,
    price       REAL DEFAULT 0,
    issued_date TEXT,
    sold_date   TEXT,
    status      TEXT DEFAULT 'Unused',
    attendant   TEXT,
    batch       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_vouchers_code   ON vouchers(code);
  CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
  CREATE INDEX IF NOT EXISTS idx_vouchers_batch  ON vouchers(batch);

  -- ── EXPENSES ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS expenses (
    id          TEXT PRIMARY KEY,
    date        TEXT,
    date_display TEXT,
    description TEXT NOT NULL,
    category    TEXT,
    subcategory TEXT,
    amount      REAL DEFAULT 0,
    entered_by  TEXT,
    sale_id     TEXT,                 -- links to sales record if from daily entry
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE INDEX IF NOT EXISTS idx_expenses_cat  ON expenses(category);

  -- ── ASSETS ─────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS assets (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT,
    value       REAL DEFAULT 0,
    date        TEXT,
    source      TEXT DEFAULT 'manual',   -- 'auto' = from expense, 'manual'
    status      TEXT DEFAULT 'Active',
    notes       TEXT,
    expense_id  TEXT,                    -- links to expense if auto-created
    added_by    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- ── ADMIN LOG ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS admin_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT DEFAULT (datetime('now')),
    user_name   TEXT,
    action      TEXT,
    detail      TEXT,
    ip_address  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_log_ts   ON admin_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_log_user ON admin_log(user_name);

  -- ── SETTINGS ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,                    -- JSON value
    updated_at  TEXT DEFAULT (datetime('now')),
    updated_by  TEXT
  );

  -- ── SUBSCRIPTIONS ──────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS subscriptions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    amount      REAL DEFAULT 0,
    frequency   TEXT DEFAULT 'monthly',
    next_due    TEXT,
    alert_days  INTEGER DEFAULT 5,
    active      INTEGER DEFAULT 1,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

`);

// ── Seed default settings ──────────────────────────────────────────
const bcrypt = require('bcryptjs');
const { v4: uuid } = { v4: () => 'id' + Date.now() + Math.random().toString(36).slice(2, 6) };

function uid() { return 'id' + Date.now() + Math.random().toString(36).slice(2, 6); }

const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value, updated_by) VALUES (?, ?, 'system')
`);

// Default business settings (no names pre-filled)
insertSetting.run('business', JSON.stringify({
  name: 'My WiFi Business',
  tagline: 'Fast. Reliable. Affordable.',
  owner: '',
  phone: '',
  addr: '',
  logo: ''
}));

insertSetting.run('revenue_sources', JSON.stringify([
  { id: 'rs1', name: 'WiFi Vouchers',         key: 'wifi',        inputType: 'amount', price: 0,   active: true },
  { id: 'rs2', name: 'Smartphone Charging',   key: 'smartphone',  inputType: 'count',  price: 500, active: true },
  { id: 'rs3', name: 'Button Phone Charging', key: 'buttonphone', inputType: 'count',  price: 300, active: true }
]));

insertSetting.run('voucher_packages', JSON.stringify([
  { id: 'vp1', name: 'Quick Connect', price: 500,  duration: 3,  durUnit: 'hrs', active: true },
  { id: 'vp2', name: 'Half Day',      price: 1000, duration: 12, durUnit: 'hrs', active: true },
  { id: 'vp3', name: 'Full Day',      price: 1500, duration: 24, durUnit: 'hrs', active: true }
]));

insertSetting.run('fixed_costs', JSON.stringify([
  { id: 'fc1', name: 'Internet / ISP Data', amount: 0, freq: 'monthly', active: true,  note: '' },
  { id: 'fc2', name: 'Rent',                amount: 0, freq: 'monthly', active: true,  note: '' },
  { id: 'fc3', name: 'Staff Wages',         amount: 0, freq: 'monthly', active: true,  note: '' },
  { id: 'fc4', name: 'Operations / Misc',   amount: 0, freq: 'monthly', active: true,  note: '' },
  { id: 'fc5', name: 'Power',               amount: 0, freq: 'monthly', active: true,  note: '' }
]));

insertSetting.run('expense_categories', JSON.stringify([
  { id: 'ec1', name: 'Fixed Costs',  active: true, subs: ['Rent','ISP / Data','Staff Salaries','Insurance'] },
  { id: 'ec2', name: 'Variable',     active: true, subs: ['Printing','Stationery','Supplies','Miscellaneous'] },
  { id: 'ec3', name: 'Utilities',    active: true, subs: ['Power / Electricity','Water','Generator Fuel','Solar Maintenance'] },
  { id: 'ec4', name: 'Allowances',   active: true, subs: ['Lunch Allowance','Transport Allowance','Medical','Overtime'] },
  { id: 'ec5', name: 'Maintenance',  active: true, subs: ['Network Equipment','Solar System','Electrical','General Repairs'] },
  { id: 'ec6', name: 'Capital',      active: true, subs: ['Network Equipment','Solar System','Security','Charging Equipment','Infrastructure','Setup & Installation','Tools','Land / Premises'] },
  { id: 'ec7', name: 'Transport',    active: true, subs: ['Fuel','Vehicle Hire','Public Transport','Delivery'] },
  { id: 'ec8', name: 'Operating',    active: true, subs: ['Marketing','Voucher Printing','Airtime','Data Bundles','General'] }
]));

// ── No default users — first person to open the app creates the admin account ──
db.close();
console.log('\n✅ Database ready:', DB_PATH);
console.log('👉 Run: npm start  — then open http://localhost:3000 to create your admin account\n');
