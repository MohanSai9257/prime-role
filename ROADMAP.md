# Roadmap

This roadmap describes intended work, not a promise of delivery. Items below
are planned unless described as present in the v0.1 development baseline.

## v0.1 development baseline

Currently present in the repository:

- Supabase email/password authentication, email verification, and protected
  workspace routes.
- A JavaScript Cloudflare Worker API and static asset app.
- A bundled 230-company implementation catalog.
- Browser-local workspace settings and base-resume storage.
- Node.js tests, a static build, and a Cloudflare dry-run verification command.

Job results, searching, sponsorship labels, ATS scores, and resume tailoring
remain simulated in this baseline.

## Next milestones

- Define a provider/integration architecture and replace simulated jobs with
  real job data sources, with clear provenance and update timing.
- Improve ATS matching and describe it clearly as an application-defined
  similarity measure, not an employer's private score or a hiring prediction.
- Design a resume tailoring workflow that preserves truthful, user-verified
  claims and clearly identifies generated changes.
- Add user-controlled resume export/download support.
- Expand unit and integration coverage for authentication, privacy boundaries,
  and application workflows.
- Improve contributor documentation and first-contribution guidance.
- Review accessibility, including keyboard interaction, semantics, and
  assistive-technology behavior.
- Continue security hardening for authentication, Worker APIs, dependencies,
  and browser-local data handling.
