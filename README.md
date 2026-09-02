# Baby Log

Three taps from pocket to logged. An installable, local-first PWA for two parents sharing one baby log — implemented from the Claude Design comp in [design/Baby Log.dc.html](design/Baby%20Log.dc.html).

## Screens

- **Splash / Auth / Onboarding** — account entry and two-question setup (name + age), partner invite.
- **Now** — since-cards (fed / diaper / slept / bath), today summary, tappable timeline (tap an entry to edit or delete it).
- **History** — 7-day stats, feeds & diapers bar charts, feed-rhythm insight. "Reset demo data" lives at the bottom.
- **Quick-log sheet** — opens pre-stamped with the current time and the predicted next entry (smart prefill: alternates nursing sides, remembers last bottle amount). Fast path is open → + → Save; time nudges cost one tap.
- **Shifts** — accept a handoff (plan drafted from the baby's rhythm), tick the plan off as you log, hand back with a note and an auto-generated shift summary.

## Stack

- **Frontend**: Vite + React 18, no other runtime deps. Design styles carried over 1:1 via a tiny CSS-string→style-object parser ([src/s.js](src/s.js)).
- **API**: Laravel (in [api/](api/)) with SQLite + Sanctum bearer tokens. Households link two parents; an invite by email drops the partner into the same log when they sign up. Endpoints: auth, baby setup, invite, batch entry sync, shift request/accept/plan/handback. `GET /api/state?since=` is the single polling endpoint.
- **Realtime**: Laravel Reverb (WebSockets, Pusher protocol) pushes a lightweight `HouseholdTouched` poke on every write — entries, shifts, invites — over a Sanctum-authorized private `household.{id}` channel. Clients react by pulling `/api/state`, so the sync path is identical for sockets, polls, and reconnects. Writes carry `X-Socket-ID` so you're never poked by your own changes.
- **Local-first sync**: entries write to `localStorage` instantly with an outbox queue, then push in the background. The socket carries updates; a slow poll (60s), plus resync on focus/online/reconnect, is the fallback — 3am logging never waits on a network. Deletes are tombstones so they sync too. A service worker caches the app shell and fonts for offline loads.
- **Shifts are real between two accounts**: request a handoff with a note ("Ask X to take over"), the partner sees the incoming card and accepts, hand back generates a shift report that auto-surfaces on the other phone.
- **Docker**: three services — the PWA (Node build → nginx, which proxies `/api` to the API and `/app` websockets to Reverb), the Laravel API (`php artisan serve` + SQLite volume), and Reverb (`php artisan reverb:start`).

- **Invite-only by default**: sign-up is open for the first account on an instance and for emails with a pending household invite — nobody else (set `BABYLOG_OPEN_REGISTRATION=true` to change). Auth endpoints are throttled; API and Reverb are never published in the Unraid deploy, only the app port.

## Run

```bash
docker compose up -d --build   # app on http://localhost:3500 (API :3501, Reverb :3502 for dev)
```

## Unraid

One command installs (and later updates — data survives in `appdata/baby-log/data`):

```bash
curl -fsSL https://raw.githubusercontent.com/straplocked/baby-log/main/deploy/unraid/babylog.sh | sh
```

Requires the *Docker Compose Manager* plugin from Community Apps. Fresh `APP_KEY`/Reverb secrets are generated into `appdata/baby-log/.env` on first run. Point your reverse proxy (e.g. NPM) at port 3500 with websocket support enabled.

Frontend dev mode (proxies `/api` to the dockerized API on :3501):

```bash
npm install
npm run dev                    # http://localhost:3500
```

Port 3500 was chosen to avoid this machine's occupied 3xxx block (3000/3100/3200/3300/3400-3499).

## Notes

- To try both sides locally, open `http://localhost:3500` and `http://127.0.0.1:3500` — different origins, so each tab holds its own account.
- The API container runs `php artisan migrate --force` on boot; the SQLite file lives in the `babylog-db` volume (`docker compose down -v` wipes it).
- Host PHP on this machine lacks several extensions, so all composer/artisan work runs through containers (`docker run --rm -v "$PWD/api:/app" -w /app composer:2 php artisan …`).
- Original design files (including the `.dc.html` comp and iOS frame) are kept under [design/](design/) for reference.
