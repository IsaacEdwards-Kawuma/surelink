// routes/data.js — vouchers, expenses, assets, settings, users, admin log
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

function uid() { return 'id' + Date.now() + Math.random().toString(36).slice(2, 6); }
function pad(n) { return String(n).padStart(3, '0'); }

// VOUCHERS
router.get('/vouchers', requireAuth, async (req, res) => {
  const rows = await db.all('SELECT * FROM vouchers ORDER BY code ASC');
  res.json(rows.map(vRow));
});

router.post('/vouchers/batch', requireAuth, async (req, res) => {
  const { packages, issuedDate, issuedTo, batch } = req.body;
  if (!packages || !Array.isArray(packages)) return res.status(400).json({ error: 'packages array required' });

  const result = await db.transaction(async (tx) => {
    let total = 0, count = 0;
    for (const { pkgId, pkgType, price, duration, qty } of packages) {
      if (!qty || qty <= 0) continue;
      const prefix = 'WV-' + price + '-';
      const maxRow = await tx.get(
        `SELECT MAX((SUBSTRING(code FROM LENGTH(?)+1))::INTEGER) as mx FROM vouchers WHERE code LIKE ?`,
        prefix, prefix + '%'
      );
      const max = Number(maxRow?.mx) || 0;
      for (let i = 1; i <= qty; i++) {
        await tx.run(
          `INSERT INTO vouchers (id, code, package_id, type, duration, price, issued_date, status, attendant, batch) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          uid(), prefix + pad(max + i), pkgId, String(price), duration, price, issuedDate, 'Unused', issuedTo, batch
        );
        count++;
        total += price;
      }
    }
    return { count, total };
  });

  await db.logAction(req.user.name, 'Vouchers Generated', `${result.count} vouchers | Face: ${result.total} UGX | Batch: ${batch}`, req.ip);
  res.status(201).json(result);
});

router.patch('/vouchers/sell', requireAuth, async (req, res) => {
  const { codes, date } = req.body;
  if (!codes || !Array.isArray(codes)) return res.status(400).json({ error: 'codes array required' });

  const found = [], notFound = [];
  for (const code of codes) {
    const r = await db.run(`UPDATE vouchers SET status='Sold', sold_date=? WHERE code=? AND status='Unused'`, date, code.toUpperCase());
    (r.changes > 0 ? found : notFound).push(code);
  }
  res.json({ found, notFound });
});

router.delete('/vouchers/:id', requireAuth, requireAdmin, async (req, res) => {
  await db.run('DELETE FROM vouchers WHERE id = ?', req.params.id);
  await db.logAction(req.user.name, 'Voucher Deleted', req.params.id, req.ip);
  res.json({ ok: true });
});

function vRow(r) {
  return { id: r.id, code: r.code, pkg: r.package_id, type: r.type, dur: r.duration, price: r.price, issued: r.issued_date, sold: r.sold_date, status: r.status, att: r.attendant, batch: r.batch };
}

// EXPENSES
router.get('/expenses', requireAuth, async (req, res) => {
  res.json(await db.all('SELECT * FROM expenses ORDER BY date ASC'));
});

router.post('/expenses', requireAuth, async (req, res) => {
  const d = req.body;
  const id = uid();
  await db.run(`INSERT INTO expenses (id, date, date_display, description, category, subcategory, amount, entered_by, sale_id) VALUES (?,?,?,?,?,?,?,?,?)`,
    id, d.date, d.dateDisp || '', d.desc, d.cat || '', d.sub || '', d.amt || 0, req.user.name, d.saleId || '');
  res.status(201).json(await db.get('SELECT * FROM expenses WHERE id = ?', id));
});

router.put('/expenses/:id', requireAuth, requireAdmin, async (req, res) => {
  const d = req.body;
  await db.run(`UPDATE expenses SET description=?, amount=?, category=?, subcategory=?, date_display=? WHERE id=?`, d.desc, d.amt, d.cat, d.sub, d.dateDisp, req.params.id);
  await db.logAction(req.user.name, 'Expense Edited', d.desc, req.ip);
  res.json(await db.get('SELECT * FROM expenses WHERE id = ?', req.params.id));
});

router.delete('/expenses/:id', requireAuth, requireAdmin, async (req, res) => {
  const row = await db.get('SELECT * FROM expenses WHERE id = ?', req.params.id);
  await db.run('DELETE FROM expenses WHERE id = ?', req.params.id);
  await db.logAction(req.user.name, 'Expense Deleted', row?.description || '', req.ip);
  res.json({ ok: true });
});

// ASSETS
router.get('/assets', requireAuth, async (req, res) => {
  res.json(await db.all('SELECT * FROM assets ORDER BY date ASC'));
});

router.post('/assets', requireAuth, async (req, res) => {
  const d = req.body;
  const id = uid();
  await db.run(`INSERT INTO assets (id, name, category, value, date, source, status, notes, expense_id, added_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, d.name, d.category || 'Other', d.value || 0, d.date, d.source || 'manual', d.status || 'Active', d.notes || '', d.expenseId || '', req.user.name);
  await db.logAction(req.user.name, 'Asset Added', `${d.name} | ${d.value} UGX`, req.ip);
  res.status(201).json(await db.get('SELECT * FROM assets WHERE id = ?', id));
});

router.put('/assets/:id', requireAuth, requireAdmin, async (req, res) => {
  const d = req.body;
  await db.run(`UPDATE assets SET name=?, category=?, value=?, date=?, status=?, notes=?, updated_at=NOW() WHERE id=?`, d.name, d.category, d.value, d.date, d.status, d.notes, req.params.id);
  await db.logAction(req.user.name, 'Asset Updated', d.name, req.ip);
  res.json(await db.get('SELECT * FROM assets WHERE id = ?', req.params.id));
});

router.delete('/assets/:id', requireAuth, requireAdmin, async (req, res) => {
  const row = await db.get('SELECT * FROM assets WHERE id = ?', req.params.id);
  await db.run('DELETE FROM assets WHERE id = ?', req.params.id);
  await db.logAction(req.user.name, 'Asset Deleted', row?.name || '', req.ip);
  res.json({ ok: true });
});

// USERS (admin only)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.all('SELECT id, name, id_number, role, phone, email, permissions, active FROM users ORDER BY name');
  res.json(rows.map(u => ({ ...u, permissions: safeJSON(u.permissions) })));
});

router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const d = req.body;
  if (!d.name || !d.pin) return res.status(400).json({ error: 'Name and PIN required' });
  if (String(d.pin).length !== 4) return res.status(400).json({ error: 'PIN must be 4 digits' });
  const id = uid();
  const pinHash = bcrypt.hashSync(String(d.pin), 10);
  await db.run(`INSERT INTO users (id, name, id_number, role, pin_hash, phone, email, permissions, active) VALUES (?,?,?,?,?,?,?,?,1)`,
    id, d.name, d.idNumber || '', d.role || 'attendant', pinHash, d.phone || '', d.email || '', JSON.stringify(d.permissions || []));
  await db.logAction(req.user.name, 'User Added', d.name, req.ip);
  res.status(201).json({ id, name: d.name });
});

router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const d = req.body;
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const pinHash = d.pin ? bcrypt.hashSync(String(d.pin), 10) : user.pin_hash;
  await db.run(`UPDATE users SET name=?, id_number=?, role=?, pin_hash=?, phone=?, email=?, permissions=?, updated_at=NOW() WHERE id=?`,
    d.name || user.name, d.idNumber ?? user.id_number, d.role || user.role, pinHash, d.phone ?? user.phone, d.email ?? user.email, JSON.stringify(d.permissions ?? safeJSON(user.permissions)), req.params.id);
  await db.logAction(req.user.name, 'User Updated', d.name || user.name, req.ip);
  res.json({ ok: true });
});

router.patch('/users/:id/toggle', requireAuth, requireAdmin, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const newActive = user.active ? 0 : 1;
  await db.run('UPDATE users SET active=? WHERE id=?', newActive, req.params.id);
  await db.logAction(req.user.name, `User ${newActive ? 'Activated' : 'Deactivated'}`, user.name, req.ip);
  res.json({ active: !!newActive });
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const countRow = await db.get('SELECT COUNT(*) as c FROM users WHERE active=1');
  const count = parseInt(countRow?.c || 0, 10);
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last active user' });
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  await db.run('DELETE FROM users WHERE id = ?', req.params.id);
  await db.logAction(req.user.name, 'User Deleted', user?.name || '', req.ip);
  res.json({ ok: true });
});

// SETTINGS
router.get('/settings', requireAuth, async (req, res) => {
  const keys = ['business','revenue_sources','voucher_packages','fixed_costs','expense_categories','subscriptions'];
  const result = {};
  for (const k of keys) result[k] = await db.parseSetting(k);
  res.json(result);
});

router.put('/settings/:key', requireAuth, requireAdmin, async (req, res) => {
  const allowed = ['business','revenue_sources','voucher_packages','fixed_costs','expense_categories','subscriptions'];
  if (!allowed.includes(req.params.key)) return res.status(400).json({ error: 'Invalid settings key' });
  await db.saveSetting(req.params.key, req.body, req.user.name);
  await db.logAction(req.user.name, 'Settings Updated', req.params.key, req.ip);
  res.json({ ok: true });
});

// SUBSCRIPTIONS
router.get('/subscriptions', requireAuth, async (req, res) => {
  res.json(await db.all('SELECT * FROM subscriptions ORDER BY name'));
});

// ADMIN LOG
router.get('/admin-log', requireAuth, requireAdmin, async (req, res) => {
  const limit = parseInt(req.query.limit) || 300;
  const rows = await db.all('SELECT * FROM admin_log ORDER BY id DESC LIMIT ?', limit);
  res.json(rows);
});

router.delete('/admin-log', requireAuth, requireAdmin, async (req, res) => {
  await db.run('DELETE FROM admin_log');
  await db.logAction(req.user.name, 'Log Cleared', '', req.ip);
  res.json({ ok: true });
});

// BACKUP DOWNLOAD
router.get('/backup/download', requireAuth, requireAdmin, async (req, res) => {
  const backup = {
    exportedAt: new Date().toISOString(),
    exportedBy: req.user.name,
    sales: await db.all('SELECT * FROM sales ORDER BY date'),
    vouchers: await db.all('SELECT * FROM vouchers ORDER BY code'),
    expenses: await db.all('SELECT * FROM expenses ORDER BY date'),
    assets: await db.all('SELECT * FROM assets ORDER BY date'),
    settings: await db.all('SELECT * FROM settings'),
    log: await db.all('SELECT * FROM admin_log ORDER BY id DESC LIMIT 500')
  };
  await db.logAction(req.user.name, 'Data Export', 'Full JSON backup downloaded', req.ip);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="surelink-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.send(JSON.stringify(backup, null, 2));
});

function safeJSON(v) {
  try { return JSON.parse(v); } catch { return v; }
}

module.exports = router;
