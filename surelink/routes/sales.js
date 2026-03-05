// routes/sales.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

function uid() { return 'sl' + Date.now() + Math.random().toString(36).slice(2, 6); }

// ── GET /api/sales — all sales records ─────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM sales ORDER BY date ASC').all();
  res.json(rows.map(parseSaleRow));
});

// ── GET /api/sales/:id ──────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseSaleRow(row));
});

// ── POST /api/sales — new daily entry ──────────────────────────────
router.post('/', requireAuth, (req, res) => {
  const d = req.body;
  if (!d.date) return res.status(400).json({ error: 'Date required' });

  const exists = db.prepare('SELECT id FROM sales WHERE date = ?').get(d.date);
  if (exists) return res.status(409).json({ error: 'Entry for ' + d.date + ' already exists' });

  const id = uid();
  db.prepare(`
    INSERT INTO sales
      (id, date, week, attendant, total_rev, wifi, charging, expenses,
       exp_desc, exp_cat, exp_sub, notes, downtime, revenue_data,
       entered_by, entered_at, edit_history)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, d.date, d.week || '', d.att || '',
    d.totalRev || 0, d.wifi || 0, d.charging || 0, d.expenses || 0,
    d.expDesc || '', d.expCat || '', d.expSub || '',
    d.notes || '', d.downtime ? 1 : 0,
    JSON.stringify(d.revenueData || {}),
    req.user.name, new Date().toLocaleString('en-GB'),
    '[]'
  );

  db.logAction(req.user.name, 'Daily Entry',
    `Date: ${d.date} | Revenue: ${d.totalRev || 0} UGX`, req.ip);

  const created = parseSaleRow(db.prepare('SELECT * FROM sales WHERE id = ?').get(id));
  res.status(201).json(created);
});

// ── PUT /api/sales/:id — edit existing entry ────────────────────────
router.put('/:id', requireAdmin, (req, res) => {
  const d = req.body;
  const { reason } = d;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason for edit is required' });

  const existing = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  // Build before snapshot
  const before = {
    totalRev: existing.total_rev, wifi: existing.wifi, charging: existing.charging,
    expenses: existing.expenses, att: existing.attendant, notes: existing.notes,
    downtime: !!existing.downtime
  };

  // Build after snapshot
  const after = {
    totalRev: d.totalRev ?? existing.total_rev,
    wifi: d.wifi ?? existing.wifi,
    charging: d.charging ?? existing.charging,
    expenses: d.expenses ?? existing.expenses,
    att: d.att ?? existing.attendant,
    notes: d.notes ?? existing.notes,
    downtime: d.downtime ?? !!existing.downtime
  };

  // Detect changes
  const changes = [];
  if (before.totalRev !== after.totalRev) changes.push(`Total Rev: ${before.totalRev} → ${after.totalRev} UGX`);
  if (before.wifi    !== after.wifi)      changes.push(`WiFi: ${before.wifi} → ${after.wifi} UGX`);
  if (before.charging!== after.charging)  changes.push(`Charging: ${before.charging} → ${after.charging} UGX`);
  if (before.expenses!== after.expenses)  changes.push(`Expenses: ${before.expenses} → ${after.expenses} UGX`);
  if (before.att     !== after.att)       changes.push(`Attendant: "${before.att}" → "${after.att}"`);
  if (before.notes   !== after.notes)     changes.push('Notes updated');
  if (before.downtime!== after.downtime)  changes.push(`Downtime: ${before.downtime ? 'Yes' : 'No'} → ${after.downtime ? 'Yes' : 'No'}`);
  if (!changes.length) changes.push('No field changes detected');

  // Append to edit history
  let history = [];
  try { history = JSON.parse(existing.edit_history || '[]'); } catch {}
  history.push({
    editedBy: req.user.name,
    editedAt: new Date().toLocaleString('en-GB'),
    reason: reason.trim(),
    before, after, changes
  });

  db.prepare(`
    UPDATE sales SET
      attendant = ?, total_rev = ?, wifi = ?, charging = ?,
      expenses = ?, exp_desc = ?, exp_cat = ?, exp_sub = ?,
      notes = ?, downtime = ?, revenue_data = ?,
      edited_by = ?, edited_at = ?, edit_history = ?
    WHERE id = ?
  `).run(
    after.att, after.totalRev, after.wifi, after.charging,
    after.expenses, d.expDesc ?? existing.exp_desc,
    d.expCat ?? existing.exp_cat, d.expSub ?? existing.exp_sub,
    after.notes, after.downtime ? 1 : 0,
    JSON.stringify(d.revenueData || JSON.parse(existing.revenue_data || '{}')),
    req.user.name, new Date().toLocaleString('en-GB'),
    JSON.stringify(history),
    req.params.id
  );

  db.logAction(req.user.name, 'Entry Edited',
    `Date: ${existing.date} | Reason: "${reason}" | ${changes.join(' | ')}`, req.ip);

  const updated = parseSaleRow(db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id));
  res.json(updated);
});

// ── DELETE /api/sales/:id ───────────────────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
  db.logAction(req.user.name, 'Entry Deleted',
    `Date: ${row.date} | Rev: ${row.total_rev} UGX | Originally by: ${row.entered_by}`, req.ip);

  res.json({ ok: true, deleted: row.date });
});

// ── Helper: parse DB row → JS object ───────────────────────────────
function parseSaleRow(row) {
  if (!row) return null;
  let revenueData = {};
  let editHistory = [];
  try { revenueData = JSON.parse(row.revenue_data || '{}'); } catch {}
  try { editHistory = JSON.parse(row.edit_history || '[]'); } catch {}
  return {
    id: row.id, date: row.date, week: row.week,
    att: row.attendant, totalRev: row.total_rev,
    wifi: row.wifi, charging: row.charging,
    expenses: row.expenses, expDesc: row.exp_desc,
    expCat: row.exp_cat, expSub: row.exp_sub,
    notes: row.notes, downtime: !!row.downtime,
    revenueData, editHistory,
    enteredBy: row.entered_by, enteredAt: row.entered_at,
    editedBy: row.edited_by, editedAt: row.edited_at
  };
}

module.exports = router;
