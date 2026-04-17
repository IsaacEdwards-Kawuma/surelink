// routes/sales.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

function uid() { return 'sl' + Date.now() + Math.random().toString(36).slice(2, 6); }

/** Same week labels as the frontend (public/index.html getWeek). */
function getWeekForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const s = [
    ['WK1', '2025-12-01'], ['WK2', '2025-12-08'], ['WK3', '2025-12-15'], ['WK4', '2025-12-22'],
    ['WK5', '2026-01-26'], ['WK6', '2026-02-02'], ['WK7', '2026-02-09'], ['WK8', '2026-02-16'],
    ['WK9', '2026-02-23'], ['WK10', '2026-03-02'], ['WK11', '2026-03-09'], ['WK12', '2026-03-16'],
    ['WK13', '2026-03-23'], ['WK14', '2026-03-30'], ['WK15', '2026-04-06'], ['WK16', '2026-04-13'],
    ['WK17', '2026-04-20'], ['WK18', '2026-04-27'], ['WK19', '2026-05-04'], ['WK20', '2026-05-11'],
    ['WK21', '2026-05-18'], ['WK22', '2026-05-25'], ['WK23', '2026-06-01'], ['WK24', '2026-06-08']
  ];
  let w = 'WK?';
  for (let i = 0; i < s.length; i++) {
    if (d >= new Date(s[i][1] + 'T00:00:00')) w = s[i][0];
    else break;
  }
  return w;
}

function addCalendarDays(dateStr, delta) {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2] + delta);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function nextEntryRefTx(tx, dateStr) {
  const prefix = 'SL-' + (dateStr || '').replace(/-/g, '') + '-';
  const row = await tx.get(
    'SELECT entry_ref FROM sales WHERE entry_ref LIKE ? ORDER BY entry_ref DESC LIMIT 1',
    prefix + '%'
  );
  if (!row || !row.entry_ref) return prefix + '001';
  const num = parseInt(row.entry_ref.replace(prefix, ''), 10) || 0;
  return prefix + String(num + 1).padStart(3, '0');
}

async function insertDowntimeGap(tx, dateStr, userName, enteredAt) {
  const id = uid();
  const entryRef = await nextEntryRefTx(tx, dateStr);
  const week = getWeekForDate(dateStr);
  await tx.run(
    `INSERT INTO sales
      (id, date, week, attendant, total_rev, wifi, charging, expenses,
       exp_desc, exp_cat, exp_sub, notes, downtime, revenue_data,
       entered_by, entered_at, edit_history, transaction_status, entry_ref)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, dateStr, week, userName || '',
    0, 0, 0, 0,
    '', '', '',
    'Auto-recorded: no entry (downtime day)', 1, '{}',
    userName || '', enteredAt, '[]', 'cleared', entryRef
  );
  return id;
}

router.get('/', requireAuth, async (req, res) => {
  const rows = await db.all('SELECT * FROM sales ORDER BY date ASC');
  res.json(rows.map(parseSaleRow));
});

router.get('/:id', requireAuth, async (req, res) => {
  const row = await db.get('SELECT * FROM sales WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseSaleRow(row));
});

function todayStr() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

router.post('/', requireAuth, async (req, res) => {
  const d = req.body;
  if (!d.date) return res.status(400).json({ error: 'Date required' });
  const today = todayStr();
  if (d.date > today) return res.status(400).json({ error: 'Cannot create entry for a future date. Use today or a past date.' });

  const exists = await db.get('SELECT id FROM sales WHERE date = ?', d.date);
  if (exists) return res.status(409).json({ error: 'Entry for ' + d.date + ' already exists' });

  const totalRev = Number(d.totalRev) || 0;
  const wifi = Number(d.wifi) || 0;
  const charging = Number(d.charging) || 0;
  const zeroRevenue = totalRev === 0 && wifi === 0 && charging === 0;
  const downtimeVal = zeroRevenue ? 1 : (d.downtime ? 1 : 0);
  const enteredAt = new Date().toLocaleString('en-GB');
  const weekMain = d.week || getWeekForDate(d.date);

  let gapCount = 0;
  let newId;

  await db.transaction(async (tx) => {
    const lastBefore = await tx.get('SELECT MAX(date) as d FROM sales WHERE date < ?', d.date);
    if (lastBefore && lastBefore.d) {
      let cursor = addCalendarDays(lastBefore.d, 1);
      while (cursor < d.date) {
        const taken = await tx.get('SELECT id FROM sales WHERE date = ?', cursor);
        if (!taken) {
          await insertDowntimeGap(tx, cursor, req.user.name, enteredAt);
          gapCount++;
        }
        cursor = addCalendarDays(cursor, 1);
      }
    }

    newId = uid();
    const entryRef = await nextEntryRefTx(tx, d.date);
    await tx.run(
      `INSERT INTO sales
        (id, date, week, attendant, total_rev, wifi, charging, expenses,
         exp_desc, exp_cat, exp_sub, notes, downtime, revenue_data,
         entered_by, entered_at, edit_history, transaction_status, entry_ref)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      newId, d.date, weekMain, d.att || '',
      totalRev, wifi, charging, d.expenses || 0,
      d.expDesc || '', d.expCat || '', d.expSub || '',
      d.notes || '', downtimeVal,
      JSON.stringify(d.revenueData || {}),
      req.user.name, enteredAt,
      '[]', 'pending', entryRef
    );
  });

  const detail = `Date: ${d.date} | Revenue: ${totalRev} UGX` + (gapCount ? ` | Auto downtime days filled: ${gapCount}` : '');
  await db.logAction(req.user.name, 'Daily Entry', detail, req.ip);

  const created = parseSaleRow(await db.get('SELECT * FROM sales WHERE id = ?', newId));
  res.status(201).json(created);
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const d = req.body;
  const { reason } = d;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason for edit is required' });

  const existing = await db.get('SELECT * FROM sales WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  const before = {
    totalRev: existing.total_rev, wifi: existing.wifi, charging: existing.charging,
    expenses: existing.expenses, att: existing.attendant, notes: existing.notes,
    downtime: !!existing.downtime
  };
  const after = {
    totalRev: d.totalRev ?? existing.total_rev,
    wifi: d.wifi ?? existing.wifi,
    charging: d.charging ?? existing.charging,
    expenses: d.expenses ?? existing.expenses,
    att: d.att ?? existing.attendant,
    notes: d.notes ?? existing.notes,
    downtime: d.downtime ?? !!existing.downtime
  };

  const changes = [];
  if (before.totalRev !== after.totalRev) changes.push(`Total Rev: ${before.totalRev} → ${after.totalRev} UGX`);
  if (before.wifi !== after.wifi) changes.push(`WiFi: ${before.wifi} → ${after.wifi} UGX`);
  if (before.charging !== after.charging) changes.push(`Charging: ${before.charging} → ${after.charging} UGX`);
  if (before.expenses !== after.expenses) changes.push(`Expenses: ${before.expenses} → ${after.expenses} UGX`);
  if (before.att !== after.att) changes.push(`Attendant: "${before.att}" → "${after.att}"`);
  if (before.notes !== after.notes) changes.push('Notes updated');
  if (before.downtime !== after.downtime) changes.push(`Downtime: ${before.downtime ? 'Yes' : 'No'} → ${after.downtime ? 'Yes' : 'No'}`);
  if (!changes.length) changes.push('No field changes detected');

  let history = [];
  try { history = JSON.parse(existing.edit_history || '[]'); } catch {}
  history.push({
    editedBy: req.user.name,
    editedAt: new Date().toLocaleString('en-GB'),
    reason: reason.trim(),
    before, after, changes
  });

  await db.run(`
    UPDATE sales SET
      attendant = ?, total_rev = ?, wifi = ?, charging = ?,
      expenses = ?, exp_desc = ?, exp_cat = ?, exp_sub = ?,
      notes = ?, downtime = ?, revenue_data = ?,
      edited_by = ?, edited_at = ?, edit_history = ?
    WHERE id = ?
  `,
    after.att, after.totalRev, after.wifi, after.charging,
    after.expenses, d.expDesc ?? existing.exp_desc,
    d.expCat ?? existing.exp_cat, d.expSub ?? existing.exp_sub,
    after.notes, after.downtime ? 1 : 0,
    JSON.stringify(d.revenueData || JSON.parse(existing.revenue_data || '{}')),
    req.user.name, new Date().toLocaleString('en-GB'),
    JSON.stringify(history),
    req.params.id
  );

  await db.logAction(req.user.name, 'Entry Edited', `Date: ${existing.date} | Reason: "${reason}" | ${changes.join(' | ')}`, req.ip);

  const updated = parseSaleRow(await db.get('SELECT * FROM sales WHERE id = ?', req.params.id));
  res.json(updated);
});

// Admin only: view and clear transaction status (pending/cleared). Attendants maintain edits only.
router.patch('/:id/transaction-status', requireAuth, async (req, res) => {
  if (req.user.permissions !== 'all') return res.status(403).json({ error: 'Only admins can clear transaction status. Attendants use Edit to maintain the sales log.' });
  const status = (req.body.status || '').toLowerCase();
  if (status !== 'pending' && status !== 'cleared') return res.status(400).json({ error: 'Status must be "pending" or "cleared"' });
  const row = await db.get('SELECT id FROM sales WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  await db.run('UPDATE sales SET transaction_status = ? WHERE id = ?', status, req.params.id);
  const updated = parseSaleRow(await db.get('SELECT * FROM sales WHERE id = ?', req.params.id));
  res.json(updated);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const row = await db.get('SELECT * FROM sales WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  await db.run('DELETE FROM sales WHERE id = ?', req.params.id);
  await db.logAction(req.user.name, 'Entry Deleted', `Date: ${row.date} | Rev: ${row.total_rev} UGX | Originally by: ${row.entered_by}`, req.ip);
  res.json({ ok: true, deleted: row.date });
});

function parseSaleRow(row) {
  if (!row) return null;
  let revenueData = {}, editHistory = [];
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
    transactionStatus: row.transaction_status || 'pending',
    entryRef: row.entry_ref || '',
    enteredBy: row.entered_by, enteredAt: row.entered_at,
    editedBy: row.edited_by, editedAt: row.edited_at
  };
}

module.exports = router;
