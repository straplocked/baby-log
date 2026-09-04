# mybabynotes API

Follow the root [CLAUDE.md](../CLAUDE.md) — it is the source of truth. Do NOT install PHP or Composer on the host, and do not install Laravel Boost.

Key points for work scoped to `api/`:

- **PHP only runs in containers** on this dev machine:
  `docker run --rm -v "$PWD/api:/app" -w /app composer:2 php artisan <cmd>`
  (from the repo root; use `-v "$PWD:/app"` if already inside `api/`)
- **Tests must pass before pushing** (a push to `main` deploys):
  `docker run --rm -v "$PWD/api:/app" -w /app -e BROADCAST_CONNECTION=log composer:2 php artisan test --compact`
- **Sync rules**: poke-to-pull realtime via `HouseholdTouched::send()` (never broadcast data payloads); every new write endpoint needs auth + the 120/min throttle group, household scoping through `$request->user()->household`, a `HouseholdTouched::send()`, and a feature test in `api/tests/Feature/BabylogApiTest.php`.
- **Never commit secrets** — dev secrets live in git-ignored `.env`.
