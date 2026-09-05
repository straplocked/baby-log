# Known limitations & candidate roadmap

Honest list of what's missing, stubbed, or deliberately deferred — the starting backlog for post-trial iteration. Nothing here is a bug; they're scope lines we drew. (Items fixed during the 2026-09-02→04 batches have been removed; `git log docs/known-limitations.md` has the history.)

## Things a user will notice

- **Anything email needs SMTP.** Invites and password reset both work only with SMTP configured (see operations.md "Enabling email"); without it the inviter shares the on-screen code by hand, and a forgotten password takes the admin running `babylog:reset-password` (operations.md "Admin commands").
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
- **Timer stop has no ownership check at the API layer** — the client only lets the member who started a timer stop it, but the endpoint itself would accept anyone's stop. Not reachable from the UI; noted in case it wants tightening server-side. (`/shifts/plan` is fine — it only ever touches the caller's own active shift.)

## Shift-system edges

- **"Until she wakes" and open-ended shifts arm nothing** by design — only a clock-time "until" resolves to a real timestamp and a once-only "shift over" push.
- **Quiet-hours pings are dropped, not deferred** — a "shift over" (or reminder) that lands inside quiet hours never arrives.
- **Push edges**: iOS needs the app installed to the Home Screen before push is offered; notifications deep-link to the app root (no per-kind screen); reminder copy is English-only like the rest of the app.

## Technical debt / release gates

- **Community Apps entry not yet submitted.** [deploy/unraid/ca-template.xml](../deploy/unraid/ca-template.xml) and the runbook in [docs/ca-submission.md](ca-submission.md) are ready, but submission needs the `v1.0.0` tag pushed and the GHCR package flipped public first.
- Rate limits key on the direct peer unless `TRUSTED_PROXIES` is set (operations.md "Remote access") — an unconfigured reverse-proxy setup gets instance-wide caps, which is safe but coarse.
- Frontend tests (`npm test`, Vitest) cover the support modules and the app-shell flows — auth, boot-from-cache, offline, outbox flush — but not the deep UI (log sheet, history drill-down, shift sheet, settings). The class-component + `renderVals()` structure was chosen for design fidelity; extracting screens into components would make the rest testable.
- History rewrite note: pre-2026-09-02 commit SHAs changed when the leaked dev key was scrubbed. Old clones must re-clone.
