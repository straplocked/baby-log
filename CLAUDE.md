# Baby Log — project conventions

Two-parent baby-tracking PWA (React) + Laravel API + Reverb websockets, deployed on Unraid. Read [docs/architecture.md](docs/architecture.md) before structural changes.

## Non-negotiables

- **PHP only runs in containers** on this dev machine (host PHP lacks extensions). Artisan/composer:
  `docker run --rm -v "$PWD/api:/app" -w /app composer:2 php artisan <cmd>`
- **Tests must pass before pushing** — a push to `main` auto-builds public GHCR images, and the production Unraid updater pulls `main`:
  `docker run --rm -v "$PWD/api:/app" -w /app -e BROADCAST_CONNECTION=log composer:2 php artisan test --compact`
- **Never commit secrets.** Dev secrets live in git-ignored `.env` (see `.env.example`); production generates its own on the NAS. A leaked key here already cost us a history rewrite.
- **Ports 3500–3502 belong to this project** on the dev machine; everything else in 3xxx is taken by other projects.

## Design system

- The visual source of truth is the comp in `design/Baby Log.dc.html`. App markup keeps the comp's inline CSS strings verbatim via `S()` from [src/s.js](src/s.js) — when changing styles, edit the string, don't convert to style objects. Hover states are utility classes in [src/styles.css](src/styles.css).
- Palette: cream `#FAF6EF`/`#FFFDF8`, ink `#26231D`, olive `#7C8C5A` (primary), type colors via `oklch(0.60 0.075 <hue>)`. Fonts: Nunito (display), Nunito Sans (body), Material Symbols Rounded (icons, ligature names).
- New UI should read like the comp: 999px pills, 24–26px card radii, `rgba(38,35,29,…)` hairlines.

## Sync rules (don't break these)

- Entries: client-generated UUID ids, tombstone deletes, outbox → batch push, `GET /state?since=` pull. Server never invents entry state; last write wins.
- Realtime is **poke-to-pull**: broadcast `HouseholdTouched` (via its best-effort `::send()`, never raw `broadcast()`), client re-pulls `/state`. Never broadcast data payloads.
- Every new write endpoint needs: auth + the 120/min throttle group, household scoping through `$request->user()->household`, a `HouseholdTouched::send()`, and a feature test in `api/tests/Feature/BabylogApiTest.php`.

## Deploy

- Production = Unraid "NAS" (`<nas-host>`, no SSH — drive the webGui via the user's Chrome; User Scripts plugin runs commands). `babylog-update` pulls `main` and rebuilds; `babylog-reset-data` wipes the DB.
- Public URL: https://babylog.example.com (NPM at `<proxy-ip>:81`, websockets ON).
- Registration is invite-only — never register test accounts against production; the first account claims a fresh instance.
- Full runbook: [docs/operations.md](docs/operations.md).

## Current phase

Living with the app to collect feedback in [TESTING.md](TESTING.md), then iterating. Backlog seeds: [docs/known-limitations.md](docs/known-limitations.md). Marketplace release (CA template, tagged versions, pinned installer) comes after.
