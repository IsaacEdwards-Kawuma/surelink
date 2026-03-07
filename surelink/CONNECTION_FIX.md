# Fix: "Cannot connect to server" — Connect frontend to your backend

Use these steps when the **frontend** is at one place (e.g. surelink-manager.net) and the **API/backend** runs somewhere else (e.g. Render).

---

## Step 1: Get your backend URL

- If the backend runs on **Render**: open your Render dashboard → your SureLink service → copy the URL (e.g. `https://surelink-wifi-manager.onrender.com`). Do **not** add `/api` — the app adds that automatically.
- If you're not sure, run the backend locally (`npm start`) and use `http://localhost:5000` for testing (replace `5000` with your `PORT` if different).

---

## Step 2: Set API_BASE in the frontend

1. Open **`public/index.html`** in your editor.
2. Find the **API LAYER** section near the top of the `<script>` (around lines 565–572).
3. Set **`API_BASE`** to your backend URL (as a string, in quotes).

**Before:**
```javascript
var API_BASE = ''; // e.g. 'https://surelink-wifi-manager.onrender.com' when ...
```

**After (example for Render):**
```javascript
var API_BASE = 'https://surelink-wifi-manager.onrender.com';  // your real Render URL
```

**After (example for local testing):**
```javascript
var API_BASE = 'http://localhost:5000';  // backend running locally
```

- Use your **actual** backend URL. No trailing slash. No `/api` at the end.
- Save the file.

---

## Step 3: Redeploy the frontend

- If the frontend is **hosted** (e.g. Vercel, Netlify, or surelink-manager.net): commit the change, push to your repo, and redeploy so the updated `index.html` is live.
- If you're **testing locally**: just refresh the page (and make sure the backend is running at the URL you put in `API_BASE`).

---

## Step 4: Allow your frontend origin on the backend (CORS)

The backend already allows `surelink-manager.net`, `onrender.com`, and `vercel.app`. If your frontend is on another domain:

1. On the machine/host where the backend runs (e.g. Render), set the **`ALLOWED_ORIGINS`** env var.
2. Set it to your frontend URL(s), comma-separated, no trailing slashes, e.g.:
   ```bash
   ALLOWED_ORIGINS=https://surelink-manager.net,https://www.surelink-manager.net
   ```
3. Restart/redeploy the backend so the new value is used.

---

## Quick checklist

- [ ] Backend URL copied (no `/api`, no trailing slash).
- [ ] `API_BASE = 'https://...'` set in `public/index.html`.
- [ ] File saved and frontend redeployed (or refreshed if local).
- [ ] Backend is running and reachable (e.g. open `https://your-backend.onrender.com/api/health` in a browser — you should see JSON).
- [ ] If frontend is on a custom domain, that domain is in `ALLOWED_ORIGINS` on the backend.

After this, the app should show "Server connected" and login should work.
