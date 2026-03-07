# Security — Keeping credentials safe

## Never expose these

- **DATABASE_URL** — Your PostgreSQL connection string (Neon, Render, Supabase). It contains your database password.
- **JWT_SECRET** — Used to sign login tokens. If leaked, anyone could forge admin sessions.

These must **only** exist in:

- **Local:** `.env` (already in `.gitignore` — never commit it).
- **Render / hosting:** Environment variables in the dashboard (server-side only).

## Do not

- Commit `.env` or paste DATABASE_URL / JWT_SECRET into code, frontend, or public repos.
- Share connection strings in chat, screenshots, or docs.
- Put DATABASE_URL or JWT_SECRET in `public/` or any file sent to the browser.

## If you exposed a credential

1. **Neon:** Dashboard → your project → reset the database user password, then set the new DATABASE_URL in Render and `.env`.
2. **JWT_SECRET:** Generate a new one, set it in `.env` and Render; all users will need to log in again.

## How this app keeps them safe

- `.env` is in `.gitignore` so it is never pushed to GitHub.
- DATABASE_URL and JWT_SECRET are only read on the server (Node.js); the frontend never sees them.
- Error messages shown to users never include connection strings or secrets.
