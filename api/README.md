# mybabynotes — API

The Laravel 13 backend for [mybabynotes](../README.md) ([mybabynotes.app](https://mybabynotes.app)): SQLite, Sanctum bearer tokens, Reverb websockets.

- Endpoint reference: [docs/api.md](../docs/api.md)
- System design: [docs/architecture.md](../docs/architecture.md)
- Conventions for working in this directory: [CLAUDE.md](CLAUDE.md)

Host PHP isn't required — run everything through containers from the repo root:

```bash
docker run --rm -v "$PWD/api:/app" -w /app composer:2 php artisan <cmd>
docker run --rm -v "$PWD/api:/app" -w /app -e BROADCAST_CONNECTION=log composer:2 php artisan test --compact
```
