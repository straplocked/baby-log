# Operations

Runbook for a self-hosted instance. Production is an Unraid box (referred to as the "NAS" below; `<nas-ip>` stands in for its LAN address), optionally published at a public domain through a reverse proxy.

## Layout on Unraid

```
/mnt/user/appdata/baby-log/
  .env      # generated on first install: APP_KEY, REVERB_* secrets, APP_PORT, DATA_DIR
  src/      # extracted GitHub tarball (replaced on every update)
  data/     # database.sqlite — THE data. Survives updates and rebuilds.
```

Containers (compose project `baby-log`, from `src/deploy/unraid/docker-compose.yml`):

| Container | Role | Exposure |
|---|---|---|
| `baby-log-app` | nginx: PWA + `/api` + `/app` ws proxy | host port **3500** |
| `baby-log-api` | Laravel (`artisan serve`, 8 workers), migrates on boot | internal only |
| `baby-log-reverb` | websocket server | internal only |

## Update / install

Unraid webGui → **Settings → User Scripts → `babylog-update` → Run Script**. It pulls the latest `main` tarball, rebuilds, and restarts; `.env` and `data/` are untouched. The same script is the installer (idempotent).

- Pin a version instead of `main`: run with `BABYLOG_REF=v1.0.0` in the environment (tags should be the norm once released).
- The script lives at [deploy/unraid/babylog.sh](../deploy/unraid/babylog.sh); the User Script is just `curl | sh` of it from `main`.

## Wipe all data (testing)

**Settings → User Scripts → `babylog-reset-data`** — stops api+reverb, deletes `database.sqlite`, restarts (migrations recreate it). Every account and entry is gone; **the next sign-up claims the instance**. Secrets are kept.

## Backups

The entire state is one file: `/mnt/user/appdata/baby-log/data/database.sqlite` (plus `.env` for the secrets). Unraid's **Appdata Backup** plugin covers `appdata/baby-log` if installed — verify it's included in its share list. Manual restore: stop api+reverb, replace the sqlite file, start.

## Remote access (reverse proxy)

Point your reverse proxy (e.g. Nginx Proxy Manager) at the app container: `your-domain → http://<nas-ip>:3500` with **websocket support enabled** (required for Reverb), plus the usual Force SSL / HTTP/2 / Let's Encrypt cert.

If realtime breaks remotely but works on LAN, check the websocket toggle on the proxy host first.

## Registration policy

Invite-only by default: the first sign-up claims a fresh instance; after that only invited emails with their single-use code can register. To open it up (not recommended while public): add `BABYLOG_OPEN_REGISTRATION: "true"` to the api service env in the Unraid compose and re-run the update script.

## Enabling email (invite mail + password reset)

Out of the box the instance can't send mail (`MAIL_MAILER` defaults to `log`): invites show the shareable code only, and "Forgot password?" tells the user this server can't send email. To turn email on, append SMTP credentials to `/mnt/user/appdata/baby-log/.env` (User Scripts can do it, or edit the file over SMB):

```
MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=you@example.com
MAIL_PASSWORD=app-password
MAIL_FROM_ADDRESS=you@example.com
# MAIL_SCHEME=smtps   # only for implicit-TLS servers (usually port 465)
```

Then run **`babylog-update`** once. That's required, not optional: compose only injects `.env` values into the containers when it (re)creates them, and the update script's `docker compose up -d` recreates api+reverb because their environment changed. Nothing else — no config cache to clear (the containers don't run `config:cache`), no manual container restarts.

With mail on: invites also email the code to the partner (the on-screen code still works and stays the source of truth), and "Forgot password?" emails a reset link pointing at `APP_URL/?reset=…` — so `APP_URL` in that same `.env` must be the real public origin (e.g. `https://babylog.example.com`) or the links will point somewhere useless. A failed SMTP send never blocks an invite; it falls back to code-only (`mailed: false`).

## Local development

```bash
cp .env.example .env       # then fill APP_KEY + REVERB_APP_SECRET (commands in the file)
npm install
docker compose up -d --build   # full stack on http://localhost:3500 (api :3501, reverb :3502)
npm run dev                    # OR: Vite dev server on :3500, proxying to the containers
```

Host PHP on the dev machine lacks extensions — run all composer/artisan through containers:

```bash
docker run --rm -v "$PWD/api:/app" -w /app composer:2 php artisan <cmd>
```

Tests:

```bash
docker run --rm -v "$PWD/api:/app" -w /app -e BROADCAST_CONNECTION=log composer:2 php artisan test --compact
```

Two accounts in one browser: open `http://localhost:3500` and `http://127.0.0.1:3500` — different origins, separate sessions.

## CI / images

`.github/workflows/build-images.yml`: on every push to `main`, runs the API test suite, then (only if green) builds and pushes `ghcr.io/straplocked/baby-log-app` and `…-api` (`:latest` + commit SHA). These images are the basis for the future Unraid Community Apps template.

## All-in-one image (Community Apps)

[deploy/aio/Dockerfile](../deploy/aio/Dockerfile) builds the whole stack into **one** container — CA users expect one-click single containers. Inside: supervisord keeps nginx (PWA + `/api` + `/app` ws proxy on port 80), `artisan serve` (8 workers), Reverb, and `schedule:work` running; everything else matches the three-container compose stack.

```bash
docker build -f deploy/aio/Dockerfile -t baby-log-aio .        # from the repo root
docker run -d -p 3500:80 -v /path/to/data:/data baby-log-aio
```

- **`/data` is the instance**: `database.sqlite` + a `.env` holding the secrets. Back up that volume and you have everything.
- **Secrets self-generate on first boot** (CA templates can't generate secrets): an empty `/data` gets a fresh `APP_KEY` and `REVERB_*` written to `/data/.env`; later boots reuse it. Migrations run on every boot.
- The generated `REVERB_APP_KEY` is stamped into the served PWA bundle at boot (the image bakes a placeholder), so realtime works without any build-time coupling.
- **Config**: set container env vars (`APP_URL`, `MAIL_*`, `REVERB_ALLOWED_ORIGINS`, `BABYLOG_OPEN_REGISTRATION`, …) in the template, or append them to `/data/.env` and restart the container — container env wins over the file. (Editing `REVERB_APP_KEY` itself needs a re**create**, so the fresh filesystem gets re-stamped.)
- Reverse proxy guidance is the same as above: point it at this container's port 80 with websocket support enabled.

## Troubleshooting

| Symptom | Check |
|---|---|
| App up, changes not appearing on partner's phone | `docker logs baby-log-reverb`; NPM websocket toggle; client falls back to 60s polls so data still converges |
| 500s from `/api` | `docker logs baby-log-api` (Laravel logs to stderr) |
| "invite-only" on a legit partner signup | Exact email match required (lowercased) + the code from the invite toast; re-invite to regenerate a code |
| Update script fails on compose | Compose Manager plugin must be installed (provides `docker compose`) |
| Wrong/lost secrets | `.env` in appdata; APP_KEY changes invalidate nothing critical (tokens are hashed, not encrypted) but keep it stable anyway |
| A phone suddenly asks to log in again | Expected every ~90 days — API tokens expire 90 days after login (counted from login, not last use); logging back in is the whole fix |
