# Baby Log 🐤

Three taps from pocket to logged. An installable, local-first PWA for two parents sharing one baby's log — with real-time sync, shift handoffs, and an invite-only household model. Implemented from the Claude Design comp in [design/Baby Log.dc.html](design/Baby%20Log.dc.html).

## What it does

- **Log in three taps** — the sheet opens pre-stamped with the current time and the *predicted* next entry (alternating nursing sides, last bottle amount, feed-vs-diaper rhythm). Overriding the guess costs one tap; backfilling costs one nudge (−5/−15/−1h).
- **Both of you, one log** — a partner joins by invite (email + single-use code) and sees the same log live over websockets. Entries write locally first and sync when there's signal, so 3am logging never waits on a network.
- **Shifts, not just a log** — "I need to sleep, take him" is a first-class flow: request a handoff with a note, the partner accepts with an auto-drafted plan from the baby's rhythm, logged feeds tick the plan off, and handing back generates a shift summary instead of a "when did you…" conversation.
- **Now & History** — since-cards (fed/diaper/slept/bath), today's totals, an editable timeline, 7-day stats and charts, and a feeds-rhythm insight.

## Stack

React 18 + Vite PWA · Laravel 13 API (SQLite, Sanctum) · Laravel Reverb websockets · nginx · Docker Compose. Invite-only registration, throttled auth, tombstone-synced deletes, poke-to-pull realtime. Details: [docs/architecture.md](docs/architecture.md).

## Documentation

| Doc | What's in it |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, sync model, realtime, shift semantics, key decisions |
| [docs/api.md](docs/api.md) | Every endpoint with payloads, rules, and error behavior |
| [docs/operations.md](docs/operations.md) | Unraid runbook: update, reset, backups, NPM, local dev, troubleshooting |
| [docs/known-limitations.md](docs/known-limitations.md) | Honest gaps + candidate roadmap |
| [TESTING.md](TESTING.md) | Trial-period journal — the feedback that drives iteration |
| [CLAUDE.md](CLAUDE.md) | Conventions for AI-assisted development sessions |

## Run it

**Local (full stack):**
```bash
cp .env.example .env    # fill in APP_KEY + REVERB_APP_SECRET (commands in the file)
docker compose up -d --build    # http://localhost:3500
```

**Unraid (install & update are the same command):**
```bash
curl -fsSL https://raw.githubusercontent.com/straplocked/baby-log/main/deploy/unraid/babylog.sh | sh
```
Requires the *Docker Compose Manager* plugin. Data survives updates in `appdata/baby-log/data`; secrets are generated on first run. Put a reverse proxy with websocket support in front for remote access. Full runbook: [docs/operations.md](docs/operations.md).

**Tests:**
```bash
docker run --rm -v "$PWD/api:/app" -w /app -e BROADCAST_CONNECTION=log composer:2 php artisan test
```

CI runs the suite on every push and publishes `ghcr.io/straplocked/baby-log-app` + `baby-log-api` images when green.

## Status

Deployed and in daily-use trial. Iteration backlog builds in [TESTING.md](TESTING.md); Unraid Community Apps release planned afterwards (tagged versions, pinned installer, CA template).
