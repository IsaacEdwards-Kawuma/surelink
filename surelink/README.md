# SureLink WiFi Manager

Business management system for WiFi / voucher operations: daily sales, vouchers, expenses, assets, users, and settings. Single-page web app with Node/Express backend and PostgreSQL.

## Features

- **Dashboard** ? KPIs, revenue, and summaries  
- **Daily Entry** ? Record sales, WiFi/charging, expenses, voucher codes  
- **Vouchers** ? Generate and track voucher packages  
- **Sales Log** ? View and edit daily entries (admin)  
- **Expenses & Assets** ? Track costs and assets  
- **Settings** ? Business info, revenue sources, packages, users, admin log  
- **Backup** ? Download full JSON backup; restore from backup (admin)  
- **Offline** ? Service worker caches the app shell; banner when offline  

## Quick start (local)

1. **Clone and install**
   ```bash
   cd surelink
   npm install
   ```

2. **Environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set:
   - `JWT_SECRET` ? long random string (50+ chars)  
   - `DATABASE_URL` ? PostgreSQL connection string (e.g. from [Neon](https://neon.tech) or [Supabase](https://supabase.com))

3. **Database**
   ```bash
   npm run setup
   ```
   Creates tables if they don?t exist.

4. **Run**
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000). First visit creates the first admin account.

## Scripts

| Command        | Description                    |
|----------------|--------------------------------|
| `npm start`    | Start server                   |
| `npm run dev`  | Start with nodemon            |
| `npm run setup`| Create/update DB tables        |
| `npm run backup` | Run manual backup (files)   |

## PIN recovery

**Forgot PIN?** ? On the login screen, click **Forgot PIN?**, select your account, get a one-time code (valid 15 min), then set a new PIN. **Admin reset** ? An admin can reset any user's PIN: **Settings ? Users ? Edit**.

- An **admin** can reset any user's PIN: **Settings ? Users ? Edit** that user, enter a new 4-digit PIN (leave blank to keep current), and save.  
- PINs must be 4 digits and cannot be weak (e.g. 1234, 0000). See [docs/PIN_RECOVERY.md](docs/PIN_RECOVERY.md) and [SECURITY.md](SECURITY.md).

## Backup and restore

- **Download:** Settings ? **Download Backup** (admin). Saves a JSON file with sales, vouchers, expenses, assets, settings, and admin log.  
- **Restore:** Settings ? **Restore from backup** (admin). Upload a previously downloaded JSON file to replace current data (except users). Use with care; this overwrites existing data.

## Docs and config

- [DEPLOYMENT.md](DEPLOYMENT.md) ? Deploy to Render / Vercel  
- [SECURITY.md](SECURITY.md) ? Security notes  
- [docs/API.md](docs/API.md) ? API endpoint reference  
- [.env.example](.env.example) ? Environment variables  

## Tech

- **Backend:** Node.js, Express, PostgreSQL (pg), JWT, bcrypt, Helmet, CORS, rate limiting  
- **Frontend:** Single HTML/CSS/JS app, service worker for offline shell  

## License

Proprietary. See repo owner for terms.
