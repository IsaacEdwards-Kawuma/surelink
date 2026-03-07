// routes/auth.js — Login, register, token, user management
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'change_this_secret';
const TOKEN_EXPIRY = '12h';

const WEAK_PINS = new Set(['1234','0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','0123','3210','1212','2323','1230','4321']);
function isWeakPin(pin) {
  const s = String(pin);
  if (s.length !== 4) return false;
  if (WEAK_PINS.has(s)) return true;
  return /^(\d)\1{3}$/.test(s);
}

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
router.get('/status', async (req, res) => {
  const row = await db.get('SELECT COUNT(*) as c FROM users');
  const count = parseInt(row?.c || 0, 10);
  res.json({ firstRun: count === 0, userCount: count });
});

// ── GET /api/auth/seed-defaults ────────────────────────────────────
router.get('/seed-defaults', async (req, res) => {
  const row = await db.get('SELECT COUNT(*) as c FROM users');
  const count = parseInt(row?.c || 0, 10);
  if (count > 0) return res.json({ ok: true, message: 'Users already exist' });
  return res.json({ ok: true, message: 'No default users — create your first admin on the registration screen' });
});

// ── GET /api/auth/users — list active users for login dropdown ─────
router.get('/users', async (req, res) => {
  const users = await db.all('SELECT id, name, id_number, role FROM users WHERE active = 1 ORDER BY name');
  res.json(users);
});

// ── POST /api/auth/register ────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, idNumber, role, pin, confirmPin, permissions, phone, businessName } = req.body;
    let userCount;
    try {
      const row = await db.get('SELECT COUNT(*) as c FROM users');
      userCount = parseInt(row?.c || 0, 10);
    } catch (dbErr) {
      return res.status(503).json({ error: 'Database not ready. Please try again later.' });
    }
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
    if (isWeakPin(pin)) return res.status(400).json({ error: 'PIN too easy (e.g. 1234, 0000). Choose a stronger PIN.' });
    if (confirmPin !== undefined && String(pin) !== String(confirmPin)) return res.status(400).json({ error: 'PINs do not match' });

    const existing = await db.get('SELECT id FROM users WHERE LOWER(name) = LOWER(?)', name.trim());
    if (existing) return res.status(409).json({ error: 'A user with that name already exists' });

    const id = uid();
    const pinHash = bcrypt.hashSync(String(pin), 10);
    const userRole = isFirstRun ? 'admin' : (role || 'attendant');
    const userPerms = isFirstRun ? 'all' : JSON.stringify(permissions || []);

    await db.run('INSERT INTO users (id, name, id_number, role, pin_hash, phone, permissions, active) VALUES (?,?,?,?,?,?,?,1)',
      id, name.trim(), idNumber || '', userRole, pinHash, phone || '', userPerms);

    if (isFirstRun && businessName && businessName.trim()) {
      const biz = (await db.parseSetting('business')) || {};
      biz.name = businessName.trim();
      biz.owner = name.trim();
      await db.saveSetting('business', biz, name.trim());
    }

    const logBy = isFirstRun ? name.trim() : (req.user?.name || 'admin');
    await db.logAction(logBy, isFirstRun ? 'Admin Account Created' : 'User Created', `${name.trim()} | ${userRole}`, '');

    if (isFirstRun) {
      const payload = { id, name: name.trim(), idNumber: idNumber || '', role: 'admin', permissions: 'all' };
      const token = jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY });
      return res.status(201).json({ token, user: payload });
    }

    res.status(201).json({ id, name: name.trim(), role: userRole });
  } catch (e) {
    console.error('[register]', e.message);
    return res.status(500).json({ error: e.message || 'Registration failed' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { userId, pin } = req.body;
  if (!userId || !pin) return res.status(400).json({ error: 'User and PIN required' });
  if (isWeakPin(pin)) return res.status(400).json({ error: 'This PIN is too easy. Use a stronger PIN.' });

  const user = await db.get('SELECT * FROM users WHERE id = ? AND active = 1', userId);
  if (!user) return res.status(401).json({ error: 'User not found or inactive' });

  if (!bcrypt.compareSync(String(pin), user.pin_hash)) return res.status(401).json({ error: 'Wrong PIN — try again' });

  let perms;
  try { perms = JSON.parse(user.permissions); } catch { perms = user.permissions; }

  const payload = { id: user.id, name: user.name, idNumber: user.id_number, role: user.role, permissions: perms };
  const token = jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY });
  await db.logAction(user.name, 'Login', 'Signed in', req.ip);
  res.json({ token, user: payload });
});

// ── POST /api/auth/logout ──────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  await db.logAction(req.user.name, 'Logout', 'Signed out', req.ip);
  res.json({ ok: true });
});

// ── GET /api/auth/me ───────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => res.json(req.user));

module.exports = { router, requireAuth, requireAdmin };
