# Known limitations & candidate roadmap

Honest list of what's missing, stubbed, or deliberately deferred — the starting backlog for post-trial iteration. Nothing here is a bug; they're scope lines we drew. (Items fixed during the 2026-09-02→04 batches have been removed; `git log docs/known-limitations.md` has the history.)

## Things a user will notice

- **Anything email needs SMTP.** Invites and password reset both work only with SMTP configured (see operations.md "Enabling email"); without it the inviter shares the on-screen code by hand, and a forgotten password on an SMTP-less instance still needs server-side surgery (`php artisan tinker` to set a new hash, or `babylog-reset-data`).
- **Amounts are oz/ml only.** Household-synced unit setting; storage and sync stay oz, so ml renders round to the nearest 5 ml. The comp's `timeStep` and `smartPrefill` props remain unexposed.
- **Home timeline shows the last 12 entries**, and stats tiles plus the bar charts stay on a fixed 7-day window — day drill-down pages back to the oldest logged day, but there's no month/calendar view.
- **Entry types are fixed** (bottle, nursing, pump, wet, dirty, both, sleep, bath, meds). No custom types and no free-text notes on entries. (Households *can* switch off pump/diapers/sleep/bath/meds tracking and rename the daily med, but can't add types.)
- **Offline indicator is subtle** — a small "· offline" in the header, plus a dimmed dot on queued rows.
- **Undo is one-shot**: only the single most recent add/edit/delete, and only while its toast is up.

## Multi-member / multi-child edges

- **One active timer per household, even with twins.** Starting a second nursing timer replaces the first. The timer stores (and names) which child it's for, but there's still only one.
- **The daily meds nudge is household-level** — one dose tracked, not per child. (Feed reminders *do* have per-child intervals.)
- **Shifts are household-level** ("who has the kids"), not per child. The shift sheet's drafted plan and "Right now" rows read the currently selected child's rhythm; there's no explicit per-child or all-children framing in the sheet.
- **Members removed before 2026-09-04** have no name snapshot in `households.former_members`, so their old entries render without an attribution chip. Not recoverable.
- **Timer stop and `/shifts/plan` have no ownership checks** — any member can stop the household timer; plan replaces only your own active shift. Noted in case it wants tightening.

## Shift-system edges

- **"Until she wakes" and open-ended shifts arm nothing** by design — only a clock-time "until" resolves to a real timestamp and a once-only "shift over" push.
- **Quiet-hours pings are dropped, not deferred** — a "shift over" (or reminder) that lands inside quiet hours never arrives.
- **Push edges**: iOS needs the app installed to the Home Screen before push is offered; notifications deep-link to the app root (no per-kind screen); reminder copy is English-only like the rest of the app.

## Technical debt / release gates

- **Community Apps entry not yet submitted.** [deploy/unraid/ca-template.xml](../deploy/unraid/ca-template.xml) and the runbook in [docs/ca-submission.md](ca-submission.md) are ready, but submission needs the `v1.0.0` tag pushed and the GHCR package flipped public first.
- `artisan serve` (8 workers) as the production server — fine for 2 users; FPM/Octane if scope grows.
- Sanctum token expiry counts from login, not last use — even a daily-use phone re-logs-in every ~90 days (the 401 lands on the login screen cleanly).
- **No admin/first-user tooling**: wiping data is the only way to un-claim an instance (`babylog-reset-data`).
- nginx rate limits key on the proxy's IP (instance-wide behind a reverse proxy/CDN) — acceptable for an appliance, worth revisiting with real-IP forwarding if it ever misfires.
- Frontend has no test suite (the API has 81 feature tests). The class-component + `renderVals()` structure was chosen for design fidelity; if iteration gets heavy, consider extracting screens into components with tests.
- History rewrite note: pre-2026-09-02 commit SHAs changed when the leaked dev key was scrubbed. Old clones must re-clone.
