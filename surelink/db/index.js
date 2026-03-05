// db/index.js — Shared database connection
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './db/surelink.db';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Helper: parse JSON safely
db.parseSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
};

// Helper: save setting
db.saveSetting = (key, value, user = 'system') => {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at, updated_by)
    VALUES (?, ?, datetime('now'), ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `).run(key, JSON.stringify(value), user);
};

// Helper: log action
db.logAction = (userName, action, detail, ip = '') => {
  db.prepare(`
    INSERT INTO admin_log (timestamp, user_name, action, detail, ip_address)
    VALUES (datetime('now'), ?, ?, ?, ?)
  `).run(userName, action, detail || '', ip || '');
};

module.exports = db;
