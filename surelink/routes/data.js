// routes/data.js — vouchers, expenses, assets, settings, users, admin log
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

function uid() { return 'id' + Date.now() + Math.random().toString(36).slice(2, 6); }
function pad(n) { return String(n).padStart(3, '0'); }

// ════════════════════════════════════════════════════════════════════
// VOUCHERS
// ════════════════════════════════════════════════════════════════════

router.get('/vouchers', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM vouchers ORDER BY code ASC').all().map(vRow));
});

router.post('/vouchers/batch', requireAuth, (req, res) => {
  const { packages, issuedDate, issuedTo, batch } = req.body;
  if (!packages || !Array.isArray(packages)) return res.status(400).json({ error: 'packages array required' });

  const insert = db.prepare(`
    INSERT INTO vouchers (id, code, package_id, type, duration, price, issued_date, status, attendant, batch)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);
  const insertMany = db.transaction((pkgs) => {
    let total = 0, count = 0;
    pkgs.forEach(({ pkgId, pkgType, price, duration, qty }) => {
      if (!qty || qty <= 0) return;
      const prefix = 'WV-' + price + '-';
      const maxRow = db.prepare(`SELECT MAX(CAST(SUBSTR(code, LENGTH(?)+1) AS INTEGER)) as mx FROM vouchers WHERE code LIKE ?`)
        .get(prefix, prefix + '%');
      let max = maxRow?.mx || 0;
      for (let i = 1; i <= qty; i++) {
        insert.run(uid(), prefix + pad(max + i), pkgId, String(price), duration, price,
          issuedDate, 'Unused', issuedTo, batch);
        count++;
        total += price;
      }
    });
    return { count, total };
  });

  const result = insertMany(packages);
  db.logAction(req.user.name, 'Vouchers Generated',
    `${result.count} vouchers | Face: ${result.total} UGX | Batch: ${batch}`, req.ip);
  res.status(201).json(result);
});

router.patch('/vouchers/sell', requireAuth, (req, res) => {
  const { codes, date } = req.body;
  if (!codes || !Array.isArray(codes)) return res.status(400).json({ error: 'codes array required' });

  const update = db.prepare(`UPDATE vouchers SET status='Sold', sold_date=? WHERE code=? AND status='Unused'`);
  const found = [], notFound = [];
  codes.forEach(code => {
    const r = update.run(date, code.toUpperCase());
    r.changes > 0 ? found.push(code) : notFound.push(code);
  });
  res.json({ found, notFound });
});

router.delete('/vouchers/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM vouchers WHERE id = ?').run(req.params.id);
  db.logAction(req.user.name, 'Voucher Deleted', req.params.id, req.ip);
  res.json({ ok: true });
});

function vRow(r) {
  return {
    id: r.id, code: r.code, pkg: r.package_id, type: r.type,
    dur: r.duration, price: r.price, issued: r.issued_date,
    sold: r.sold_date, status: r.status, att: r.attendant, batch: r.batch
  };
}

// ════════════════════════════════════════════════════════════════════
// EXPENSES
// ════════════════════════════════════════════════════════════════════

router.get('/expenses', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM expenses ORDER BY date ASC').all());
});

router.post('/expenses', requireAuth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare(`
    INSERT INTO expenses (id, date, date_display, description, category, subcategory, amount, entered_by, sale_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, d.date, d.dateDisp || '', d.desc, d.cat || '', d.sub || '', d.amt || 0, req.user.name, d.saleId || '');
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
});

router.put('/expenses/:id', requireAuth, requireAdmin, (req, res) => {
  const d = req.body;
  db.prepare(`UPDATE expenses SET description=?, amount=?, category=?, subcategory=?, date_display=? WHERE id=?`)
    .run(d.desc, d.amt, d.cat, d.sub, d.dateDisp, req.params.id);
  db.logAction(req.user.name, 'Expense Edited', d.desc, req.ip);
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
});

router.delete('/expenses/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  db.logAction(req.user.name, 'Expense Deleted', row?.description || '', req.ip);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════
// ASSETS
// ════════════════════════════════════════════════════════════════════

router.get('/assets', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM assets ORDER BY date ASC').all());
});

router.post('/assets', requireAuth, (req, res) => {
  const d = req.body;
  const id = uid();
  db.prepare(`
    INSERT INTO assets (id, name, category, value, date, source, status, notes, expense_id, added_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(id, d.name, d.category || 'Other', d.value || 0, d.date, d.source || 'manual',
    d.status || 'Active', d.notes || '', d.expenseId || '', req.user.name);
  db.logAction(req.user.name, 'Asset Added', `${d.name} | ${d.value} UGX`, req.ip);
  res.status(201).json(db.prepare('SELECT * FROM assets WHERE id = ?').get(id));
});

router.put('/assets/:id', requireAuth, requireAdmin, (req, res) => {
  const d = req.body;
  db.prepare(`UPDATE assets SET name=?, category=?, value=?, date=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`)
    .run(d.name, d.category, d.value, d.date, d.status, d.notes, req.params.id);
  db.logAction(req.user.name, 'Asset Updated', d.name, req.ip);
  res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id));
});

router.delete('/assets/:id', requireAuth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  db.logAction(req.user.name, 'Asset Deleted', row?.name || '', req.ip);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════
// USERS (admin only)
// ════════════════════════════════════════════════════════════════════

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, name, id_number, role, phone, email, permissions, active FROM users ORDER BY name').all();
  res.json(rows.map(u => ({ ...u, permissions: safeJSON(u.permissions) })));
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const d = req.body;
  if (!d.name || !d.pin) return res.status(400).json({ error: 'Name and PIN required' });
  if (String(d.pin).length !== 4) return res.status(400).json({ error: 'PIN must be 4 digits' });
  const id = uid();
  const pinHash = bcrypt.hashSync(String(d.pin), 10);
  db.prepare(`
    INSERT INTO users (id, name, id_number, role, pin_hash, phone, email, permissions, active)
    VALUES (?,?,?,?,?,?,?,?,1)
  `).run(id, d.name, d.idNumber || '', d.role || 'attendant', pinHash,
    d.phone || '', d.email || '', JSON.stringify(d.permissions || []));
  db.logAction(req.user.name, 'User Added', d.name, req.ip);
  res.status(201).json({ id, name: d.name });
});

router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const d = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const pinHash = d.pin ? bcrypt.hashSync(String(d.pin), 10) : user.pin_hash;
  db.prepare(`
    UPDATE users SET name=?, id_number=?, role=?, pin_hash=?, phone=?, email=?, permissions=?, updated_at=datetime('now')
    WHERE id=?
  `).run(d.name || user.name, d.idNumber ?? user.id_number, d.role || user.role, pinHash,
    d.phone ?? user.phone, d.email ?? user.email, JSON.stringify(d.permissions ?? safeJSON(user.permissions)),
    req.params.id);
  db.logAction(req.user.name, 'User Updated', d.name || user.name, req.ip);
  res.json({ ok: true });
});

router.patch('/users/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const newActive = user.active ? 0 : 1;
  db.prepare('UPDATE users SET active=? WHERE id=?').run(newActive, req.params.id);
  db.logAction(req.user.name, `User ${newActive ? 'Activated' : 'Deactivated'}`, user.name, req.ip);
  res.json({ active: !!newActive });
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE active=1').get().c;
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last active user' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  db.logAction(req.user.name, 'User Deleted', user?.name || '', req.ip);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════
// SETTINGS (admin only)
// ════════════════════════════════════════════════════════════════════

router.get('/settings', requireAuth, (req, res) => {
  const keys = ['business','revenue_sources','voucher_packages','fixed_costs','expense_categories','subscriptions'];
  const result = {};
  keys.forEach(k => { result[k] = db.parseSetting(k); });
  res.json(result);
});

router.put('/settings/:key', requireAuth, requireAdmin, (req, res) => {
  const allowed = ['business','revenue_sources','voucher_packages','fixed_costs','expense_categories','subscriptions'];
  if (!allowed.includes(req.params.key)) return res.status(400).json({ error: 'Invalid settings key' });
  db.saveSetting(req.params.key, req.body, req.user.name);
  db.logAction(req.user.name, 'Settings Updated', req.params.key, req.ip);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ════════════════════════════════════════════════════════════════════

router.get('/subscriptions', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM subscriptions ORDER BY name').all());
});

// ════════════════════════════════════════════════════════════════════
// ADMIN LOG
// ════════════════════════════════════════════════════════════════════

router.get('/admin-log', requireAuth, requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 300;
  const rows = db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT ?').all(limit);
  res.json(rows);
});

router.delete('/admin-log', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM admin_log').run();
  db.logAction(req.user.name, 'Log Cleared', '', req.ip);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════
// BACKUP DOWNLOAD (admin only)
// ════════════════════════════════════════════════════════════════════

router.get('/backup/download', requireAuth, requireAdmin, (req, res) => {
  const backup = {
    exportedAt: new Date().toISOString(),
    exportedBy: req.user.name,
    sales:    db.prepare('SELECT * FROM sales ORDER BY date').all(),
    vouchers: db.prepare('SELECT * FROM vouchers ORDER BY code').all(),
    expenses: db.prepare('SELECT * FROM expenses ORDER BY date').all(),
    assets:   db.prepare('SELECT * FROM assets ORDER BY date').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
    log:      db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 500').all()
  };
  db.logAction(req.user.name, 'Data Export', 'Full JSON backup downloaded', req.ip);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="surelink-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.send(JSON.stringify(backup, null, 2));
});

// ── Helper
function safeJSON(v) {
  try { return JSON.parse(v); } catch { return v; }
}

module.exports = router;
