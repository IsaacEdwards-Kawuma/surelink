# SureLink WiFi Manager — Full Project Overview (Prompt)

This document describes the entire SureLink WiFi Manager project in words: what it is, what it does, and every major feature and component.

---

## What the project is

**SureLink WiFi Manager** is a business management system for WiFi and voucher operations. It is a single-page web application with a Node.js and Express backend and a PostgreSQL database. It is designed for small businesses (e.g. WiFi hotspots, cyber cafés) to record daily sales, manage voucher codes, track expenses and assets, manage users, and view summaries and monitoring. The frontend is one HTML file with embedded CSS and JavaScript, plus a service worker for offline caching. The app can be deployed on platforms like Render (backend) and Vercel or a custom domain (frontend), with configurable API base URL.

---

## Technology stack

- **Backend:** Node.js, Express, PostgreSQL (via the `pg` driver), JWT for authentication, bcrypt for PIN hashing, Helmet for security headers, CORS (configurable allowed origins), express-rate-limit for login and API limiting, morgan for HTTP request logging, node-cron for scheduled daily backup.
- **Database:** PostgreSQL (e.g. Neon, Supabase). Tables: users, sales, vouchers, expenses, assets, admin_log, pin_reset_requests, settings, subscriptions. Setup script creates tables and indexes; placeholder conversion from `?` to `$1` style for pg.
- **Frontend:** Single HTML file (`public/index.html`) containing all UI, styles, and script. No separate frontend framework. Service worker (`public/sw.js`) caches the app shell for offline use.
- **Environment:** `.env` for JWT_SECRET, DATABASE_URL, PORT, ALLOWED_ORIGINS, NODE_ENV. Example in `.env.example`.

---

## Authentication and users

- **First run:** If there are no users in the database, the app shows a registration screen to create the first account. That account is an admin (full access).
- **Login:** Users select their account from a dropdown (populated from the API) and enter a 4-digit PIN. There is an on-screen numeric keypad that appears when focusing a PIN box; it hides when focus leaves the PIN area or after login. The device keyboard can also be used. Weak PINs (e.g. 1234, 0000, repeated digits) are rejected. Login is rate-limited (e.g. 20 attempts per 15 minutes); the UI shows a message when rate-limited.
- **JWT:** On successful login the server returns a token and user object. The frontend stores the token in localStorage and sends it as `Authorization: Bearer <token>` on API requests.
- **Forgot PIN:** A “Forgot PIN?” flow allows a user to request a one-time reset code (valid 15 minutes) and then set a new PIN. Backend uses a `pin_reset_requests` table; endpoints: POST `/api/auth/forgot-pin`, POST `/api/auth/reset-pin`. Admins can also reset any user’s PIN from Settings → Users → Edit user.
- **Roles and permissions:** Users have a role (e.g. attendant, supervisor) and permissions. Permissions can be “all” (admin) or an array of tab IDs (dashboard, entry, vouchers, sales, expenses, assets, guide). Only admins see the Settings tab. Non-admins only see tabs they have access to.
- **Session timeout:** After a period of inactivity (e.g. 15 minutes), a modal asks the user to extend the session or log out. If they do not extend, they are automatically logged out after a short countdown (e.g. 2 minutes). Activity (mouse, keyboard, touch, scroll) resets the timer.

---

## Main navigation and pages

The app has a top header with a collapsible navigation (hamburger on small screens). Tabs are: Dashboard, Daily Entry, Vouchers, Sales Log, Expenses, Assets, Guide, and Settings (admin only). Each tab shows a single “page” panel; only one is active at a time.

- **Dashboard:** Shows KPIs (Total Revenue, Net After Expenses, Best Single Day, Avg Revenue/Day, Downtime Days), weekly revenue bars, voucher stock summary (total, sold, unused), recent 14 days with small bars, and a weekly table. All derived from sales, vouchers, and related data.
- **Daily Entry:** Form to add or edit a day’s entry: date, week, attendant, total revenue, WiFi and charging breakdown, revenue data by source (from settings), expenses for the day, expense description and category, notes, downtime (closed) flag. Can correct the previous day’s entry. Saving sends data to the server and updates dashboard and other views.
- **Vouchers:** List and filters for vouchers (e.g. by status). Generate batches of vouchers by package (price, duration, quantity); codes follow a pattern (e.g. WV-{price}-001). Sell vouchers by entering codes and date. Admins can delete vouchers. **Reconciliation** is on this page: paste sold codes (comma-separated), set sale date and attendant, click RECONCILE to mark codes as sold and see which codes were not found; LIVE STATUS shows total, sold, and unused counts.
- **Sales Log:** Table of all daily entries. Admins can edit or delete entries; edits require a reason and are logged. Connection status and retry shown when API is unreachable.
- **Expenses:** Table of all expenses (date, description, category, subcategory, amount, entered by). Filter by category and search. Category breakdown with bars. Admins can add, edit, delete expenses.
- **Assets:** Asset register: name, category, value, date, source (auto from daily entry or manual), status (Active, Faulty, etc.). Filters by category. Capital expenses from daily entry can auto-create assets. Admins can add, edit, delete assets.
- **Guide:** In-app user guide (steps and short explanations for Dashboard, Daily Entry, Vouchers, Settings, etc.).
- **Settings:** Admin-only. Collapsible section list (chevron to expand/collapse). Subsections: Business, Users, Revenue, Packages, Fixed Costs, Expense Categories, Subscriptions, Admin Log, Monitoring.

---

## Settings in detail

- **Business:** Business name, tagline, owner, phone, address (saved as settings).
- **Users:** List of users with name, ID number, role, phone, permissions, active state. Add user, edit (including PIN reset), activate/deactivate, delete (cannot delete last active user). Permissions: full admin or checkboxes per tab.
- **Revenue:** Revenue sources (e.g. WiFi, Charging) used in daily entry and summaries.
- **Packages:** Voucher packages (name, price, duration, type) used when generating vouchers.
- **Fixed Costs:** Recurring costs (name, amount, frequency: weekly/monthly/quarterly, active). Used in break-even analysis.
- **Expense Categories:** Categories and subcategories for expenses.
- **Subscriptions:** Track subscriptions (name, amount, frequency, next due date, alert days). Alerts when due soon; toast on load if any are due.
- **Admin Log:** List of admin actions (timestamp, user, action, detail). Admins can clear the log.
- **Monitoring:** System monitoring (admin only). Overview cards: Database status and ping time, Server uptime, Memory (heap with bar), Logs in last 24 hours. Data at a glance: Unused and sold voucher counts. Database section: connection status, ping, table row counts (users, sales, vouchers, expenses, assets, admin_log, settings, subscriptions). Server section: uptime, Node version, platform, environment, pool stats (if available), memory (heap and RSS) with bar. Total Expenses Logged: total UGX and record count from the expenses table. Business Summaries (moved here from old Summaries tab): Monthly Summary table (by month: WiFi, Charging, Total, Expenses, Net, Days), Weekly Breakdown table (by week: same plus Traded/Closed), Break-Even Analysis (monthly fixed costs, break-even per day, per-item costs), Financial Position (Total Revenue, Total Expenses, Net Position, Total Asset Value). Refresh button reloads monitoring data and re-renders summaries.

---

## API (high level)

- **Health:** GET `/api/health` — server and database status (no auth).
- **Auth:** Status, users list, register, login, forgot-pin, reset-pin, logout, me. Login and register return token and user; forgot-pin returns one-time code; reset-pin consumes code and sets new PIN.
- **Sales:** GET/POST sales; GET/PUT/DELETE by id (PUT/DELETE admin).
- **Vouchers:** GET list, POST batch generate, PATCH sell (mark codes sold), DELETE by id (admin).
- **Expenses:** GET list, POST create, PUT/DELETE by id (admin).
- **Assets:** GET list, POST create, PUT/DELETE by id (admin).
- **Users:** GET list, POST create, PUT/PATCH/DELETE by id (admin).
- **Settings:** GET all keys, PUT by key (admin).
- **Subscriptions:** GET (from settings data).
- **Admin log:** GET (with limit), DELETE clear (admin).
- **Backup:** GET download (admin, full JSON), POST restore (admin, body = backup object; replaces sales, vouchers, expenses, assets, settings, log; does not change users).
- **Monitoring:** GET `/api/monitoring` (admin) — database status, ping, table counts, voucher summary, log count last 24h, server uptime, Node version, platform, env, pool, memory. Used by the Monitoring tab in Settings.

All authenticated routes use JWT; admin-only routes also check `permissions === 'all'`.

---

## Backup and restore

- **Download backup:** Settings → Download Backup. Fetches full JSON (sales, vouchers, expenses, assets, settings, admin log) and triggers download.
- **Restore:** Settings → Restore from backup. User selects a previously downloaded JSON file; app sends it to POST `/api/backup/restore`. Server replaces sales, vouchers, expenses, assets, settings, and admin log; users are not changed. Confirmation required.
- **Scheduled backup:** Server runs a daily cron job (e.g. 2:00 AM) to run a file-based backup script (`backup/run-backup.js`).

---

## Security and robustness

- **PIN policy:** 4 digits required; weak PINs (common or repeated) blocked on register and login; rate limiting on login.
- **CORS:** Configurable allowed origins via `ALLOWED_ORIGINS`; localhost and common hosting domains can be allowed.
- **Helmet:** Security headers (CSP disabled to allow inline scripts in the single HTML).
- **Request logging:** Morgan for HTTP logs.
- **Errors:** API returns appropriate status codes and JSON error messages; frontend shows toasts and connection/retry when the API is unreachable or returns 404.

---

## PWA and offline

- **Service worker:** Caches the app shell (HTML and static assets) so the app can load from cache when offline. No separate “offline banner” in the current design; connection status is shown where relevant (e.g. Sales Log, header).
- **API_BASE:** Frontend can point to a different backend URL (e.g. Render); login and all API calls use that base. If the backend is unreachable (e.g. 404, sleep on free tier), the UI shows a short message and Retry.

---

## Documentation and tests

- **README.md:** Quick start, env, scripts, PIN recovery, backup/restore, docs and tech summary.
- **docs/API.md:** API reference (all endpoints, methods, auth, errors).
- **docs/PIN_RECOVERY.md:** Forgot PIN and admin PIN reset.
- **DEPLOYMENT.md, SECURITY.md, .env.example:** Deployment, security notes, and env vars.
- **tests/test-api.js:** Script to run health and auth-related API tests.

---

## Summary in one paragraph

SureLink WiFi Manager is a single-page Node/Express/PostgreSQL business app for WiFi and voucher operations. It provides login by PIN (with optional on-screen keypad and session timeout), dashboard with revenue and voucher KPIs, daily entry for sales and expenses, voucher generation and selling (with reconciliation on the same page), sales log (with admin edit/delete), expenses and assets registers, and an in-app guide. Admins get Settings: business info, users and permissions, revenue sources, voucher packages, fixed costs, expense categories, subscriptions tracker, admin log, and a Monitoring section that shows database and server status, table counts, voucher summary, logs in last 24h, Total Expenses Logged, and business summaries (monthly, weekly, break-even, financial position). Backup download/restore, forgot-PIN flow, and rate-limited login are included; the app is deployable with configurable API base and uses a service worker for offline shell caching.
