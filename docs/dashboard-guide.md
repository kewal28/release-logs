# Dashboard guide

## Project switcher

After login, **select the active project**. The **summary dashboard**, changelog list, stats, and **embed code** apply to **that project** only.

## Summary dashboard

The admin home aims to show:

- **Stat cards**: Total changelogs, published count, breakdown by label (feature / **upcoming** / bug), comments, total upvotes (“likes”), total views.
- **Attachments**: Total files uploaded and **total storage** used (from uploaded images).
- **Per-changelog table**: Title, status, label, views, votes, comments, attachment count and size.

Exact widgets depend on your server version; data comes from `GET /api/admin/dashboard/stats?projectId=...` when implemented.

## Changelogs

- **Create** entries with title, body, **label**, and optional images.
- **Draft vs published**: Publishing may be restricted to admins depending on configuration.
- **Labels**: Built-ins include `feature`, `bug`, `upcoming`. **Custom labels** may be available per project on paid tiers (or when enabled on self-host).

## Comments

- View and **approve** comments when moderation is **manual** (see `.env` in [Self-hosting](self-hosting.md)).
- Notifications may be sent when SMTP is configured under **Settings**.

## Settings

- **Company name**, theme, logo, email, S3, etc.
- **Show author username** on public changelogs (privacy-sensitive; off by default when available).
- **Changelog image limits** (max file size, max files per entry, allowed types) may be edited here instead of environment variables when that feature is enabled.

## Embed code

From the project context, copy the **public key** / snippet for use in [Widget setup](widget-setup.md).
