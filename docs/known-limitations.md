# Known limitations & candidate roadmap

Honest list of what's missing, stubbed, or deliberately deferred — the starting backlog for post-trial iteration. Nothing here is a bug; they're scope lines we drew.

## Things a user will notice

- **Invites don't send email.** `POST /invite` stores the invite and returns the code — the inviter must text/tell the partner the code themselves. The UI says "Invited …" which can read as "an email was sent". Fix candidates: actually send mail (needs SMTP config), or reword the UI to "share this code".
- **"Forgot password?" is a dead link.** No reset flow exists. With no mailer, a reset would need an out-of-band mechanism (e.g. a reset script on the server, or SMTP first).
- **Partial account/settings screen.** There's now a Settings screen (gear in the History header) holding About/birth date, What-you-track, Notifications, and Log out. Still can't change name, email, password, baby name (after onboarding), or units from it.
- **Units are hardcoded to oz.** `unit`, `timeStep`, and `smartPrefill` exist as component props (from the design comp's config) but aren't exposed anywhere in the UI.
- ~~**Baby "age" is a static label**~~ Fixed 2026-09-02: onboarding asks for a birth date (editable later in History → About), and the header age computes live (weeks → months → years). The old label remains only as a fallback for babies without a DOB.
- **Sleep is logged as a duration after the fact.** No start/stop timer, no "currently asleep" state on the home screen.
- **Timeline shows the last 12 entries; History is a fixed 7-day window.** No day-by-day drill-down, no month view, no data export.
- **Entry types are fixed** (bottle, nursing, pump, wet, dirty, both, sleep, bath, meds). Meds is hardcoded to "vitamin D" in the subtitle. No custom types or notes on entries. (Households *can* now switch off pump/diapers/sleep/bath/meds tracking in History, but can't add types.)
- **Offline indicator is subtle** (a small "· offline" in the header). Queued-but-unsynced entries aren't visually marked.
- **Toast/undo only covers the last added entry**; edits and deletes have no undo.

## Shift-system edges

- The **incoming-request card** shows the *predicted* plan chips (computed from rhythm), while the accept sheet lets you toggle items — subtle mismatch if you toggle before accepting.
- **"Until" is decorative** — "Until 6 AM" doesn't trigger anything at 6 AM.
- ~~**No notifications**~~ Fixed 2026-09-02: Web Push with per-parent prefs (History → Notifications) — handoff asks/handbacks, opt-in partner activity, feed-gap/wake-window/daily-meds reminders, quiet hours. Remaining edges: iOS needs the app installed to the Home Screen before push is offered; notifications deep-link to the app root (no per-kind screen); reminder copy is English-only like the rest of the app.
- Plan items added mid-shift sync, but the partner has no read-only view of the active shift's progress.

## Technical debt / release gates

- **Updater tracks `main` unpinned** (user chose this for the testing phase). Before public release: tag versions, default `BABYLOG_REF` to the latest tag, publish tarball checksums.
- **Community Apps template** not yet written; GHCR images already build on every push. The template should consume images (no on-box builds) — likely needs a compose-based CA entry or an "all-in-one" image variant.
- `artisan serve` (8 workers) as the production server — fine for 2 users; FPM/Octane if scope grows.
- **Sanctum tokens never expire**; each login adds a row. Add expiry + pruning eventually.
- **No admin/first-user tooling**: wiping data is the only way to un-claim an instance (`babylog-reset-data`).
- nginx rate limits key on the proxy's IP (instance-wide behind NPM/Cloudflare) — acceptable for an appliance, worth revisiting with real-IP forwarding if it ever misfires.
- Frontend has no test suite (the API has 12 feature tests). The class-component + `renderVals()` structure was chosen for design fidelity; if iteration gets heavy, consider extracting screens into components with tests.
- History rewrite note: pre-2026-09-02 commit SHAs changed when the leaked dev key was scrubbed. Old clones must re-clone.
