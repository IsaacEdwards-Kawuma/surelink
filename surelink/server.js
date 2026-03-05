// server.js — SureLink WiFi Manager Backend
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
const cron     = require('node-cron');
const path     = require('path');
const fs       = require('fs');

const { router: authRouter } = require('./routes/auth');
const dataRouter  = require('./routes/data');
const salesRouter = require('./routes/sales');
const { runBackup } = require('./backup/run-backup');

const app  = express();
// Render and similar hosts set PORT automatically; leave empty in .env to use their value or default 3000
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ── Security ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP off for inline scripts in HTML
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim().replace(/\/+$/, ''))
    : true,
  credentials: true
}));

// ── Rate limiting ───────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });

// ── Body parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── API routes ──────────────────────────────────────────────────────
app.use('/api/auth',  loginLimiter, authRouter);
app.use('/api/sales', apiLimiter,   salesRouter);
app.use('/api',       apiLimiter,   dataRouter);

// ── Serve frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Health check ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  let dbOk = false;
  try {
    const db = require('./db');
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch (e) {
    console.error('[health] DB check failed:', e.message);
  }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    version: '2.0.0',
    time: new Date().toISOString()
  });
});

// ── Scheduled auto-backup (daily at 2am) ───────────────────────────
cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] Running scheduled backup...');
  try {
    await runBackup();
    console.log('[CRON] Backup complete.');
  } catch (err) {
    console.error('[CRON] Backup failed:', err.message);
  }
});

// ── Start server ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SureLink WiFi Manager running on port ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/api/health`);
  console.log(`   Mode:    ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
