// db/setup.js — Create PostgreSQL tables (run once: node db/setup.js)
require('dotenv').config();

// Skip during Render Build (env vars not available); setup runs at Start when DATABASE_URL is set
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgresql://')) {
  console.log('DATABASE_URL not set — skipping setup. Tables will be created when the app starts (npm run setup && npm start).');
  process.exit(0);
}

const db = require('./index');

async function main() {
  console.log('🔧 Setting up SureLink database (PostgreSQL)...\n');

  await db.query(`
  -- USERS
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    id_number   TEXT,
    role        TEXT NOT NULL DEFAULT 'attendant',
    pin_hash    TEXT NOT NULL,
    phone       TEXT,
    email       TEXT,
    permissions TEXT DEFAULT '[]',
    active      INTEGER DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  );

  -- SALES
  CREATE TABLE IF NOT EXISTS sales (
    id                 TEXT PRIMARY KEY,
    date               TEXT NOT NULL UNIQUE,
    week               TEXT,
    attendant          TEXT,
    total_rev          DOUBLE PRECISION DEFAULT 0,
    wifi               DOUBLE PRECISION DEFAULT 0,
    charging           DOUBLE PRECISION DEFAULT 0,
    expenses           DOUBLE PRECISION DEFAULT 0,
    exp_desc           TEXT,
    exp_cat            TEXT,
    exp_sub            TEXT,
    notes              TEXT,
    downtime           INTEGER DEFAULT 0,
    revenue_data       TEXT DEFAULT '{}',
    entered_by         TEXT,
    entered_at         TEXT,
    edited_by          TEXT,
    edited_at          TEXT,
    edit_history       TEXT DEFAULT '[]',
    transaction_status TEXT DEFAULT 'pending',
    entry_ref          TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
  CREATE INDEX IF NOT EXISTS idx_sales_week ON sales(week);
  CREATE INDEX IF NOT EXISTS idx_sales_entry_ref ON sales(entry_ref);

  -- VOUCHERS
  CREATE TABLE IF NOT EXISTS vouchers (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    package_id  TEXT,
    type        TEXT,
    duration    TEXT,
    price       DOUBLE PRECISION DEFAULT 0,
    issued_date TEXT,
    sold_date   TEXT,
    status      TEXT DEFAULT 'Unused',
    attendant   TEXT,
    batch       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
  CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
  CREATE INDEX IF NOT EXISTS idx_vouchers_batch ON vouchers(batch);

  -- EXPENSES
  CREATE TABLE IF NOT EXISTS expenses (
    id          TEXT PRIMARY KEY,
    date        TEXT,
    date_display TEXT,
    description TEXT NOT NULL,
    category    TEXT,
    subcategory TEXT,
    amount      DOUBLE PRECISION DEFAULT 0,
    entered_by  TEXT,
    sale_id     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE INDEX IF NOT EXISTS idx_expenses_cat ON expenses(category);

  -- ASSETS
  CREATE TABLE IF NOT EXISTS assets (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT,
    value       DOUBLE PRECISION DEFAULT 0,
    date        TEXT,
    source      TEXT DEFAULT 'manual',
    status      TEXT DEFAULT 'Active',
    notes       TEXT,
    expense_id  TEXT,
    added_by    TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  );

  -- ADMIN LOG
  CREATE TABLE IF NOT EXISTS admin_log (
    id          SERIAL PRIMARY KEY,
    timestamp   TIMESTAMPTZ DEFAULT NOW(),
    user_name   TEXT,
    action      TEXT,
    detail      TEXT,
    ip_address  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_log_ts ON admin_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_log_user ON admin_log(user_name);

  -- PIN RESET (for forgot-PIN flow)
  CREATE TABLE IF NOT EXISTS pin_reset_requests (
    code       TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pin_reset_expires ON pin_reset_requests(expires_at);

  -- SETTINGS
  CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_by  TEXT
  );

  -- SUBSCRIPTIONS
  CREATE TABLE IF NOT EXISTS subscriptions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    amount      DOUBLE PRECISION DEFAULT 0,
    frequency   TEXT DEFAULT 'monthly',
    next_due    TEXT,
    alert_days  INTEGER DEFAULT 5,
    active      INTEGER DEFAULT 1,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
  `);

  // Migration: add new sales columns for existing DBs (created before this script had the columns)
  try {
    const hasStatus = await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'transaction_status'");
    if (!hasStatus) await db.query("ALTER TABLE sales ADD COLUMN transaction_status TEXT DEFAULT 'pending'");
    const hasRef = await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'entry_ref'");
    if (!hasRef) await db.query("ALTER TABLE sales ADD COLUMN entry_ref TEXT");
    await db.query("UPDATE sales SET entry_ref = 'SL-' || REPLACE(date, '-', '') || '-001' WHERE entry_ref IS NULL OR entry_ref = ''");
  } catch (e) {
    console.log('   (sales columns migration skipped or already applied)');
  }

  const keys = ['business', 'revenue_sources', 'voucher_packages', 'fixed_costs', 'expense_categories', 'subscriptions'];
  const defaults = {
    business: { name: 'My WiFi Business', tagline: 'Fast. Reliable. Affordable.', owner: '', phone: '', addr: '', logo: '' },
    revenue_sources: [
      { id: 'rs1', name: 'WiFi Vouchers', key: 'wifi', inputType: 'amount', price: 0, active: true },
      { id: 'rs2', name: 'Smartphone Charging', key: 'smartphone', inputType: 'count', price: 500, active: true },
      { id: 'rs3', name: 'Button Phone Charging', key: 'buttonphone', inputType: 'count', price: 300, active: true }
    ],
    voucher_packages: [
      { id: 'vp1', name: 'Quick Connect', price: 500, duration: 3, durUnit: 'hrs', active: true },
      { id: 'vp2', name: 'Half Day', price: 1000, duration: 12, durUnit: 'hrs', active: true },
      { id: 'vp3', name: 'Full Day', price: 1500, duration: 24, durUnit: 'hrs', active: true }
    ],
    fixed_costs: [
      { id: 'fc1', name: 'Internet / ISP Data', amount: 0, freq: 'monthly', active: true, note: '' },
      { id: 'fc2', name: 'Rent', amount: 0, freq: 'monthly', active: true, note: '' },
      { id: 'fc3', name: 'Staff Wages', amount: 0, freq: 'monthly', active: true, note: '' },
      { id: 'fc4', name: 'Operations / Misc', amount: 0, freq: 'monthly', active: true, note: '' },
      { id: 'fc5', name: 'Power', amount: 0, freq: 'monthly', active: true, note: '' }
    ],
    expense_categories: [
      { id: 'ec1', name: 'Fixed Costs', active: true, subs: ['Rent','ISP / Data','Staff Salaries','Insurance'] },
      { id: 'ec2', name: 'Variable', active: true, subs: ['Printing','Stationery','Supplies','Miscellaneous'] },
      { id: 'ec3', name: 'Utilities', active: true, subs: ['Power / Electricity','Water','Generator Fuel','Solar Maintenance'] },
      { id: 'ec4', name: 'Allowances', active: true, subs: ['Lunch Allowance','Transport Allowance','Medical','Overtime'] },
      { id: 'ec5', name: 'Maintenance', active: true, subs: ['Network Equipment','Solar System','Electrical','General Repairs'] },
      { id: 'ec6', name: 'Capital', active: true, subs: ['Network Equipment','Solar System','Security','Charging Equipment','Infrastructure','Setup & Installation','Tools','Land / Premises'] },
      { id: 'ec7', name: 'Transport', active: true, subs: ['Fuel','Vehicle Hire','Public Transport','Delivery'] },
      { id: 'ec8', name: 'Operating', active: true, subs: ['Marketing','Voucher Printing','Airtime','Data Bundles','General'] }
    ],
    subscriptions: []
  };

  for (const k of keys) {
    const existing = await db.get('SELECT 1 FROM settings WHERE key = ?', k);
    if (!existing) {
      await db.saveSetting(k, defaults[k] || [], 'system');
    }
  }

  const userCount = (await db.get('SELECT COUNT(*) as c FROM users')).c;
  if (userCount === '0' || userCount === 0) {
    console.log('   No default users — open the app to create your first admin account.');
  }

  console.log('\n✅ Database ready (PostgreSQL).');
  console.log('👉 Run: npm start  — then open the app and create your first admin account.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
