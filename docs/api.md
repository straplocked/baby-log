# API Reference

Base path `/api`. JSON in/out (`Accept: application/json`). Authenticated routes take `Authorization: Bearer <token>` (Sanctum). Validation failures return `422` with `{message, errors}`; throttling returns `429`; missing/бad auth returns `401`.

## Auth

### `POST /register` — throttle 10/min
```json
{ "name": "Ben", "email": "ben@example.com", "password": "…", "invite": "AB2C3D" }
```
Lockdown rules, in order:
1. Email already used → 422.
2. Email matches a pending row in the `invites` table → the `invite` code is **required** and must match (hashed comparison); wrong/missing code → 422. Household already full (`babylog.max_household_users`, default 6 via `BABYLOG_MAX_USERS`) → 422. On success the invite row is deleted (single-use) and the new user gets **the invite's role** (`parent` or `caregiver`).
3. No invite match: allowed only if this is the **first account** on the instance, or `BABYLOG_OPEN_REGISTRATION=true`; otherwise 422 "invite-only". These accounts are always parents.

Returns `201 { "token": "…", "joinedPartner": bool }`. The first user of a household starts on duty. Emails are lowercased. Password min 8, `invite` optional ≤20 chars (non-alphanumerics stripped, uppercased).

**Roles**: a `parent` has full control; a `caregiver` may log entries, run timers, and request/accept/hand back shifts, but the household-shaping endpoints (`/baby`, `/children`, `/settings`, `/invite`, `/invite/revoke`, `/household/remove-member`) return **403**.

### `POST /login` — throttle 10/min
`{ email, password }` → `200 { token }`. Wrong credentials → 422 with a deliberately vague message.

### `POST /logout` (auth)
Revokes the current token.

## Sync — all auth + throttle 120/min

### `GET /state?since=<rev>`
The single polling/converge endpoint.
```json
{
  "user":    { "id": 1, "name": "Ben", "email": "ben@example.com", "role": "parent", "householdId": 1,
               "notifyPrefs": { "handoff": true, "partner": false, "feed": false, "feedEvery": null,
                                "onDutyOnly": true, "wake": false, "meds": false, "medsTime": "09:00",
                                "quiet": false, "quietStart": "22:00", "quietEnd": "07:00", "tz": null } },
  "members": [ { "id": 1, "name": "Ben", "role": "parent" },
               { "id": 2, "name": "Katrina", "role": "parent" },
               { "id": 3, "name": "Robin", "role": "caregiver" } ],   // id-ordered, includes the caller
  "children": [ { "id": 10, "name": "Wren", "age": "2–8 wks", "birthdate": "2026-07-20",
                  "archived": false } ],              // id-ordered; the first is the primary child
  "invites": [ { "email": "granny@example.com", "role": "caregiver" } ],  // pending, id-ordered
  "partner": { "id": 2, "name": "Katrina" },        // LEGACY: first other member, or null
  "invitePending": "granny@example.com",             // LEGACY: first pending invite's email, or null
  "baby":    { "name": "Wren", "age": "2–8 wks", "birthdate": "2026-07-20" },  // LEGACY: the primary child, or null
  "onDutyUserId": 1,
  "settings": { "tracking": {"diapers": false}, "dismissed": ["meds"] },  // or null
  "shift":   { "id": 3, "state": "requested|active|completed", "requester_id": 1,
               "user_id": 2, "note": "…", "plan": [{"id":"p1","type":"bottle","at":1750000000000}],
               "until": "Until 6 AM", "requested_at": 0, "started_at": 0, "ended_at": 0,
               "handback_note": "…" },               // latest row, or null
  "timer":   { "id": "uuid", "type": "nurse", "started_at": 0, "user_id": 1,
               "baby_id": 10 },                      // running timer, or null; baby_id null ⇒ primary child
  "entries": [ { "id": "uuid", "user_id": 1, "baby_id": 10, "type": "bottle", "t": 1750000000000,
                 "detail": "4", "deleted": false, "rev": 1750000000123 } ],
  "serverTime": 1750000000456,
  "vapidPublicKey": "BM…"                            // Web Push application server key
}
```
`entries` contains only rows with `rev > since` (≤ 2000, ordered by rev). Clients store `serverTime` as the next `since`. The three `LEGACY` singular keys are kept for installed PWAs that predate multi-member households and will not be removed casually.

### `POST /entries`
Batch upsert from the client outbox (≤ 500 per call).
```json
{ "entries": [ { "id": "uuid", "type": "bottle", "t": 1750000000000, "detail": "4", "deleted": false, "baby_id": 10 } ] }
```
- `type` ≤ 20 chars — one of `bottle nurse pump wet dirty both sleep bath meds` (client-defined; server stores any short string).
- `detail` nullable string ≤ 100 (amount for bottle/pump, side for nurse, minutes for sleep).
- `baby_id` optional — must be one of the household's children; a foreign id is **dropped, never stored**. Absent (old single-child clients): a **create** lands on the primary (oldest) child, an **update** keeps the entry's stored `baby_id` — an old client editing an amount can't re-home the entry.
- Ids colliding with **another household's** entry are silently skipped; within the household, last write wins and the original author's `user_id` is preserved.
- Returns `{ ok, serverTime }`, broadcasts a poke.

### `POST /baby` — parents only (403 for caregivers)
`{ name (≤100), age (≤40, nullable), birthdate (Y-m-d, nullable, not future, after 2015) }` — legacy endpoint: upserts the household's **primary child** (creating it if the household has none). `age`/`birthdate` are only written when the key is present, so a client that doesn't know the DOB can't erase it. `age` is the legacy onboarding label, kept as a fallback for babies without a `birthdate`.

### `POST /children` — parents only
`{ id?, name (≤100), age?, birthdate?, archived? }` — create (no `id`; 422 at the cap of `babylog.max_children`, default 10) or update (`id` must belong to the household, else 422 without a write) one child. Same key-presence rule as `/baby`. There is **no delete** — retiring a child only sets `archived: true` (its log is history worth keeping). Returns `{ ok, child }`, broadcasts a poke.

### `POST /invite` — parents only
`{ email, role?: "parent"|"caregiver" (default parent) }` → `{ ok, code, mailed }`. Inserts a row in the `invites` table (lowercased email, hashed single-use code, role); **the plaintext code is returned only here** — with SMTP configured it is also emailed (`mailed: true`). Capacity counts members **plus outstanding invites** against `babylog.max_household_users` (default 6) → 422 when full. Re-inviting the same email replaces its row (fresh code, updated role) and doesn't take a second seat; multiple concurrent invites to different emails are fine.

### `POST /invite/revoke` — parents only
`{ email }` — deletes the pending invite; its code stops opening doors immediately. Returns `{ ok }`, broadcasts a poke.

### `POST /household/remove-member` — parents only
`{ user_id }` — removes a member (a departing caregiver, usually). Their tokens and push subscriptions are deleted (every session 401s), duty falls back to the caller if the target held it, their requested/active shifts are cancelled — but their entries keep their `user_id` so history still says who did what. Removing yourself → 422. Returns `{ ok }`, broadcasts a poke.

### `POST /settings` — parents only
```json
{ "tracking": { "diapers": false }, "dismissed": ["meds"] }
```
Household-level preferences, shared by every member; last write wins. `tracking` maps a tracker key to on/off — keys outside `pump diapers sleep bath meds` are silently dropped (feeds can't be turned off). `dismissed` lists trackers whose "turn this off?" nudge was declined. `widgets` is the ordered list of "since last …" cards shown on the Now screen (from `feeds pump diapers sleep bath meds`; unknowns/duplicates dropped, client order kept; omitted/empty ⇒ the client's default set). `unit` is the display unit for bottle/pump amounts (`oz` or `ml`, default `oz`) — display only: entry `detail` amounts are always stored and synced in oz. Each provided top-level key replaces the stored one wholesale. Returns `{ ok, settings }`, broadcasts a poke.

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

**What gets sent** (see [architecture.md](architecture.md#notifications)): handoff request/accept/handback pushes fire inline from the shift endpoints (respecting the recipient's `handoff` pref, ignoring quiet hours); member-activity pushes fire from `POST /entries` to every other member (opt-in, throttled to one per 10 min per recipient); feed-gap and wake-window reminders (per non-archived child) and the daily-meds nudge are sent by `babylog:reminders`, scheduled every minute.

## Timers — all auth + throttle 120/min

The live nursing/pump/sleep timer. **One per household** (even with multiple children), synced via `/state` (`timer`: `{id, type, started_at, user_id, baby_id}` or null). Only the running state lives server-side; the resulting entry is written client-side through `/entries` on stop.

### `POST /timer/start`
`{ type: nurse|pump|sleep, baby_id? }` → sets (or replaces) the household's `active_timer`, broadcasts a poke, and pushes every other member whose `timer` pref is on (honoring quiet hours) "{name} started nursing/pumping". `baby_id` must be one of the household's children — a foreign id is dropped (stored as null, which clients read as the primary child). Returns `{ ok, timer }`.

### `POST /timer/stop`
Clears `active_timer`, broadcasts a poke. Returns `{ ok }`. The client logs the nurse/pump entry (with the measured duration) separately.

## Shifts — all auth + throttle 120/min

Shifts are household-level (who has the kids), not per child. Any member — parent or caregiver — can take part.

### `POST /shifts/request`
`{ note? }` — the on-duty member asks the rest of the household to take over; the push fans out to every other member. Asking again while a request is pending **refreshes it and re-pings** (a deliberate nudge, not a no-op).

### `POST /shifts/accept`
`{ plan?: [{id,type,at}] (≤20), until?, until_at? }` — accepts the pending request (or starts a shift outright). Accepting **your own** request → 422, the ask stays open. Sets duty to caller, `state=active`, returns the shift; the requester is pushed "you're covered", everyone else "…is on duty now". `at` is `numeric` and coerced to integer ms — the client derives it from an averaged feed gap, and a fractional value must never reject the whole handoff.

### `POST /shifts/plan`
`{ plan: [...] }` — replaces the plan on the caller's active shift (no-op if none). Same `numeric` → int coercion on `at`.

### `POST /shifts/handback`
`{ note? }` — completes the caller's active shift, stores `handback_note`, and returns duty to **the shift's stored `requester_id`** (a self-started shift, or one whose requester was removed, falls back to the first other member, then to the caller). Cancels any still-pending request. Returns the shift. Clients render the report from synced entries between `started_at`/`ended_at`.

## Websockets

### `POST /api/broadcasting/auth` (auth)
Standard Pusher-protocol channel auth for `private-household.{id}` — authorized when the token's user belongs to household `{id}`.

### `GET /app/{key}` (websocket, via nginx → Reverb)
Pusher protocol. Clients listen for `HouseholdTouched` (`{kind: entries|baby|children|invite|members|settings|shift|timer|partner|account|notify}`) and respond by pulling `/state`. Send `X-Socket-ID` on writes to avoid being poked by your own changes.
