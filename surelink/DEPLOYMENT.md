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
     (Do **not** run `npm run setup` here — env vars like DATABASE_URL are not available during Build.)
   - **Start Command:**  
     `npm run setup && npm start`  
     (setup runs at start when DATABASE_URL is available; it creates tables if missing.)

## Step 3: Environment variables on Render

In the same Web Service, open **Environment** and add:

| Key | Value | Required |
|-----|--------|----------|
| `NODE_ENV` | `production` | Yes |
| `PORT` | `3000` (or leave blank; Render sets `PORT` automatically) | Optional |
| `JWT_SECRET` | A long random string (50+ characters). Example: `xK9mP2qR7vN3wL8jT5sL1nM4bV6cX8zQ0aF2hJ7kD9gY3wE5rT` | **Yes** |
| `DATABASE_URL` | PostgreSQL connection string (from your DB host) | **Yes** |
| `BACKUP_DIR` | `./backup/files` | Optional |
| `BACKUP_KEEP_DAYS` | `30` | Optional |
| `ADMIN_EMAIL` | Your email (e.g. `kasacpride@gmail.com`) | Optional |
| `ALLOWED_ORIGINS` | Leave **empty** to allow all origins, or set your Vercel URL later, e.g. `https://surelink.vercel.app` | Optional (needed if you use Vercel frontend) |

**Get a free PostgreSQL database (pick one):**

- **Render:** Dashboard → New → PostgreSQL. After creation, copy the **Internal Database URL** (or External) into `DATABASE_URL`.
- **Neon:** [neon.tech](https://neon.tech) → Create project → copy connection string.
- **Supabase:** [supabase.com](https://supabase.com) → New project → Settings → Database → copy connection string (use Session mode, URI).

Then run `npm run setup` once (via Start Command or manually) to create tables.

**Minimum for first deploy:**

- `NODE_ENV` = `production`
- `JWT_SECRET` = (your long random secret)
- `DATABASE_URL` = (your PostgreSQL connection string)

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
- So `backup/files/` on disk will **not** persist across restarts. Data is stored in PostgreSQL (persistent).
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
| `DATABASE_URL` | Your PostgreSQL URL (e.g. from Render Postgres, Neon, Supabase) |
| `BACKUP_DIR` | `./backup/files` |
| `BACKUP_KEEP_DAYS` | `30` |
| `ADMIN_EMAIL` | `kasacpride@gmail.com` |
| `ALLOWED_ORIGINS` | Empty, or `https://your-app.vercel.app` when using Vercel frontend |

## Vercel (frontend only)

| Variable | When to use | Example |
|----------|---------------------|----------|
| `NEXT_PUBLIC_API_URL` or `VITE_API_URL` | Only if you use a build step that injects API URL into HTML/JS | `https://surelink-xxxx.onrender.com/api` |

---

## Vercel: redeploy not updating or build failing

1. **Root Directory must be `surelink`**  
   If the Git repo root is the monorepo (contains `render.yaml` + `surelink/`), set **Root Directory** in Vercel → Project → Settings → General to **`surelink`**. Deploying the repo root has no `public/` at the top level and will fail or serve the wrong tree.

2. **Vercel auto-detects “Node” because of `package.json`**  
   It may try to run `server.js` as serverless and fail, or ignore `public/`. This repo includes **`vercel.json`** with `framework: null`, `outputDirectory: public`, and a tiny build step so the deployment is **static files from `public/`** only. The API stays on Render.

3. **Production branch**  
   Under Git → check **Production Branch** is the branch you push to (e.g. `main`). Preview deployments use other branches.

4. **Stale UI after a “successful” deploy**  
   The service worker caches `index.html`. After a release we bump `CACHE_NAME` in `public/sw.js` so clients fetch the new shell. Hard refresh (Ctrl+F5) or clear site data if you still see an old version.

5. **CORS**  
   Set Render `ALLOWED_ORIGINS` to the **exact** Vercel URL (including `https://` and no trailing slash unless you use one consistently). Preview URLs like `https://surelink-git-main-xxx.vercel.app` are different from production — add each if you test previews.

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
