# Contributing to Prime Role

Thanks for considering a contribution. Small fixes, clear documentation, and
careful reports are all welcome. Please keep changes focused and describe their
impact for people using the project.

## Set up the project

1. Fork [the repository](https://github.com/MohanSai9257/prime-role) on GitHub.
2. Clone your fork and enter the project directory:

   ```bash
   git clone https://github.com/YOUR-GITHUB-NAME/prime-role.git
   cd prime-role
   ```

3. Install Node.js 22 or later (the repository pins Node 22 in `.node-version`).
   Use a current npm version compatible with that Node.js release.
4. Install dependencies and start the local app:

   ```bash
   npm clean-install
   npm run dev
   ```

   Wrangler serves the app at `http://localhost:8788`.
5. Run the tests and full local verification before submitting:

   ```bash
   npm test
   npm run verify
   ```

   Verification runs tests, builds the static app, and performs a Cloudflare
   dry-run deployment. It does not deploy to production.

## Make a change

Create a descriptive branch from the current default branch, for example:

```bash
git switch -c fix/clear-error-message
```

Keep commits focused, use a concise imperative subject, and include enough
context in the pull request to explain why the change is useful. Update relevant
documentation when behavior or setup changes. Add or update tests for new
behavior when practical.

Never commit credentials or secrets, including Supabase service-role keys,
SMTP credentials, access tokens, passwords, or private keys. Keep local values
in ignored files such as `.dev.vars`; verify the staged diff before committing.
The browser-visible Supabase URL and publishable key are public client
configuration, not substitutes for server-side secrets.

Resume content and job-search claims must remain truthful. Do not add or suggest
unverified experience, skills, employment, sponsorship status, or qualifications
as facts. Clearly label demo data and application-defined match scores.

Authentication, bearer-token validation, session handling, access control,
resume storage, and Worker API changes are security-sensitive. Explain the
threat or user need, preserve server-side session validation and per-user data
boundaries, avoid collecting or transmitting resume data unnecessarily, and
include focused tests and documentation. Do not weaken authentication checks to
make a test or flow pass. Report suspected vulnerabilities privately as described
in [SECURITY.md](SECURITY.md).

## Issues and pull requests

Open an issue using the relevant bug report or feature request form. Include
reproduction steps and relevant runtime details for bugs, and remove personal
information, tokens, and secrets from all logs. Search existing issues first when
practical.

To contribute code, push your branch to your fork and open a pull request
against the repository's default branch. Complete the pull request template,
link any related issue, describe what changed and why, and report the test and
verification results. A maintainer may ask for changes or clarification before
merging.
