# Prime Role

Prime Role is a Cloudflare-native job discovery and resume workspace built with
plain HTML, CSS, and JavaScript. The frontend and JavaScript Worker API deploy
together from one repository. There is no React, TypeScript, Python, FastAPI,
JDK, or separate backend service.

The current release is a development slice: company data, three example jobs,
search results, ATS scores, sponsorship labels, and resume tailoring are
simulated. It does not yet crawl company websites or generate tailored files.

## Technology

- Vanilla HTML, CSS, and JavaScript
- Cloudflare Workers and Static Assets
- Supabase email/password authentication with email verification
- IndexedDB for browser-local base-resume storage
- Node.js 22+ and npm for development and deployment

The base resume never leaves the user's browser. Cloudflare Workers do not have
a persistent laptop filesystem, so the application validates the DOCX and saves
it in browser storage instead of uploading it to a server.

## Install and run

```bash
npm clean-install
npm run dev
```

Wrangler starts the local application at `http://localhost:8788`.

## Test and verify

```bash
npm test
npm run verify
```

`npm run verify` runs the JavaScript tests, builds the static application, and
performs a Cloudflare dry-run deployment.

## Deploy from a terminal

Authenticate once:

```bash
npx wrangler login
```

Then deploy:

```bash
npm run deploy
```

## Cloudflare Git deployment settings

The root directory must be the repository root.

```text
Build command: npm run build
Deploy command: npm run deploy:cloudflare
```

Cloudflare automatically runs `npm clean-install` first. The root
`package.json` and committed `package-lock.json` make that installation work.

The current Worker name is `app`, matching the Cloudflare project name shown
during setup. If the Cloudflare project is renamed, update `name` in
`wrangler.jsonc`.

## Repository layout

```text
prime-role/
├── package.json
├── package-lock.json
├── wrangler.jsonc
├── web/                   Plain browser application
├── worker/                JavaScript API and company catalog
├── scripts/build.mjs      Static-asset build
└── test/                  Node JavaScript tests
```

## Authentication

Prime Role uses Supabase Auth for:

- Email/password sign up
- Six-digit email verification
- Email/password sign in
- Password recovery and password update
- Persistent, refreshable sessions and logout

The browser contains only the Supabase project URL and publishable key. No
service-role key, database password, plain-text password, or OTP is stored by
Prime Role. Protected Worker APIs validate the bearer token against Supabase
before returning application data.

The public browser routes are:

```text
/signin
/signup
/verify-otp
/account-created
/forgot-password
/update-password
```

`/dashboard`, `/jobs`, `/profile`, `/resume`, `/run-history`,
`/applications`, and `/settings` require a server-validated Supabase session.
Anonymous navigation is returned to `/signin`. Signup verification and
password-recovery sessions are explicitly prevented from opening the
workspace. Protected Worker endpoints also require the access token's
Supabase `amr` claim to include `password`.

Browser-local settings and IndexedDB resume records are keyed by the validated
Supabase user ID. Signing out clears user-derived UI, modals, and notifications,
so accounts sharing one browser profile do not inherit each other's resume
metadata or settings.

### Required Supabase Auth configuration

In the `prime-role-dev` Supabase project:

1. Enable the Email provider and email signups.
2. Keep **Confirm email** enabled.
3. Set the minimum password length to at least 8.
4. Set the email OTP expiry to 3600 seconds or less.
5. Enable leaked-password protection if the Supabase plan supports it.
6. Set the production Site URL and allow these password-recovery redirect
   destinations:
   - `http://localhost:8788/update-password`
   - `https://YOUR-CLOUDFLARE-HOST/update-password`
7. Follow [SUPABASE_OTP_SETUP.md](SUPABASE_OTP_SETUP.md): configure custom SMTP
   first, then change the **Confirm signup** template to display `{{ .Token }}`
   without `{{ .ConfirmationURL }}`. Keep the password-recovery template's
   secure recovery link.

The project was created after June 3, 2026. New Free projects using Supabase's
default email provider cannot customize auth templates, so custom SMTP (or a
paid Supabase plan) is required before the email can contain the requested
six-digit code. Prime Role signup is OTP-only and does not accept a signup
confirmation link as a substitute for the code.

No additional application secret or environment variable is required for this
browser-based Supabase flow. Never add a Supabase secret/service-role key to
`web/`, `worker/`, Wrangler variables exposed to the browser, or Git.

### Local authentication test

1. Complete [SUPABASE_OTP_SETUP.md](SUPABASE_OTP_SETUP.md).
2. Run `npm run dev` and open `http://localhost:8788/signup`.
3. Create an account and confirm that `/verify-otp` opens.
4. Enter the six-digit code from the Confirm Signup email.
5. Confirm that `/account-created` appears and the workspace remains locked.
6. Select **Go to Sign in**, enter the email/password, and confirm that
   `/dashboard` opens.
7. Sign out and confirm that `/jobs` redirects to `/signin`.
8. Use **Forgot password?**, open the reset link, choose a new password, and
   sign in again.

## Built-in company catalog

- `IMPLEMENTATION`: 230 companies
- `DIRECT_CLIENT`: 0 companies in the supplied workbook
- `VENDOR`: 0 companies in the supplied workbook

Empty categories remain selectable and correctly produce zero search results.

ATS percentages are application-defined similarity indicators, not guarantees
of an employer's private ATS score. Resume tailoring must remain truthful.
