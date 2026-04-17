/**
 * Vercel build: writes public/runtime-config.js from env so the UI can reach Render
 * without editing index.html for each environment.
 *
 * Vercel → Project → Settings → Environment Variables:
 *   SURELINK_API_ORIGIN = https://your-service.onrender.com   (no /api suffix)
 */
const fs = require('fs');
const path = require('path');

const raw = (
  process.env.SURELINK_API_ORIGIN ||
  process.env.API_BASE ||
  process.env.NEXT_PUBLIC_SURELINK_API ||
  ''
)
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '');

const outPath = path.join(__dirname, '..', 'public', 'runtime-config.js');
const body =
  '/* Auto-generated at Vercel build. Set SURELINK_API_ORIGIN to your Render app URL (no /api). */\n' +
  'window.__SURELINK_API_ORIGIN__=' +
  JSON.stringify(raw) +
  ';\n';

fs.writeFileSync(outPath, body, 'utf8');
if (raw) {
  console.log('[vercel-inject-api] public/runtime-config.js →', raw);
} else {
  console.warn(
    '[vercel-inject-api] SURELINK_API_ORIGIN not set — UI will use fallback in index.html. Set it in Vercel env to fix API connection.'
  );
}
