// server.js — SureLink WiFi Manager Backend
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
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
var allowedOriginsList = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
  : [];
function originAllowed(origin) {
  if (!origin) return true;
  if (allowedOriginsList.length === 0) return true;
  if (allowedOriginsList.indexOf(origin) !== -1) return true;
  // Allow localhost / 127.0.0.1 for dev
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  // Allow common frontend hosts (Render, Vercel, custom)
  if (/\.onrender\.com$/i.test(origin) || /\.vercel\.app$/i.test(origin) || /surelink-manager\.net$/i.test(origin)) return true;
  return false;
}
app.use(cors({
  origin: function (origin, callback) {
    callback(null, originAllowed(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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

// ── Request logging ────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Health check (before catch-all so it is reachable) ────────────────
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try {
    const db = require('./db');
    await db.get('SELECT 1');
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

// ── API routes ──────────────────────────────────────────────────────
app.use('/api/auth',  loginLimiter, authRouter);
app.use('/api/sales', apiLimiter,   salesRouter);
app.use('/api',       apiLimiter,   dataRouter);

// ── Serve frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
(async function start() {
  try {
    const db = require('./db');
    await db.ensureSchemaMigrations();
  } catch (e) {
    console.warn('[startup] DB migration skipped:', e.message);
  }
  app.listen(PORT, () => {
    console.log(`\n🚀 SureLink WiFi Manager running on port ${PORT}`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Health:  http://localhost:${PORT}/api/health`);
    console.log(`   Mode:    ${process.env.NODE_ENV || 'development'}\n`);
  });
})();

module.exports = app;
