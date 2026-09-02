# Baby Log

Three taps from pocket to logged. An installable, local-first PWA for two parents sharing one baby log — implemented from the Claude Design comp in [design/Baby Log.dc.html](design/Baby%20Log.dc.html).

## Screens

- **Splash / Auth / Onboarding** — account entry and two-question setup (name + age), partner invite.
- **Now** — since-cards (fed / diaper / slept / bath), today summary, tappable timeline (tap an entry to edit or delete it).
- **History** — 7-day stats, feeds & diapers bar charts, feed-rhythm insight. "Reset demo data" lives at the bottom.
- **Quick-log sheet** — opens pre-stamped with the current time and the predicted next entry (smart prefill: alternates nursing sides, remembers last bottle amount). Fast path is open → + → Save; time nudges cost one tap.
- **Shifts** — accept a handoff (plan drafted from the baby's rhythm), tick the plan off as you log, hand back with a note and an auto-generated shift summary.

## Stack

- Vite + React 18, no other runtime deps. Design styles carried over 1:1 via a tiny CSS-string→style-object parser ([src/s.js](src/s.js)).
- Local-first: all state persists to `localStorage`; a service worker caches the app shell and fonts so 3am logging never waits on a network.
- Docker: multi-stage build (Node 22 → nginx) with SPA fallback and immutable-asset caching.

## Run

```bash
docker compose up -d --build   # serves on http://localhost:3500
```

Dev mode:

```bash
npm install
npm run dev                    # http://localhost:3500
```

Port 3500 was chosen to avoid this machine's occupied 3xxx block (3000/3100/3200/3300/3400-3499).

## Notes

- The partner ("Katrina") side is simulated locally — the design's Laravel sync API is a future phase; entries are structured (`{id, type, t, detail}`) so a sync layer can slot in.
- Original design files (including the `.dc.html` comp and iOS frame) are kept under [design/](design/) for reference.
