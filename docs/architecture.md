# Architecture

Baby Log is three containers behind one nginx, built for exactly two grown-ups sharing one baby's log.

```
                    ┌─────────────────────────────────────────────┐
 phone / browser ──►│  app (nginx)                                │
                    │   • serves the built PWA                    │
                    │   • /api  ──────────► api (Laravel, :8000)  │
                    │   • /app (ws) ──────► reverb (:8080)        │
                    └─────────────────────────────────────────────┘
                                     api ──publishes──► reverb
                                     api ◄──SQLite──  /data volume
```

## Frontend (`src/`)

- **Vite + React 18**, one class component ([src/App.jsx](../src/App.jsx)) holding all state — the app is small enough that a store library would be overhead.
- **Design fidelity**: markup was ported 1:1 from the Claude Design comp in [design/Baby Log.dc.html](../design/Baby%20Log.dc.html). Inline CSS strings from the comp pass through [src/s.js](../src/s.js) (a cached CSS-string → style-object parser) so visual diffs against the comp stay reviewable. Hover states live as utility classes in [src/styles.css](../src/styles.css).
- **PWA**: manifest + service worker ([public/sw.js](../public/sw.js)). The SW caches the app shell and Google Fonts; it **never** caches `/api` or `/app`.

## Local-first sync

The design brief: "Entries write locally first and sync when there's signal, so 3am logging never waits on a network."

- Every entry is `{id, type, t, detail, deleted}` with a **client-generated UUID**, written to `localStorage` (`babylog:v2`) instantly.
- Changed ids go into an **outbox**; a debounced flush POSTs them to `/api/entries` (batch upsert, last-write-wins, server stamps a `rev`).
- Pulls hit `GET /api/state?since=<rev>` — one endpoint returns everything needed to converge (user, partner, baby, duty, shift, changed entries).
- **Deletes are tombstones** (`deleted: true`), so they sync like any other write; all views filter them.
- Merge rule: server wins for any entry **not** currently in the outbox; unpushed local writes win until flushed.

## Realtime (Reverb)

- Every write endpoint fires `HouseholdTouched` — a tiny "something changed" poke on the private channel `household.{id}` (auth: Sanctum bearer at `/api/broadcasting/auth`, channel gate checks `household_id`).
- Clients respond to a poke by pulling `/api/state` — **the sync path is identical for sockets, polls, and reconnects**, so realtime can never introduce a second source of truth.
- Writes send `X-Socket-ID`, and the server broadcasts `toOthers()` — you're never poked by your own write.
- Broadcasts are **best-effort** (`HouseholdTouched::send()` swallows transport errors): a Reverb outage degrades to polling, never fails a write.
- Fallbacks: 60s heartbeat poll, plus resync on window focus, `online`, and socket reconnect.

## Backend (`api/`)

Laravel 13, SQLite, Sanctum bearer tokens.

- **Household model**: `households` owns everything; a user belongs to exactly one household; max 2 users (`config/babylog.php`). The partner is "the other user in my household".
- **Invites**: `invite()` stores the invited email + a hashed single-use 6-char code; the code is shown once to the inviter and required at the partner's registration. See [docs/api.md](api.md#auth) for the full lockdown rules.
- **Duty & shifts**: `households.on_duty_user_id` tracks who has the baby. A `shifts` row moves through `requested → active → completed`:
  - `request` — on-duty parent asks the partner to take over (note attached).
  - `accept` — partner starts their shift with a plan (drafted client-side from the feed rhythm) and an "until"; duty transfers.
  - `plan` — replace the active shift's plan (e.g. "Add to plan").
  - `handback` — shift completes with a note; duty returns; both clients can render the report **from synced entries** (the report is computed, not stored).
- **Prediction is client-side**: smart prefill, feed-gap rhythm, and plan drafting all run in the frontend from the local entry cache — the server stores facts, not guesses.

## Security posture

- Invite-only registration (first account, or invited email + code); `BABYLOG_OPEN_REGISTRATION=true` opts out.
- Throttles: 10/min on register/login, 120/min on authed routes; nginx `limit_req` on `/api` and `limit_conn` on `/app`; Reverb rate limiting + connection cap in production.
- Passwords ≥ 8, hashed (Laravel default); tokens are Sanctum (hashed at rest, no cookies → no CSRF surface).
- Secrets are never in the repo: dev reads a git-ignored `.env`; the Unraid installer generates fresh values on first run.
- TLS terminates at the reverse proxy; Laravel trusts proxies for scheme detection.

## Key decisions (and why)

| Decision | Why |
|---|---|
| Poke-to-pull instead of broadcasting data | One converge path; a missed socket message can never cause divergence |
| Client-generated entry ids | Offline writes merge without coordination; edits/deletes address the same id |
| Tombstone deletes | Deletes must sync across devices like any write |
| Reports computed from entries | No snapshot to drift out of sync; the log is the single source of truth |
| SQLite | Two users per instance; zero ops; the whole DB is one backup-able file |
| `artisan serve` + 8 workers in prod | Adequate for a 2-user appliance; swap for FPM/Octane if this ever becomes multi-tenant |
