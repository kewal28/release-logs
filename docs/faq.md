# FAQ

## Widget does not load or feed is empty

- Check **`projectKey`** matches the project you expect (each site should use its own key).
- Verify **`BASE_URL`** and CORS / network (ad blockers, mixed HTTP/HTTPS).
- Open `{BASE_URL}/api/p/{projectKey}/changelogs` in the browser; you should see JSON.

## Wrong startup’s changelog appears

You are using another project’s **public key**. Copy the snippet from the correct project in the admin **project switcher**.

## How do I update self-host?

1. Pull the latest code.
2. `npm install`
3. Restart the process (PM2, systemd, etc.).
4. Back up MySQL before applying schema changes; the app may run incremental migrations on startup.

## Can I remove branding?

Adjust **Settings** (company name, logo URL, theme). Per-project branding may arrive in a future version.

## Comments stay “pending”

- If **`COMMENT_APPROVAL_MODE=manual`** in `.env`, approve comments in the admin comments UI.
- If auto mode, pending can still happen when profanity filtering flags content—check admin.

## Author name not shown on public pages

Enable **show changelog author** in Settings when that setting exists (off by default for privacy).

## Votes feel slow or the list jumps

Use an API build that returns **vote counts** on `POST .../vote` and update counts in place instead of reloading the entire changelog list.

## Invalid `projectKey` or changelog id

You get **404**. Changelog numeric ids are only valid **inside** the correct project scope.

## Custom labels

Available per **project** when billing or **`ENABLE_CUSTOM_LABELS`** (self-host) allows it. Built-in labels: `feature`, `bug`, `upcoming`.

## i18n

Pass `locale` on list/detail when supported; missing translations fall back to the default language stored on the changelog row.
