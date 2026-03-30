# Widget setup

Each **project** has its own **public key**. Use that key in the embed so the widget loads **only** that project’s changelogs.

## Example snippet

```html
<script src="https://cdn.example.com/widget.js"></script>
<script>
  ReleaseWidget.init({
    projectKey: "your_project_public_key",
    triggerId: "release-btn",
    position: "right"
  });
</script>
```

- **`projectKey`** (sometimes documented as `projectId`): Opaque id from the admin **Copy embed** / project settings. **Required** for multi-site setups (product A vs B).
- **`triggerId`**: DOM id of the button that opens the panel.
- **`position`**: e.g. `right` | `left` for the drawer.

**`locale`** (optional, when i18n is enabled): BCP 47 language tag; the API may return translated title/body when translations exist.

## Self-hosted script URL

If you host the app yourself, the loader may be served from your origin, for example:

`https://your-domain.com/js/widget.js`

Replace the `script src` accordingly.

## Public API without widget

You can also integrate using the **REST API** alone:

`GET /api/p/{projectKey}/changelogs`

See [API reference](api-reference.md).

The bundled `widget.js` currently wires a **trigger button** to open the public changelog in a new tab; a richer in-page panel is optional future work.

## Two startups, two snippets

- **Site A:** `projectKey` for project A only.
- **Site B:** `projectKey` for project B only.

Never reuse the same key on two products if you want separate feeds.
