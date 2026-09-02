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
  "user":    { "id": 1, "name": "Ben", "householdId": 1 },
  "partner": { "id": 2, "name": "Katrina" },        // or null
  "invitePending": "katrina@example.com",            // or null
  "baby":    { "name": "Wren", "age": "2–8 wks" },  // or null
  "onDutyUserId": 1,
  "settings": { "tracking": {"diapers": false}, "dismissed": ["meds"] },  // or null
  "shift":   { "id": 3, "state": "requested|active|completed", "requester_id": 1,
               "user_id": 2, "note": "…", "plan": [{"id":"p1","type":"bottle","at":1750000000000}],
               "until": "Until 6 AM", "requested_at": 0, "started_at": 0, "ended_at": 0,
               "handback_note": "…" },               // latest row, or null
  "entries": [ { "id": "uuid", "user_id": 1, "type": "bottle", "t": 1750000000000,
                 "detail": "4", "deleted": false, "rev": 1750000000123 } ],
  "serverTime": 1750000000456
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
`{ name (≤100), age (≤40, nullable) }` — upserts the household's baby.

### `POST /invite`
`{ email }` → `{ ok, code }`. Stores the lowercased email + hashed code on the household; **the plaintext code is returned only here** — the inviter must share it out-of-band (no email is sent). Household already has 2 users → 422. Re-inviting overwrites the pending invite/code.

### `POST /settings`
```json
{ "tracking": { "diapers": false }, "dismissed": ["meds"] }
```
Household-level preferences, shared by both parents; last write wins. `tracking` maps a tracker key to on/off — keys outside `pump diapers sleep bath meds` are silently dropped (feeds can't be turned off). `dismissed` lists trackers whose "turn this off?" nudge was declined. Each provided top-level key replaces the stored one wholesale. Returns `{ ok, settings }`, broadcasts a poke.

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
