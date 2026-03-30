# Self-hosting

## Requirements

- **Node.js**: LTS (e.g. 18.x or 20.x recommended).
- **MySQL**: 8.x compatible (use `utf8mb4` / `utf8mb4_unicode_ci` for full Unicode).
- **Reverse proxy**: Apache or Nginx in front of Node in production (TLS, static caching for `/js` if desired).

## Installation

```bash
git clone <repository-url>
cd <project-directory>
npm install
```

## Environment variables

Create a `.env` file in the project root. Common variables:

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MySQL host (default `localhost`) |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password (**not** `DB_PASS`) |
| `DB_NAME` | Database name (app default `release_log`; `scripts/setup.js` may default to `release_log_db`—**use one name consistently**) |
| `DB_PORT` | MySQL port (optional, used by setup script) |
| `PORT` | HTTP port for Node (default `3000`) |
| `BASE_URL` | Public base URL (used in emails and Swagger `servers`) |
| `JWT_SECRET` | Secret for signing JWTs (**required** in production) |
| `JWT_EXPIRES_IN` | Token lifetime (default `24h`) |
| `NODE_ENV` | `production` or `development` |
| `UPLOAD_PATH` | Upload directory relative to project root |
| `MAX_FILE_SIZE` | Legacy max upload bytes (may be superseded by **settings** `changelog_max_image_size_bytes`) |
| `ALLOWED_IMAGE_TYPES` | Legacy comma-separated types |
| `RATE_LIMIT_*` / `DISABLE_RATE_LIMIT` | See `src/middleware/rateLimit.js` |
| `MAX_COMMENTS_PER_IP` | Comments per IP per 24h |
| `COMMENT_APPROVAL_MODE` | `auto` or `manual` — **comment moderation is env-only** (not the Settings UI). `manual` queues all new comments for admin approval. |
| `HONEYPOT_FIELD_NAME` | Optional spam honeypot field name |
| `ENABLE_CUSTOM_LABELS` | If set to `true`, allow custom labels per project (self-host; SaaS may use billing instead). |

Generate a strong `JWT_SECRET` and never commit `.env`.

## Database setup

**Option A — SQL file:** Import [database/schema.sql](../database/schema.sql) (adjust DB name if needed).

**Option B — app init:** On startup, `initializeDatabase()` in `src/config/database.js` creates tables and seeds defaults when possible.

**Note:** Run `npm run migrate` to apply incremental schema upgrades (`migrateSchema`) without re-seeding. The app also runs the same migration path from `initializeDatabase()` on startup.

## Run the server

```bash
npm start
```

Development with auto-reload:

```bash
npm run dev
```

## URLs

- **Public site:** `{BASE_URL}/`
- **Admin:** `{BASE_URL}/admin`
- **API docs (Swagger):** `{BASE_URL}/api-docs`
- **Health:** `{BASE_URL}/health`

## Project-scoped public API

Public changelog APIs are mounted under:

`/api/p/{projectKey}/changelogs`

Use the **public key** from the project record (admin UI). Legacy `GET /api/changelogs` may accept `?projectKey=` or default to the only project when a single project exists.

## Widget CDN

Self-hosters can serve `widget.js` from their own origin or put it behind a CDN; set the `script src` in the embed accordingly (see [Widget setup](widget-setup.md)).

## Internationalization (planned / partial)

Longer term, translations may live in a `changelog_translations`-style table. Configure default locale via app settings or env when documented for your version.

## GitBook

1. In GitBook, create a space and choose **Sync with Git**.
2. Point the sync at this repository and set the **content root** to `/docs`.
3. Publish; add your **published docs URL** here when live: `________________`

## Scaling (high level)

- Run multiple Node processes behind a load balancer with sticky sessions only if you rely on in-memory state (prefer stateless JWT).
- Use MySQL read replicas or caching for heavy read traffic if needed.
- Serve static `/js` and uploads via CDN or Nginx `alias`.
