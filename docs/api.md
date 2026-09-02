# API Reference

Base path `/api`. JSON in/out (`Accept: application/json`). Authenticated routes take `Authorization: Bearer <token>` (Sanctum). Validation failures return `422` with `{message, errors}`; throttling returns `429`; missing/бad auth returns `401`.

## Auth

### `POST /register` — throttle 10/min
```json
{ "name": "Ben", "email": "ben@example.com", "password": "…", "invite": "AB2C3D" }
```
Lockdown rules, in order:
1. Email already used → 422.
2. Email matches a pending household invite → the `invite` code is **required** and must match (hashed comparison); wrong/missing code → 422. Household already full → 422.
3. No invite match: allowed only if this is the **first account** on the instance, or `BABYLOG_OPEN_REGISTRATION=true`; otherwise 422 "invite-only".

Returns `201 { "token": "…", "joinedPartner": bool }`. The first user of a household starts on duty. Emails are lowercased. Password min 8, `invite` optional ≤20 chars (non-alphanumerics stripped, uppercased).

### `POST /login` — throttle 10/min
`{ email, password }` → `200 { token }`. Wrong credentials → 422 with a deliberately vague message.

### `POST /logout` (auth)
Revokes the current token.

## Sync — all auth + throttle 120/min

### `GET /state?since=<rev>`
The single polling/converge endpoint.
```json
{
  "user":    { "id": 1, "name": "Ben", "householdId": 1,
               "notifyPrefs": { "handoff": true, "partner": false, "feed": false, "feedEvery": null,
                                "onDutyOnly": true, "wake": false, "meds": false, "medsTime": "09:00",
                                "quiet": false, "quietStart": "22:00", "quietEnd": "07:00", "tz": null } },
  "partner": { "id": 2, "name": "Katrina" },        // or null
  "invitePending": "katrina@example.com",            // or null
  "baby":    { "name": "Wren", "age": "2–8 wks", "birthdate": "2026-07-20" },  // or null; birthdate null until set
  "onDutyUserId": 1,
  "settings": { "tracking": {"diapers": false}, "dismissed": ["meds"] },  // or null
  "shift":   { "id": 3, "state": "requested|active|completed", "requester_id": 1,
               "user_id": 2, "note": "…", "plan": [{"id":"p1","type":"bottle","at":1750000000000}],
               "until": "Until 6 AM", "requested_at": 0, "started_at": 0, "ended_at": 0,
               "handback_note": "…" },               // latest row, or null
  "entries": [ { "id": "uuid", "user_id": 1, "type": "bottle", "t": 1750000000000,
                 "detail": "4", "deleted": false, "rev": 1750000000123 } ],
  "serverTime": 1750000000456,
  "vapidPublicKey": "BM…"                            // Web Push application server key
}
```
`entries` contains only rows with `rev > since` (≤ 2000, ordered by rev). Clients store `serverTime` as the next `since`.

### `POST /entries`
Batch upsert from the client outbox (≤ 500 per call).
```json
{ "entries": [ { "id": "uuid", "type": "bottle", "t": 1750000000000, "detail": "4", "deleted": false } ] }
```
- `type` ≤ 20 chars — one of `bottle nurse pump wet dirty both sleep bath meds` (client-defined; server stores any short string).
- `detail` nullable string ≤ 100 (amount for bottle/pump, side for nurse, minutes for sleep).
- Ids colliding with **another household's** entry are silently skipped; within the household, last write wins and the original author's `user_id` is preserved.
- Returns `{ ok, serverTime }`, broadcasts a poke.

### `POST /baby`
`{ name (≤100), age (≤40, nullable), birthdate (Y-m-d, nullable, not future, after 2015) }` — upserts the household's baby. `age`/`birthdate` are only written when the key is present, so a client that doesn't know the DOB can't erase it. `age` is the legacy onboarding label, kept as a fallback for babies without a `birthdate`.

### `POST /invite`
`{ email }` → `{ ok, code }`. Stores the lowercased email + hashed code on the household; **the plaintext code is returned only here** — the inviter must share it out-of-band (no email is sent). Household already has 2 users → 422. Re-inviting overwrites the pending invite/code.

### `POST /settings`
```json
{ "tracking": { "diapers": false }, "dismissed": ["meds"] }
```
Household-level preferences, shared by both parents; last write wins. `tracking` maps a tracker key to on/off — keys outside `pump diapers sleep bath meds` are silently dropped (feeds can't be turned off). `dismissed` lists trackers whose "turn this off?" nudge was declined. `widgets` is the ordered list of "since last …" cards shown on the Now screen (from `feeds pump diapers sleep bath meds`; unknowns/duplicates dropped, client order kept; omitted/empty ⇒ the client's default set). Each provided top-level key replaces the stored one wholesale. Returns `{ ok, settings }`, broadcasts a poke.

## Push notifications — all auth + throttle 120/min

### `POST /push/subscribe`
```json
{ "endpoint": "https://fcm.googleapis.com/…", "keys": { "p256dh": "…", "auth": "…" }, "tz": "America/New_York" }
```
Registers this device for Web Push. Upserts by `endpoint` — re-subscribing (or the partner logging in on the same phone) moves the device to the current user. Device-scoped, so no `HouseholdTouched` poke. `tz` is an IANA zone (`timezone:all` validated).

### `POST /push/unsubscribe`
`{ endpoint }` — removes the caller's row for that endpoint (other users' rows are untouched). Expired endpoints also self-prune when a push bounces 404/410.

### `POST /notify-prefs`
Any subset of the `notifyPrefs` keys shown in `/state`; provided keys merge over stored ones. `feedEvery` ∈ `null|120|150|180|210|240` (minutes; null = learned household rhythm), times are `HH:MM`. Per-user (each parent has their own), rides `/state`, pokes so the caller's other devices converge. Returns `{ ok, prefs }`.

**What gets sent** (see [architecture.md](architecture.md#notifications)): handoff request/accept/handback pushes fire inline from the shift endpoints (respecting the recipient's `handoff` pref, ignoring quiet hours); partner-activity pushes fire from `POST /entries` (opt-in, throttled to one per 10 min); feed-gap, wake-window, and daily-meds reminders are sent by `babylog:reminders`, scheduled every minute.

## Timers — all auth + throttle 120/min

The live nursing/pump timer. One per household, synced via `/state` (`timer`: `{id, type, started_at, user_id}` or null). Only the running state lives server-side; the resulting entry is written client-side through `/entries` on stop.

### `POST /timer/start`
`{ type: nurse|pump }` → sets (or replaces) the household's `active_timer`, broadcasts a poke, and — if the partner's `timer` pref is on and they're not in quiet hours — pushes them "{name} started nursing/pumping". Returns `{ ok, timer }`.

### `POST /timer/stop`
Clears `active_timer`, broadcasts a poke. Returns `{ ok }`. The client logs the nurse/pump entry (with the measured duration) separately.

## Shifts — all auth + throttle 120/min

### `POST /shifts/request`
`{ note? }` — on-duty parent asks the partner to take over. No-op if a request is already pending.

### `POST /shifts/accept`
`{ plan?: [{id,type,at}] (≤20), until? }` — accepts the pending request (or starts a shift outright). Sets duty to caller, `state=active`, returns the shift.

### `POST /shifts/plan`
`{ plan: [...] }` — replaces the plan on the caller's active shift (no-op if none).

### `POST /shifts/handback`
`{ note? }` — completes the caller's active shift, stores `handback_note`, transfers duty to the partner. Returns the shift. Clients render the report from synced entries between `started_at`/`ended_at`.

## Websockets

### `POST /api/broadcasting/auth` (auth)
Standard Pusher-protocol channel auth for `private-household.{id}` — authorized when the token's user belongs to household `{id}`.

### `GET /app/{key}` (websocket, via nginx → Reverb)
Pusher protocol. Clients listen for `HouseholdTouched` (`{kind: entries|baby|invite|shift|partner}`) and respond by pulling `/state`. Send `X-Socket-ID` on writes to avoid being poked by your own changes.
