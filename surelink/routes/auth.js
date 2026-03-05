// routes/auth.js — Login, register, token, user management
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'change_this_secret';
const TOKEN_EXPIRY = '12h';

function uid() { return 'id' + Date.now() + Math.random().toString(36).slice(2, 6); }

// ── Middleware: verify JWT ─────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(auth.slice(7), SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired — please log in again' }); }
}

// ── Middleware: require admin ──────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.permissions !== 'all') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── GET /api/auth/status — first-run detection ─────────────────────
router.get('/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  res.json({ firstRun: count === 0, userCount: count });
});

// ── GET /api/auth/seed-defaults — ensure default users exist (only when table is empty) ──
router.get('/seed-defaults', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return res.json({ ok: true, message: 'Users already exist' });
  try {
    const bcrypt = require('bcryptjs');
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, id_number, role, pin_hash, permissions, active) VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    insertUser.run('ADM-001', 'Andrew', 'ADM-001', 'admin', bcrypt.hashSync('1234', 10), 'all');
    insertUser.run('ATT-001', 'Allan', 'ATT-001', 'attendant', bcrypt.hashSync('5678', 10), '[]');
    return res.json({ ok: true, message: 'Default users created (Andrew PIN 1234, Allan PIN 5678)' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /api/auth/users — list active users for login dropdown ─────
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, name, id_number, role FROM users WHERE active = 1 ORDER BY name').all();
  res.json(users);
});

// ── POST /api/auth/register ────────────────────────────────────────
// First run: anyone can create the initial admin account
// After that: requires admin JWT
router.post('/register', (req, res) => {
  const { name, idNumber, role, pin, confirmPin, permissions, phone, businessName } = req.body;
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const isFirstRun = userCount === 0;

  if (!isFirstRun) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Admin login required to create users' });
    try {
      const decoded = jwt.verify(auth.slice(7), SECRET);
      if (decoded.permissions !== 'all') return res.status(403).json({ error: 'Only admins can create accounts' });
      req.user = decoded;
    } catch { return res.status(401).json({ error: 'Session expired' }); }
  }

  if (!name || !name.trim()) return res.status(400).json({ error: 'Full name is required' });
  if (!pin || !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  if (confirmPin !== undefined && String(pin) !== String(confirmPin)) return res.status(400).json({ error: 'PINs do not match' });

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existing) return res.status(409).json({ error: 'A user with that name already exists' });

  const id = uid();
  const pinHash = bcrypt.hashSync(String(pin), 10);
  const userRole = isFirstRun ? 'admin' : (role || 'attendant');
  const userPerms = isFirstRun ? 'all' : JSON.stringify(permissions || []);

  db.prepare('INSERT INTO users (id, name, id_number, role, pin_hash, phone, permissions, active) VALUES (?,?,?,?,?,?,?,1)')
    .run(id, name.trim(), idNumber || '', userRole, pinHash, phone || '', userPerms);

  if (isFirstRun && businessName && businessName.trim()) {
    const biz = db.parseSetting('business') || {};
    biz.name = businessName.trim();
    biz.owner = name.trim();
    db.saveSetting('business', biz, name.trim());
  }

  const logBy = isFirstRun ? name.trim() : (req.user?.name || 'admin');
  db.logAction(logBy, isFirstRun ? 'Admin Account Created' : 'User Created', `${name.trim()} | ${userRole}`, '');

  if (isFirstRun) {
    const payload = { id, name: name.trim(), idNumber: idNumber || '', role: 'admin', permissions: 'all' };
    const token = jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY });
    return res.status(201).json({ token, user: payload });
  }

  res.status(201).json({ id, name: name.trim(), role: userRole });
});

// ── POST /api/auth/login ───────────────────────────────────────────
router.post('/login', (req, res) => {
  const { userId, pin } = req.body;
  if (!userId || !pin) return res.status(400).json({ error: 'User and PIN required' });

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(userId);
  if (!user) return res.status(401).json({ error: 'User not found or inactive' });

  if (!bcrypt.compareSync(String(pin), user.pin_hash)) return res.status(401).json({ error: 'Wrong PIN — try again' });

  let perms;
  try { perms = JSON.parse(user.permissions); } catch { perms = user.permissions; }

  const payload = { id: user.id, name: user.name, idNumber: user.id_number, role: user.role, permissions: perms };
  const token = jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY });
  db.logAction(user.name, 'Login', 'Signed in', req.ip);
  res.json({ token, user: payload });
});

// ── POST /api/auth/logout ──────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
  db.logAction(req.user.name, 'Logout', 'Signed out', req.ip);
  res.json({ ok: true });
});

// ── GET /api/auth/me ───────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => res.json(req.user));

module.exports = { router, requireAuth, requireAdmin };
