# Baby Log 🐤

**Your baby's data on your own server.** Baby Log is a self-hosted baby tracker built for exactly two parents sharing one baby's log — true realtime sync between both phones, offline logging that works at 3am with no signal, shift handoffs as a first-class flow, and CSV export of everything. One container, one SQLite file, no cloud account, no telemetry, no subscription rug-pulls.

<!-- screenshots:start -->
<p align="center">
  <img src="docs/media/now.png" alt="Now screen — since-cards, today's timeline, and the on-duty chip" width="30%">
  <img src="docs/media/history.png" alt="History screen — 7-day stats tiles and per-day charts" width="30%">
  <img src="docs/media/settings.png" alt="Settings screen — baby profile, appearance, and household options" width="30%">
</p>
<!-- screenshots:end -->

## What it does

- **Three taps from pocket to logged.** The entry sheet opens pre-stamped with the current time and a prediction of what you're about to log (alternating nursing sides, last bottle amount, feed-vs-diaper rhythm). Overriding the guess costs one tap; backfilling costs one nudge (−5/−15/−1h).
- **Both of you, one log — live.** The second parent joins by invite and sees the same log in realtime over websockets. Entries write locally first and sync when there's signal, so 3am logging never waits on the network; queued entries are marked until they flush.
- **Shifts, not just a log.** "I need to sleep, take him" is a first-class flow: request a handoff with a note, the partner accepts with an auto-drafted plan from the baby's rhythm and an "until" time, logged feeds tick the plan off, the off-duty parent watches progress on a read-only shift card, a push pings both of you when the "until" passes, and handing back generates a shift summary instead of a "when did you…" conversation.
- **Live timers, shared across phones.** Nursing, pumping, and sleep run as server-backed start/stop timers visible on both devices; stopping auto-logs the entry (pumping captures the amount at stop, sleep stamps the nap at wake-up).
- **Now & History.** Since-cards (fed/diaper/slept/bath), today's totals, an editable timeline with one-shot undo (add, edit, or delete), 7-day stats and charts with tap-through day-by-day drill-down, a feeds-rhythm insight, and a live age header from the baby's birth date.
- **Notifications without a cloud.** Self-hosted Web Push (VAPID keys generate themselves — no FCM/APNs account): handoff requests and handbacks, opt-in partner activity, feed-gap and wake-window reminders, a daily meds nudge, and quiet hours — all per-parent.
- **Your data, portable.** Export the full log or per-day summaries as CSV through the native share sheet ("Share with your pediatrician"); switching from Baby Buddy? Settings imports its CSV exports, idempotently.
- **Made yours.** Household oz/ml units, a nameable daily med, toggleable entry types (pump, diapers, sleep, bath, meds), account settings (name, email, password, baby's name), and per-device dark mode that can ignore the OS schedule for that 3am feed.
- **Invite-only by design.** The first account claims the instance and invites the second parent (emailed code with SMTP, shareable on-screen code without). Password reset works the same way. Max two adults per household — that's the point.

## Honest comparison: Baby Buddy

[Baby Buddy](https://github.com/babybuddy/babybuddy) is the established self-hosted baby tracker, and if you need breadth it's the mature choice. Baby Log exists because of two gaps its own tracker has carried for years: no offline/PWA support and no realtime sync between caregivers' phones.

| | Baby Log | Baby Buddy |
|---|---|---|
| Offline logging | Local-first PWA — entries queue and sync later | Needs a connection |
| Realtime partner sync | Live over websockets, both phones converge instantly | Refresh to see the other phone's entries |
| Shift handoffs | First-class: request → plan → handback summary | — |
| Household model | Exactly 2 parents, 1 baby | Many caregivers, multiple children |
| Tracking breadth | 9 focused entry types | Broader: tummy time, growth + WHO percentiles, notes, more |
| Integrations | CSV export; imports Baby Buddy CSV | REST API, Home Assistant, companion mobile apps |
| Languages | English only (so far) | 9 years of i18n, many languages |
| License | AGPL-3.0 | BSD-2-Clause |

If you want multi-child support, growth charts, Home Assistant, or a non-English UI, run Baby Buddy — it's good software with nearly a decade of work behind it. Baby Log optimizes for a narrower job: two exhausted adults logging offline at 3am, seeing each other's entries instantly, and handing the baby off without a status interview. If that's your job, and you're switching, Settings → Import will read the CSV files Baby Buddy exports.

## Install

### 1. Unraid (Community Apps)

Baby Log ships an all-in-one image (`ghcr.io/straplocked/baby-log-aio`) — one container serving the app, API, and websockets on a single port, with all state (SQLite + self-generated secrets) in one `/data` share. The CA template is [deploy/unraid/ca-template.xml](deploy/unraid/ca-template.xml); the **CA listing is pending submission**, so until it appears in the store you can install it manually: copy the template to `/boot/config/plugins/dockerMan/templates-user/` on your flash share, then Docker tab → Add Container → pick it from the Template dropdown.

First boot generates every secret into `/data/.env` — nothing to configure on the LAN. Back up the one appdata folder and you've backed up the app. Pin a version by changing the repository tag from `:latest` to `:v1.0.0`.

### 2. Unraid (script install)

For a compose-based install (separate app/api/reverb containers), one command installs *and* updates — requires the *Docker Compose Manager* plugin:

```bash
curl -fsSL https://raw.githubusercontent.com/straplocked/baby-log/main/deploy/unraid/babylog.sh | sh
```

The script resolves the latest tagged release, verifies its tarball against the published `checksums.txt`, and rebuilds; data survives in `appdata/baby-log/data`. Pin or roll back with `BABYLOG_REF`:

```bash
curl -fsSL https://raw.githubusercontent.com/straplocked/baby-log/main/deploy/unraid/babylog.sh | BABYLOG_REF=v1.0.0 sh
```

### 3. Docker Compose (any server)

```bash
git clone https://github.com/straplocked/baby-log && cd baby-log
cp .env.example .env    # fill in APP_KEY + REVERB_APP_SECRET (generation commands in the file)
docker compose up -d --build    # http://localhost:3500
```

### 4. Local development

Same as above — the root compose file is the full stack. The API test suite runs in a container (no host PHP needed):

```bash
docker run --rm -v "$PWD/api:/app" -w /app -e BROADCAST_CONNECTION=log composer:2 php artisan test
```

**Remote access (all installs):** on the LAN, plain HTTP works. For phones outside the LAN — and for the PWA install prompt and push notifications, which require HTTPS — put a reverse proxy with **websocket support** in front (Nginx Proxy Manager, SWAG, Caddy; enable websockets for the `/app` path) and set `APP_URL` to your public origin (e.g. `https://babylog.example.com`). Email (invite codes, password reset) is optional: configure SMTP via `MAIL_*` variables, or skip it and share invite codes from the screen.

## Stack

React 18 + Vite PWA · Laravel 13 API (SQLite, Sanctum) · Laravel Reverb websockets · nginx · Docker. Invite-only registration, throttled auth, client-generated entry ids with tombstone-synced deletes, poke-to-pull realtime (the server broadcasts "something changed", never data), computed shift reports, expiring tokens. Details: [docs/architecture.md](docs/architecture.md).

Releases are tagged: a `v*` tag runs the test suite, publishes `ghcr.io/straplocked/baby-log-app`, `baby-log-api`, and `baby-log-aio` images (`:vX.Y.Z` + `:latest`), and attaches a checksummed source tarball to the GitHub Release.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, sync model, realtime, notifications, shift semantics, key decisions |
| [docs/api.md](docs/api.md) | Every endpoint with payloads, rules, and error behavior |
| [docs/operations.md](docs/operations.md) | Unraid runbook: update, reset, backups, reverse proxy, local dev, troubleshooting |
| [docs/ca-submission.md](docs/ca-submission.md) | Community Apps submission checklist + support-thread draft |
| [docs/known-limitations.md](docs/known-limitations.md) | Honest gaps + candidate roadmap |
| [docs/feeding-patterns.md](docs/feeding-patterns.md) | Sourced age-typical feeding/sleep norms behind the app's insights (not medical advice) |
| [TESTING.md](TESTING.md) | Trial-period journal — the feedback that drives iteration |
| [CLAUDE.md](CLAUDE.md) | Conventions for AI-assisted development sessions |

## License

Baby Log's code is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). Copyright © 2026 Chris Carvache.

You can self-host it, modify it, and redistribute it under the AGPL's terms. The **Baby Log name** and any **hosted Baby Log service** are not covered by the code license — if you distribute a modified version or run a public instance, please make clear it's your build, not the official project.
