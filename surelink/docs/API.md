# SureLink WiFi Manager — API Reference

Base URL: `/api` (e.g. `https://your-app.onrender.com/api`).

All authenticated routes require header: `Authorization: Bearer <token>`.

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Server and database status. Returns `200` + `{ status, database, version }` or `503` if DB down. |

---

## Auth (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/status` | No | First-run check. Returns `{ firstRun, userCount }`. |
| GET | `/api/auth/seed-defaults` | No | Optional seed; returns `{ ok, message }`. |
| GET | `/api/auth/users` | No | List users for login dropdown. Returns `[{ id, name, id_number, role }]`. |
| POST | `/api/auth/register` | No (first run) or Admin | Create account. Body: `name`, `pin`, `confirmPin`, optional `idNumber`, `phone`, `businessName`, `role`, `permissions`. PIN: 4 digits, not weak (e.g. 1234, 0000). |
| POST | `/api/auth/login` | No | Login. Body: `userId`, `pin`. Returns `{ token, user }`. Rate-limited (e.g. 20 attempts / 15 min). |
| POST | `/api/auth/logout` | Yes | Logout (logged in Admin Log). |
| GET | `/api/auth/me` | Yes | Current user. Returns `{ id, name, role, permissions }`. |

---

## Sales (`/api/sales`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sales` | Yes | List all daily entries. |
| GET | `/api/sales/:id` | Yes | Single entry by id. |
| POST | `/api/sales` | Yes | Create daily entry. Body: `date`, `week`, `att`, `totalRev`, `wifi`, `charging`, `expenses`, `expDesc`, `expCat`, `expSub`, `notes`, `downtime`, `revenueData`. |
| PUT | `/api/sales/:id` | Admin | Update entry. Body: same + `reason` (required). |
| DELETE | `/api/sales/:id` | Admin | Delete entry. |

---

## Vouchers (`/api/vouchers`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/vouchers` | Yes | List all vouchers. |
| POST | `/api/vouchers/batch` | Yes | Generate batch. Body: `packages` (array of `{ pkgId, pkgType, price, duration, qty }`), `issuedDate`, `issuedTo`, `batch`. |
| PATCH | `/api/vouchers/sell` | Yes | Mark sold. Body: `codes` (array), `date`. Returns `{ found, notFound }`. |
| DELETE | `/api/vouchers/:id` | Admin | Delete voucher. |

---

## Expenses (`/api/expenses`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/expenses` | Yes | List all expenses. |
| POST | `/api/expenses` | Yes | Create. Body: `date`, `dateDisp`, `desc`, `cat`, `sub`, `amt`, optional `saleId`. |
| PUT | `/api/expenses/:id` | Admin | Update. |
| DELETE | `/api/expenses/:id` | Admin | Delete. |

---

## Assets (`/api/assets`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/assets` | Yes | List all assets. |
| POST | `/api/assets` | Yes | Create. Body: `name`, `category`, `value`, `date`, `source`, `status`, `notes`, optional `expenseId`. |
| PUT | `/api/assets/:id` | Admin | Update. |
| DELETE | `/api/assets/:id` | Admin | Delete. |

---

## Users (admin) (`/api/users`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Admin | List users (id, name, role, permissions, etc.). |
| POST | `/api/users` | Admin | Create user. Body: `name`, `pin` (4 digits, not weak), `idNumber`, `role`, `phone`, `email`, `permissions`. |
| PUT | `/api/users/:id` | Admin | Update user. Body: optional `name`, `pin`, `idNumber`, `role`, `phone`, `email`, `permissions`. |
| PATCH | `/api/users/:id/toggle` | Admin | Toggle active. |
| DELETE | `/api/users/:id` | Admin | Delete user (fails if last active). |

---

## Settings (`/api/settings`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/settings` | Yes | All settings keys: `business`, `revenue_sources`, `voucher_packages`, `fixed_costs`, `expense_categories`, `subscriptions`. |
| PUT | `/api/settings/:key` | Admin | Update one key. Body: JSON value. Keys: as above. |

---

## Subscriptions (`/api/subscriptions`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/subscriptions` | Yes | List subscriptions (from settings data). |

---

## Admin log (`/api/admin-log`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin-log` | Admin | Recent log. Query: `limit` (default 300). |
| DELETE | `/api/admin-log` | Admin | Clear log. |

---

## Backup (`/api/backup`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/backup/download` | Admin | Download full JSON backup. |
| POST | `/api/backup/restore` | Admin | Restore from JSON backup (body = backup object). Replaces sales, vouchers, expenses, assets, settings, admin log; does not change users. |

---

## Errors

- `400` — Bad request (validation, e.g. PIN too weak, missing fields).
- `401` — Not authenticated or wrong PIN.
- `403` — Not admin.
- `404` — Not found.
- `409` — Conflict (e.g. duplicate date, duplicate name).
- `429` — Too many requests (e.g. login rate limit). Body: `{ error }` or `{ message }`.
- `503` — Service unavailable (e.g. database not ready).

Responses use JSON `{ error: "message" }` (or `message`) for error details.
