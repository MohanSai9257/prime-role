# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately. If GitHub private vulnerability
reporting is enabled for this repository, use its **Report a vulnerability**
feature. Otherwise, contact the maintainer through the GitHub profile for
[MohanSai9257](https://github.com/MohanSai9257). Do not publish an exploitable
vulnerability in a public issue, discussion, pull request, or other public
channel before a fix is available. Please allow the maintainer reasonable time
to investigate and coordinate a fix.

Never put secrets in GitHub issues or reports, including passwords, access
tokens, API keys, Supabase service-role keys, SMTP credentials, private keys, or
real users' personal data. Redact logs and include only the details needed to
reproduce the issue privately.

## Security-sensitive areas

Please take particular care when changing:

- **Supabase authentication:** signup, OTP verification, login, recovery,
  refresh, and logout flows, including the distinction between temporary and
  password-authenticated sessions.
- **Bearer-token validation:** Worker requests validate the access token with
  Supabase and check its authentication method before allowing protected API
  access. Do not treat decoded client-side claims alone as proof of identity.
- **Protected routes and APIs:** workspace routes and Worker endpoints must
  continue to enforce server-validated authentication and the intended account
  boundaries.
- **Browser-local resume storage:** resume files are stored in browser IndexedDB
  and are intended to remain on the user's device. Avoid uploading resume
  content or exposing it across accounts.
- **Cloudflare Worker APIs:** validate input, bound request sizes, avoid leaking
  private data, and keep credentials out of browser-readable assets and source
  control.

The Supabase URL and publishable key used by the browser are public client
configuration. Service-role keys, database passwords, SMTP credentials, and
other privileged credentials are secrets and must never be committed or exposed
to browser code.
