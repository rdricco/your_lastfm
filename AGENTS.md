# AGENTS.md – Your LastFM

## Quick Context

**Your LastFM** is a Node.js + SQLite web app that syncs music scrobbles from Last.fm, stores them locally, and serves a dashboard. The project uses two separate runtime environments:

1. **Node.js backend** (`/src`) – REST API, database, sync logic
2. **Astro frontend** (`/your_lastfm_astro/`) – Cloudflare Pages deployment

Both run in Docker, coordinated by a shell entrypoint that manages startup order and process lifecycle with PM2.

---

## Startup and Execution Flow

The Docker container runs sequentially via `entrypoint.sh`:

```bash
# 1. Initialize database (create /data/stats.db if missing)
# 2. Run full initial sync (blocking)
node src/initial-sync.js

# 3. Start web API on port 1533 (Express)
pm2 start src/api.js --name "web-api"

# 4. Start cron syncer (every 5 minutes)
pm2-runtime start src/cron.js --name "sync-cron"
```

**Key point:** Initial sync is **blocking**. Subsequent sync is **scheduled** every 5 minutes but skips if already running to avoid concurrency issues.

---

## Development Commands

Run from project root **unless noted**:

```bash
# Backend (root directory)
npm run start       # Start API server (port 1533, hot-reload disabled)
npm run dev         # Dev mode with --watch (auto-restart on file changes)
npm run sync        # Run one-off full sync to Last.fm
npm run cron        # Test cron scheduling locally

# Frontend (from your_lastfm_astro/)
cd your_lastfm_astro
pnpm dev            # Local dev server (Astro, port 4321)
pnpm build          # Build static site to dist/
pnpm preview        # Preview with Cloudflare Pages emulator

# Docker
docker compose up -d          # Build & run with mounted volumes
docker compose down           # Stop container
```

**No tests defined.** If you add tests, run from root with `npm test` or backend-only task.

---

## Architecture: Three Sync Modules

All sync logic is in `/src/sync.js` and exported as `sync()`. Called three ways:

| Entry Point | When | Config | Purpose |
|---|---|---|---|
| `initial-sync.js` | Container startup | `{ full: true }` | Full historical fetch from Last.fm API (slow, one-time) |
| `cron.js` | Every 5 min (scheduled) | default | Incremental sync since last track in DB |
| `api.js` `/sync-now` | Manual API call | `{ full: false }` | User-triggered incremental sync |

**Sync transaction:** Inserts scrobbles using `INSERT OR IGNORE` to prevent duplicates by UNIQUE(artist, track, played_at).

---

## Database Schema

File: `/src/db.js` – Uses **better-sqlite3** with WAL mode (readers don't block writers).

Location: `/data/stats.db` (persisted via Docker volume).

Tables:
- **scrobbles** – artist, track, album, album_image, played_at (UNIX timestamp)
- **artists** – artist name (PK), artist_image, updated_at
- **settings** – key/value pairs (API key, username, config)
- **loved_tracks** – artist, track, url (Last.fm loved songs)
- **events** – artist, event_id, date, venue (Last.fm user events)

Migrations are sequential; each one is wrapped in `IF NOT EXISTS` or `ALTER TABLE` to be idempotent. Run automatically on app startup.

---

## API Server Entry Points

File: `/src/api.js` – Express server, port 1533 (configurable via `PORT` env var).

Key endpoints:
- `GET /api/scrobbles?type=week|month|year|all&from=…&to=…` – Chart data
- `GET /api/statistics` – Aggregate stats
- `GET /api/settings` – Fetch settings (API key masked as `●●●●●●●●`)
- `POST /api/settings` – Update settings (checks for masked value, ignores if present)
- `POST /api/sync-now` – Trigger manual incremental sync
- `GET /` – Serves static files from `/public` (fallback to index.html for SPA routing)

Settings are read/write from SQLite, so changes persist across restarts.

---

## Environment Variables

Required in `.env`:

```
LASTFM_API_KEY=<your_key>
LASTFM_USERNAME=<your_username>
```

Optional:
```
PORT=1533                    # API server port (default 1533)
AVG_TRACK_SECONDS=180        # Used to estimate scrobbles in stats
```

In Docker, `.env` is passed via `env_file` in compose. Loaded by each Node process with `require('dotenv').config()`.

---

## External Services and Rate Limiting

**Last.fm API:** https://ws.audioscrobbler.com/2.0/

- Method: HTTP GET with query params (API key, username, page, limit)
- Rate limiting: Retry up to 3 times with 3s delay between attempts
- Request throttling: 300ms delay between consecutive requests (to be polite)
- Per page: 200 scrobbles max, paginated for full sync

**Image services:**
- Album covers: Cached locally; fetched via Last.fm album.getInfo
- Artist images: Cached locally; fallback to Deezer API (service in `/src/services/deezerArtistImage.js`)

---

## Database Concurrency Safeguards

- **WAL mode enabled** – Readers don't block writers, allows multi-process access
- **Transactions:** Sync batches use `db.transaction()` to group inserts atomically
- **Cron guard:** `running` flag prevents concurrent syncs (if cron fires while previous sync still running, it skips)

When modifying DB schema or adding tables, use `IF NOT EXISTS` to stay idempotent.

---

## Styling and Frontend

- **Public assets:** `/public/*` – Static files served by Express
- **Astro frontend:** `/your_lastfm_astro/*` – Separate Astro project (TypeScript, Tailwind)
- **Tailwind 4:** Configured in Astro, full latest syntax supported

For style changes: Edit components in `your_lastfm_astro/src/components/` and rebuild.

---

## Common Agent Mistakes to Avoid

1. **Don't assume tests exist.** No test suite is defined; skip `npm test` in plans.
2. **Initial sync blocks API startup.** If you add heavy logic to initial-sync.js, container will appear hung during startup.
3. **Cron prevents concurrent syncs via flag, not locks.** If you split sync into multiple processes, add proper DB locking.
4. **Settings are in the DB, not .env.** Changing .env at runtime won't affect a running API unless you restart.
5. **Astro is a separate repo context.** Changes to frontend require `pnpm build` in `your_lastfm_astro/` and the built `dist/` is NOT checked in—it's generated on deployment.
6. **API key is masked in responses.** UI sends back `●●●●●●●●` for security; the POST handler ignores it to avoid overwriting with garbage.
7. **WAL mode handles concurrency, but single-writer principle still applies.** Don't open DB connections outside the sync/API processes.

---

## Project Structure Snapshot

```
your_lastfm/                      # Root
├── src/
│   ├── api.js                    # Express server (main entry)
│   ├── db.js                     # SQLite setup and schema
│   ├── sync.js                   # Core sync logic (full + incremental)
│   ├── cron.js                   # Scheduled sync runner
│   ├── initial-sync.js           # One-time full sync on startup
│   ├── sync-loved.js             # Sync loved tracks from Last.fm
│   ├── sync-events.js            # Sync user events from Last.fm
│   ├── services/                 # Caching, image fetching, settings
│   └── utils/                    # Filters, date ranges, error handling
├── your_lastfm_astro/            # Frontend (Astro + Cloudflare)
│   ├── src/pages/                # Astro pages
│   ├── src/components/           # Astro components
│   └── package.json
├── public/                       # Static files for Express
├── data/                         # SQLite DB (persisted volume)
├── Dockerfile                    # Node 20 + PM2
├── entrypoint.sh                 # Startup orchestration
├── docker-compose.yaml           # Single-service config
└── package.json                  # Backend root dependencies
```

---

## Deployment Notes

- **Docker:** Build is done in compose; volumes mount `/data` for DB persistence and `/public` for static files.
- **Cloudflare Pages:** Astro frontend deployed separately; uses Wrangler CLI and `wrangler.jsonc` config.
- **Port 1533:** Default and hardcoded in docs; used for local and container networking.
