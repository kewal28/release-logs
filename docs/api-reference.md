# API reference

**Interactive docs:** Open `{BASE_URL}/api-docs` (Swagger UI) on your deployment for the live OpenAPI spec generated from route JSDoc.

## Authentication

- **Admin / authenticated:** `Authorization: Bearer <JWT>` from `POST /api/auth/login`.
- **Public project APIs:** No JWT; scope is the **`projectKey`** in the URL path (see below).

## Project-scoped public routes

Base path:

```http
GET /api/p/{projectKey}/changelogs
GET /api/p/{projectKey}/changelogs/{idOrSlug}
POST /api/p/{projectKey}/changelogs/{id}/vote
POST /api/p/{projectKey}/changelogs/{id}/comments
GET /api/p/{projectKey}/changelogs/{id}/comments
```

- **`projectKey`**: Public embed key for the project. Invalid keys return **404**.
- **Vote response** (when optimized): JSON includes `upvotes`, `downvotes`, and `action` (`created` | `updated` | `removed`) so clients can update UI without refetching the full list.

### Query parameters

- **List:** `page`, `limit`, `label`, optional `locale` when i18n is enabled.

### Legacy list (compatibility)

```http
GET /api/changelogs?projectKey={key}
```

If omitted and exactly **one** project exists, some builds may default to that project; otherwise **`projectKey` is required**.

## Global public settings

```http
GET /api/public/settings
```

Returns public branding (company name, appearance) — may become project-specific in a future release.

## Admin — projects

When enabled:

```http
GET /api/admin/projects
POST /api/admin/projects
```

Create projects; response includes `public_key` for embeds.

## Admin — dashboard stats

```http
GET /api/admin/dashboard/stats?projectId={numericId}
```

Returns aggregates for the **selected project** (totals, label breakdown, comments, votes, views, attachment bytes). Requires ownership / admin rules as implemented.

## Admin — changelogs

Existing routes under `/api/admin/changelogs` require a **`projectId`** query or body field when multi-project mode is enforced.

## Examples

**List published changelogs for a project:**

```bash
curl -s "${BASE_URL}/api/p/${PROJECT_KEY}/changelogs?page=1&limit=10"
```

**Vote (upvote):**

```bash
curl -s -X POST "${BASE_URL}/api/p/${PROJECT_KEY}/changelogs/123/vote" \
  -H "Content-Type: application/json" \
  -d '{"vote_type":"upvote"}'
```

**Comment:**

```bash
curl -s -X POST "${BASE_URL}/api/p/${PROJECT_KEY}/changelogs/123/comments" \
  -H "Content-Type: application/json" \
  -d '{"author_name":"Dev","author_email":"dev@example.com","content":"Great release!"}'
```
