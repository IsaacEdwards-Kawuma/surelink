# SureLink WiFi Manager — Setup & Deployment Guide

## What's in this package

```
surelink/
├── server.js              ← Main backend server (Node.js + Express)
├── package.json           ← Dependencies list
├── .env.example           ← Config template (copy to .env)
├── .gitignore
│
├── db/
│   ├── setup.js           ← Run once to create database + default data
│   └── index.js           ← Database connection module
│
├── routes/
│   ├── auth.js            ← Login, logout, JWT tokens
│   ├── sales.js           ← Daily entries (create, edit, delete)
│   └── data.js            ← Vouchers, expenses, assets, settings, users
│
├── backup/
│   └── run-backup.js      ← Auto-backup system (runs daily at 2am)
│
└── public/
    └── index.html         ← The full frontend app
```

---

## OPTION A — Run on your own computer (Windows/Mac/Linux)

### Step 1: Install Node.js
- Go to https://nodejs.org
- Download the **LTS version** (e.g. 20.x)
- Install it — accept all defaults

### Step 2: Extract this project
- Unzip the package to a folder, e.g. `C:\SureLink\` or `/home/andrew/surelink/`

### Step 3: Open a terminal in that folder
- Windows: Right-click the folder → "Open in Terminal"
- Mac/Linux: `cd /path/to/surelink`

### Step 4: Install dependencies
```bash
npm install
```
This downloads all required libraries (~30 seconds).

### Step 5: Configure environment
```bash
cp .env.example .env
```
Open `.env` in Notepad/any editor and change:
```
JWT_SECRET=replace_this_with_50_random_characters_like_xK9mP2qR7vN3wL8jT5
```
(Make up any long random string — this keeps logins secure)

### Step 6: Set up the database
```bash
npm run setup
```
Creates `db/surelink.db` with all tables. No default users — you create the first admin when you open the app.

### Step 7: Start the server
```bash
npm start
```
You'll see:
```
🚀 SureLink WiFi Manager running on port 3000
   Local: http://localhost:3000
```

### Step 8: Open the app
Go to **http://localhost:3000** in your browser. Create your first admin account on the registration screen, then add more users in Settings.

---

## OPTION B — Host online (recommended for access from multiple devices)

This lets you and your team access it from any phone or tablet.

### Cheapest option: Render.com (free tier available)

1. **Create account** at https://render.com

2. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "SureLink initial"
   # Create a repo on github.com, then:
   git remote add origin https://github.com/YOURUSERNAME/surelink.git
   git push -u origin main
   ```

3. **On Render:**
   - New → Web Service → Connect your GitHub repo
   - Build Command: `npm install && npm run setup`
   - Start Command: `npm start`
   - Add Environment Variables:
     - `JWT_SECRET` = your long random string
     - `NODE_ENV` = production

4. Render gives you a URL like `https://surelink-xyz.onrender.com`
   - Share the URL with your team; bookmark it on your devices

### Alternative: Railway.app
Similar process — also has a free tier.
Go to https://railway.app → New Project → Deploy from GitHub.

### Alternative: Your own VPS (DigitalOcean, Contabo, etc.)
If you have a Linux server:
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Upload your files (via SFTP or git)
cd /var/www/surelink

# Install + setup
npm install
cp .env.example .env
nano .env          # edit JWT_SECRET
npm run setup

# Run forever with PM2
sudo npm install -g pm2
pm2 start server.js --name surelink
pm2 startup        # auto-restart on reboot
pm2 save
```
Then point your domain to it using Nginx as a reverse proxy.

---

## First-time setup

There are **no default users**. When you open the app for the first time, you’ll see the registration screen. Create your first admin account there, then add more users in **Settings → Users**.

---

## Backup System

Backups run **automatically every day at 2am** and are saved to `backup/files/`.

To run a manual backup anytime:
```bash
npm run backup
```

To download a backup through the app:
- Settings → Click **Download Backup** button (top right)
- Saves a complete JSON file of all your data

Backups older than 30 days are automatically deleted.

---

## Changing a User's PIN

1. Log in as Admin
2. Settings → Users → Edit the user
3. Enter new 4-digit PIN → Save

---

## Database Location

Your data lives in `db/surelink.db` — a single SQLite file.
- **Back this file up regularly** (the auto-backup also exports everything to JSON)
- To restore from backup: use the JSON file or copy a backup `.db` file

---

## Troubleshooting

**Port already in use:**
```bash
# Change port in .env:
PORT=3001
```

**"Cannot find module" errors:**
```bash
npm install
```

**Forgot admin PIN:**
```bash
# Reset a user's PIN (replace 'YourName' with the user's name):
node -e "
const db=require('./db');
const bcrypt=require('bcryptjs');
db.prepare('UPDATE users SET pin_hash=? WHERE name=?').run(bcrypt.hashSync('1234',10),'YourName');
console.log('Done');
"
```

**Database corrupted:**
```bash
# Re-run setup (won't delete existing data, only adds missing tables)
npm run setup
```

---

## Tech Stack (Source Code Info)

| Component | Technology |
|-----------|-----------|
| Backend   | Node.js + Express.js |
| Database  | SQLite (via better-sqlite3) |
| Auth      | JWT tokens + bcrypt PIN hashing |
| Frontend  | Vanilla HTML/CSS/JavaScript (single file) |
| Backup    | JSON export + node-cron scheduler |
| Hosting   | Any Node.js host |

The entire frontend is in `public/index.html` — you can edit the colours,
layout, and labels by opening that file in any text editor.

---

## API Endpoints (for developers)

```
POST   /api/auth/login          Login → returns JWT token
GET    /api/auth/me             Verify token

GET    /api/sales               All daily entries
POST   /api/sales               New entry
PUT    /api/sales/:id           Edit entry (admin, requires reason)
DELETE /api/sales/:id           Delete entry (admin)

GET    /api/vouchers            All vouchers
POST   /api/vouchers/batch      Generate batch
PATCH  /api/vouchers/sell       Mark codes as sold

GET    /api/expenses            All expenses
POST   /api/expenses            New expense
PUT    /api/expenses/:id        Edit
DELETE /api/expenses/:id        Delete

GET    /api/assets              All assets
POST   /api/assets              Add asset
PUT    /api/assets/:id          Edit
DELETE /api/assets/:id          Delete

GET    /api/settings            All settings
PUT    /api/settings/:key       Update setting

GET    /api/users               All users (admin)
POST   /api/users               Add user
PUT    /api/users/:id           Edit user
PATCH  /api/users/:id/toggle    Activate/deactivate
DELETE /api/users/:id           Delete

GET    /api/admin-log           Activity log
DELETE /api/admin-log           Clear log

GET    /api/backup/download     Download full JSON backup
GET    /api/health              Server health check
```

---

*SureLink WiFi Manager v2.0 — Built for SureLink Kabira, Kampala*
