# Prime Role

Prime Role is an early-stage, Cloudflare-native career workflow prototype. It
pairs a vanilla JavaScript browser app with a Cloudflare Worker API and Supabase
email/password authentication.

## What Prime Role is

The project explores a privacy-conscious workspace for organizing a job search
and a base resume. It is not a live job aggregator or a source of
verified job, sponsorship, or employer ATS information.

## Who this project is for

Prime Role is for developers and job seekers experimenting with privacy-conscious
career workflow tooling.

## Current status

This repository is a development/demo-stage project, not a production job
service. Authentication and a protected workspace are implemented. Job
searching, job results, ATS scores, sponsorship labels, search-run results, and
resume tailoring are currently simulated. A simulated search does not contact
company websites; simulated tailoring does not create or overwrite a file.

## Key features

Implemented:

- Supabase email/password signup, email OTP verification, sign-in, password
  recovery, and session handling.
- Protected workspace routes and Worker APIs that validate bearer tokens with
  Supabase.
- A bundled company catalog with 230 implementation companies. Direct-client
  and vendor categories are present but empty.
- Browser-local workspace settings and DOCX base-resume storage using IndexedDB.
- DOCX validation, JavaScript tests, a static asset build, and Cloudflare dry-run
  verification.

Simulated or not implemented:

- Job discovery, search results, and employer contact are demo behavior only.
- Sponsorship labels and ATS percentages are examples, not verified employer
  data or an employer's private ATS score. The ATS percentage is an
  application-defined similarity indicator.
- Resume tailoring currently returns a demo response. It does not generate or
  download a tailored resume.
- There is no application database or server-side persistence for search runs
  and workspace data.

## Architecture

- **Browser:** vanilla HTML, CSS, and JavaScript; Supabase's browser client.
- **API and hosting:** a JavaScript Cloudflare Worker serves static assets and
  handles `/api` routes.
- **Authentication:** Supabase Auth. Protected API requests are checked with
  Supabase before use.
- **Local resume storage:** the base DOCX remains in browser IndexedDB. Its
  filename and settings are stored locally and scoped to the signed-in user.
- **Build and development:** Node.js 22 and npm; Wrangler runs the local Worker.

## Privacy and security

The base resume is stored in the browser and is not uploaded to the Worker.
Local browser storage is not encrypted by this application; use a trusted device
and browser profile. The browser includes only the Supabase URL and publishable
key, which are public client configuration. Never commit service-role keys,
passwords, SMTP credentials, access tokens, or other secrets. See
[SECURITY.md](SECURITY.md) for sensitive areas and private vulnerability
reporting instructions.

## Getting started

Requirements: Node.js 22 (see `.node-version`) and npm.

```bash
npm clean-install
npm run dev
```

Open `http://localhost:8788`. Authentication requires the Supabase email
provider setup described in [SUPABASE_OTP_SETUP.md](SUPABASE_OTP_SETUP.md).

## Testing

```bash
npm test
npm run verify
```

`npm test` runs the Node.js test suite. `npm run verify` runs the tests, builds
the static application, and performs a Cloudflare dry-run deployment. Neither
command deploys to production or requires Cloudflare credentials.

## Contributing

Bug reports, focused improvements, tests, and documentation updates are
welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup and contribution
guidance. Please report security vulnerabilities privately using the process in
[SECURITY.md](SECURITY.md), rather than opening a public issue.

## Roadmap

Planned work includes replacing simulated jobs with a provider integration
architecture, improving and documenting application-defined ATS matching,
building a truthful resume tailoring and export workflow, expanding tests,
improving accessibility, and continuing security hardening. These are future
goals, not current capabilities. See [ROADMAP.md](ROADMAP.md) for milestones.

## License

Prime Role is distributed under the [MIT License](LICENSE).

## Additional project documentation

- [Supabase OTP setup](SUPABASE_OTP_SETUP.md)
- [Changelog](CHANGELOG.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
