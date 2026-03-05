// backup/run-backup.js
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BACKUP_DIR  = process.env.BACKUP_DIR  || path.join(__dirname, 'files');
const KEEP_DAYS   = parseInt(process.env.BACKUP_KEEP_DAYS) || 30;

async function runBackup() {
  const db = require('../db');

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `surelink-backup-${timestamp}.json`;
  const filepath  = path.join(BACKUP_DIR, filename);

  const backup = {
    exportedAt: new Date().toISOString(),
    version: '2.0.0',
    sales:    db.prepare('SELECT * FROM sales ORDER BY date').all(),
    vouchers: db.prepare('SELECT * FROM vouchers ORDER BY code').all(),
    expenses: db.prepare('SELECT * FROM expenses ORDER BY date').all(),
    assets:   db.prepare('SELECT * FROM assets ORDER BY date').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
    users:    db.prepare('SELECT id, name, id_number, role, phone, active FROM users').all(),
    log:      db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 1000').all()
  };

  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8');

  const sizeMB = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Backup saved: ${filename} (${sizeMB} MB)`);

  // ── Prune old backups ─────────────────────────────────────────────
  const cutoff = Date.now() - (KEEP_DAYS * 24 * 60 * 60 * 1000);
  let pruned = 0;
  fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('surelink-backup-') && f.endsWith('.json'))
    .forEach(f => {
      const fpath = path.join(BACKUP_DIR, f);
      if (fs.statSync(fpath).mtimeMs < cutoff) {
        fs.unlinkSync(fpath);
        pruned++;
      }
    });

  if (pruned > 0) console.log(`🗑  Pruned ${pruned} backup(s) older than ${KEEP_DAYS} days`);

  return { filename, sizeMB };
}

// ── List all backups ──────────────────────────────────────────────
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('surelink-backup-') && f.endsWith('.json'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: (stat.size / 1024).toFixed(1) + ' KB', date: stat.mtime };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Run directly: node backup/run-backup.js
if (require.main === module) {
  console.log('🔄 Running manual backup...');
  runBackup()
    .then(r => { console.log(`Done: ${r.filename}`); process.exit(0); })
    .catch(e => { console.error('Backup failed:', e); process.exit(1); });
}

module.exports = { runBackup, listBackups };
