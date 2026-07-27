# CLAUDE.md — Prime Role

Job-discovery + resume workspace. **Vanilla HTML/CSS/JS frontend + one Cloudflare Worker**, deployed together from this repo. No React, TypeScript, Python, or FastAPI. Supabase provides email/password auth with 6-digit email verification. Current build is a **demo slice**: jobs, ATS scores, sponsorship labels, search, and tailoring are simulated — nothing crawls websites or writes files.

## Commands (Node 22+)
- `npm run dev` — build + `wrangler dev` → http://localhost:8788
- `npm test` — Node test runner over `test/*.test.js`
- `npm run verify` — test + build + wrangler dry-run deploy
- `npm run deploy` — build + `wrangler deploy`

## Layout
- `web/` — static browser app: `index.html`, `app.js`, `auth-controller.js`, `auth-helpers.js`, `styles.css`, `_headers`
- `worker/index.js` — JS API (`/api/*`) + serves static assets with SPA fallback; hardcodes the **public** Supabase URL + publishable key (safe)
- `worker/data/companies.json` — built-in company catalog (~230 IMPLEMENTATION)
- `scripts/build.mjs` — copies `web/` → `dist/`, bundles Supabase UMD to `dist/vendor/supabase.js`
- `wrangler.jsonc` — Worker/project name `app`, assets from `dist/`, `/api*` hits the Worker first
- `test/` — `worker.test.js`, `auth-helpers.test.js`

## API (worker/index.js)
Public: `GET /api/health`, `GET /api/public-config`. All others require a Supabase bearer token whose `amr` claim includes `password`: `GET /api/jobs`, `GET /api/companies[/summary]`, `GET|PUT /api/settings`, `POST /api/search-runs`, `POST /api/jobs/:id/tailor`. `POST /api/resumes/base` intentionally returns 409 — base resumes never leave the browser (IndexedDB).

## Auth & routes
Flow: signup → 6-digit email OTP (`/verify-otp`) → `/account-created` → sign in → `/dashboard`. Public routes: `/signin /signup /verify-otp /account-created /forgot-password /update-password`. All other routes server-validate the session or redirect to `/signin`. Full Supabase project setup is in `README.md`.

## Security invariants — do not break
- **Never** add a Supabase service-role key, DB password, or OpenAI key to `web/`, `worker/`, wrangler vars, or git. The browser gets only the URL + publishable key.
- Base resume (DOCX) stays in browser IndexedDB — never uploaded to the Worker.
- ATS % is an app-side similarity indicator, not a real employer score — keep tailoring and claims truthful.

## Deploy (Cloudflare)
`npx wrangler login` once, then `npm run deploy`. Git-based deploy: build = `npm run build`, deploy = `npm run deploy:cloudflare`, root dir = repo root. Worker/project name is `app` — change `name` in `wrangler.jsonc` if the Cloudflare project is renamed.

## Leftovers (ignore)
Root `.env`, `backend/`, `frontend/`, `.venv`, `.pytest_cache` are remnants of the removed Python/React stack — untracked/gitignored and unused by the current app.
