# Release Log documentation

Release Log is a self-hostable changelog application: public updates at `/changelog`, authenticated dashboard at `/dashboard`, and JSON APIs under `/api`.

This folder is the **GitBook source** (Markdown only). The Node app does **not** serve these files; set `DOCS_PUBLIC_URL` in `.env` to your published GitBook (or other docs site) and use the in-app **Documentation** page to link out.

## Quick links

- [Quick start](quick-start.md) — install, `npm run setup`, first login
- [Dashboard guide](dashboard-guide.md) — accounts, verification, changelogs, embed snippet
- [Widget / embed](widget-setup.md) — what ships today vs planned
- [Self-hosting](self-hosting.md) — Docker, Nginx, Apache, env reference, optional Redis
- [API reference](api-reference.md) — Swagger UI
- [FAQ](faq.md)
