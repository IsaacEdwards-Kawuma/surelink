# SureLink — Render & Vercel Deployment Guide

This guide covers deploying SureLink to **Render** (backend + full app) and **Vercel** (frontend-only, optional).

---

## Architecture choice

| Option | Where | Best for |
|--------|--------|-----------|
| **Render only** | Backend + frontend on Render | Easiest: one URL, one place for env vars |
| **Render + Vercel** | Backend on Render, frontend on Vercel | Separate frontend URL and CDN; need to set API URL |

**Recommended:** Deploy the whole app on **Render** first. Use Vercel only if you want the UI on Vercel’s CDN and the API on Render.

---

# Part 1 — Deploy to Render (backend + full app)

## Step 1: Prepare the repo

- Code is already on GitHub: `https://github.com/IsaacEdwards-Kawuma/surelink`
- Root of the repo is “SureLink v2 Source Code”; the app lives in the **surelink/** folder.

Render can deploy from a **subdirectory**. You’ll set that in Step 3.

## Step 2: Create a Render account and service

1. Go to [https://render.com](https://render.com) and sign up (or log in with GitHub).
2. Click **Dashboard** → **New +** → **Web Service**.
3. Connect GitHub and choose the **surelink** repo (or the repo that contains the `surelink` folder).
4. Configure:
   - **Name:** `surelink` (or any name).
   - **Region:** Choose closest to your users.
   - **Branch:** `main`.
   - **Root Directory:** `surelink`  
     (so Render runs `npm install` and `npm start` inside the `surelink` folder).
   - **Runtime:** `Node`.
   - **Build Command:**  
     `npm install`  
   - **Start Command:**  
     `npm run setup && npm start`  
     (setup creates the DB at runtime so it exists in the container).

## Step 3: Environment variables on Render

In the same Web Service, open **Environment** and add:

| Key | Value | Required |
|-----|--------|----------|
| `NODE_ENV` | `production` | Yes |
| `PORT` | `3000` (or leave blank; Render sets `PORT` automatically) | Optional |
| `JWT_SECRET` | A long random string (50+ characters). Example: `xK9mP2qR7vN3wL8jT5sL1nM4bV6cX8zQ0aF2hJ7kD9gY3wE5rT` | **Yes** |
| `DB_PATH` | `./db/surelink.db` | Optional (default) |
| `BACKUP_DIR` | `./backup/files` | Optional |
| `BACKUP_KEEP_DAYS` | `30` | Optional |
| `ADMIN_EMAIL` | Your email (e.g. `kasacpride@gmail.com`) | Optional |
| `ALLOWED_ORIGINS` | Leave **empty** to allow all origins, or set your Vercel URL later, e.g. `https://surelink.vercel.app` | Optional (needed if you use Vercel frontend) |

**Minimum for first deploy:**

- `NODE_ENV` = `production`
- `JWT_SECRET` = (your long random secret)

Generate a secret (run locally once):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the output as `JWT_SECRET`.

## Step 4: Deploy

- Click **Create Web Service**.
- Render will build and start the app. When ready, you’ll get a URL like:
  - `https://surelink-xxxx.onrender.com`

## Step 5: Use the app

- Open the Render URL in the browser.
- No default users — create your first admin account on the registration screen, then add users in Settings.

## Important: SQLite on Render free tier

- Render’s free tier has **ephemeral disk**: the filesystem is reset on each deploy or when the service sleeps.
- So `db/surelink.db` and `backup/files/` will **not** persist across restarts.
- For a **persistent** database you’d need:
  - Render **persistent disk** (paid), or  
  - A hosted DB (e.g. PostgreSQL on Render) and code changes to use it instead of SQLite.

For testing/demo, the free tier is fine; just expect data to reset after a redeploy or sleep.

---

# Part 2 — Deploy to Vercel (frontend only, API on Render)

Use this if you want the UI hosted on Vercel and the API on Render.

## Step 1: Backend already on Render

- You should have the Render URL, e.g. `https://surelink-xxxx.onrender.com`.
- The API base is: `https://surelink-xxxx.onrender.com/api`.

## Step 2: Allow CORS from Vercel

On **Render** → your service → **Environment**:

- Set **ALLOWED_ORIGINS** to your Vercel URL (you can add it after you get the URL), e.g.  
  `https://surelink.vercel.app`  
  or  
  `https://surelink-*.vercel.app`  
  (Vercel uses random subdomains; you may need to add the exact URL from the Vercel dashboard).

## Step 3: Point frontend to Render API

The frontend in `public/index.html` uses:

```js
const API = '/api';
```

So it only works when the page is served from the same origin as the API. For Vercel you must point it to your Render URL.

**Option A — Edit before deploy (simplest):**

1. In `surelink/public/index.html`, find the line:
   ```js
   const API = '/api';
   ```
2. Replace with (use your real Render URL):
   ```js
   const API = 'https://surelink-xxxx.onrender.com/api';
   ```
3. Commit and push. Then deploy that repo to Vercel (Step 4).

**Option B — Use Vercel env and a small build step (advanced):**

- Add a build script that replaces a placeholder like `__API_URL__` in `index.html` with an env var (e.g. `VITE_API_URL` or `NEXT_PUBLIC_API_URL`), and set that env in Vercel to your Render API base. This requires a minimal build (e.g. Node script run in “Build Command” on Vercel).

## Step 4: Deploy frontend to Vercel

1. Go to [https://vercel.com](https://vercel.com) and sign up / log in (e.g. with GitHub).
2. **Add New** → **Project** → Import your **surelink** GitHub repo.
3. Configure:
   - **Framework Preset:** Other (or leave default).
   - **Root Directory:** `surelink` (so Vercel uses the folder that contains `public`).
   - **Build Command:** leave empty, or if you use Option B above, use your replace script.
   - **Output Directory:** `public`  
     (so Vercel serves the contents of `public`, including `index.html`).
   - **Install Command:** `npm install` (optional if you have no build deps).

4. **Environment variables (Vercel):**
   - Only needed if you use Option B (build-time API URL). Example:
   - **Key:** `NEXT_PUBLIC_API_URL` or `VITE_API_URL`  
   - **Value:** `https://surelink-xxxx.onrender.com/api`  
   (Use the same name your build script reads.)

5. Click **Deploy**. Vercel will give you a URL like `https://surelink-xxx.vercel.app`.

## Step 5: Update Render CORS

- In Render → Environment, set **ALLOWED_ORIGINS** to the exact Vercel URL (e.g. `https://surelink-xxx.vercel.app`).
- Redeploy the Render service if needed.

---

# Environment variables summary

## Render (backend / full app)

| Variable | Example / notes |
|----------|------------------|
| `NODE_ENV` | `production` |
| `PORT` | Omit (Render sets it) or `3000` |
| `JWT_SECRET` | 50+ character random string |
| `DB_PATH` | `./db/surelink.db` |
| `BACKUP_DIR` | `./backup/files` |
| `BACKUP_KEEP_DAYS` | `30` |
| `ADMIN_EMAIL` | `kasacpride@gmail.com` |
| `ALLOWED_ORIGINS` | Empty, or `https://your-app.vercel.app` when using Vercel frontend |

## Vercel (frontend only)

| Variable | When to use | Example |
|----------|---------------------|----------|
| `NEXT_PUBLIC_API_URL` or `VITE_API_URL` | Only if you use a build step that injects API URL into HTML/JS | `https://surelink-xxxx.onrender.com/api` |

---

# Quick reference

**Render**

1. New → Web Service → Connect GitHub → select repo.  
2. **Root Directory:** `surelink`.  
3. Build: `npm install`. Start: `npm run setup && npm start`.  
4. Env: `NODE_ENV=production`, `JWT_SECRET=<long random string>`.  
5. Deploy → use the given URL as app and API base.

**Vercel (optional)**

1. New Project → Import repo → Root: `surelink`, Output: `public`.  
2. Set `ALLOWED_ORIGINS` on Render to your Vercel URL.  
3. In `public/index.html` set `API` to `https://your-render-url.onrender.com/api` (or use env + build step).

---

*SureLink WiFi Manager v2.0*
