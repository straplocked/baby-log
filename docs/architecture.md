# Architecture

mybabynotes is three containers behind one nginx, built for one household sharing its babies' log — up to six grown-ups (parents and caregivers) and up to ten children.

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
- Pulls hit `GET /api/state?since=<rev>` — one endpoint returns everything needed to converge (user, members, children, invites, duty, shift, changed entries, server caps (`limits`), removed-member name snapshots (`formerMembers`) — plus the legacy singular `partner`/`baby`/`invitePending` keys, kept so installed PWAs that predate multi-member keep working).
- Every entry carries a `baby_id`; a client that omits it gets the primary (oldest) child on create, and an update without it never re-homes the entry — old single-child clients stay correct against a multi-child server.
- **Deletes are tombstones** (`deleted: true`), so they sync like any other write; all views filter them.
- Merge rule: server wins for any entry **not** currently in the outbox; unpushed local writes win until flushed.

## Realtime (Reverb)

- Every write endpoint fires `HouseholdTouched` — a tiny "something changed" poke on the private channel `household.{id}` (auth: Sanctum bearer at `/api/broadcasting/auth`, channel gate checks `household_id`).
- Clients respond to a poke by pulling `/api/state` — **the sync path is identical for sockets, polls, and reconnects**, so realtime can never introduce a second source of truth.
- Writes send `X-Socket-ID`, and the server broadcasts `toOthers()` — you're never poked by your own write.
- Broadcasts are **best-effort** (`HouseholdTouched::send()` swallows transport errors): a Reverb outage degrades to polling, never fails a write.
- Fallbacks: 60s heartbeat poll, plus resync on window focus, `online`, and socket reconnect.

## Notifications

Web Push (VAPID), self-hosting-friendly: no FCM/APNs account, just the public
HTTPS origin the app already needs.

- **Keys are zero-config**: a VAPID keypair is generated once into SQLite
  (`vapid_keys`) on first use, so it lives inside the one backup-able file;
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` env vars override it. The public key
  rides `/state`.
- **Subscription is per-device** (`push_subscriptions`, upserted by endpoint);
  **prefs are per-user** (`users.notify_prefs`, edited in History →
  Notifications, synced through `/state` like everything else). Expired
  endpoints self-prune when a push bounces.
- **Event pushes** fire inline from write endpoints, fanned out to every other
  member: shift request / accept / handback (on by default — someone asking you
  to take over should reach a sleeping phone, so these ignore quiet hours), a
  nursing/pump timer starting (on by default but informational, so it honors
  quiet hours), and opt-in member activity ("Katrina logged a bottle",
  throttled to one per 10 min per recipient so backfill bursts don't rattle
  anyone).
- **Reminder pushes** come from `babylog:reminders`, run every minute by a
  `schedule:work` process the api container starts next to `artisan serve`:
  feed gap and wake window per non-archived child (learned cluster-aware rhythm
  or a fixed interval, optionally only while on duty; wake windows use each
  child's birth date; entries with a NULL `baby_id` read as the primary child),
  a daily meds nudge (household-level), and the shift "until" ping (an active
  shift's client-resolved `until_at` passes → the shift holder and the member
  who asked for the cover get one ping each; nothing about duty changes by
  itself). Each fires at most once per triggering feed / nap /
  day / shift — the dedupe lives in `users.notify_state` (and
  `shifts.until_notified_at` for the until ping), so restarts can't
  double-ping.
- **Delivery is best-effort** like the Reverb pokes ([app/Services/PushService.php](../api/app/Services/PushService.php)):
  a dead push service never fails a write or a scheduler tick. Pushes carry
  only `{title, body, tag}` — never entry data; the app still converges
  through normal sync.
- Quiet hours and meds times are evaluated in the user's own IANA timezone,
  stamped from the device whenever prefs are saved.

## Backend (`api/`)

Laravel 13, SQLite, Sanctum bearer tokens.

- **Household model**: `households` owns everything; a user belongs to exactly one household; max 6 users (`babylog.max_household_users`, `BABYLOG_MAX_USERS`) and 10 children (`babylog.max_children`). Every user has a role: **parent** (full control) or **caregiver** (may log entries, run timers, and take/hand back shifts; the household-shaping endpoints — `/baby`, `/children`, `/settings`, `/invite`, `/invite/revoke`, `/household/remove-member` — return 403). The first account on an instance is a parent. The legacy "partner" is now just the first other member (`Household::partnerOf`), kept for old clients and used only as a fallback.
- **Children**: `babies` rows per household, id-ordered; the oldest is the *primary* child (what old clients call "the baby", and where entries without a `baby_id` land). Children are archived, never deleted — a child's log is history worth keeping.
- **Invites**: a real `invites` table — email-bound, hashed single-use 6-char code, per-invite role, multiple concurrent, revocable. The code is shown once to the inviter and required at the invitee's registration; capacity counts members + outstanding invites. See [docs/api.md](api.md#auth) for the full lockdown rules.
- **Duty & shifts**: household-level (not per child): `households.on_duty_user_id` tracks who has the kids. A `shifts` row moves through `requested → active → completed`:
  - `request` — the on-duty member asks the others to take over (note attached; the ask fans out to every other member).
  - `accept` — another member starts their shift with a plan (drafted client-side from the feed rhythm) and an "until"; duty transfers. A requester can't accept their own ask.
  - `plan` — replace the active shift's plan (e.g. "Add to plan").
  - `handback` — shift completes with a note; duty returns to the shift's stored `requester_id` (falling back to the first other member for self-started shifts); clients render the report **from synced entries** (the report is computed, not stored).
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
| SQLite | A handful of users per instance; zero ops; the whole DB is one backup-able file |
| `artisan serve` + 8 workers in prod | Adequate for a ≤6-user appliance; swap for FPM/Octane if this ever becomes multi-tenant |
