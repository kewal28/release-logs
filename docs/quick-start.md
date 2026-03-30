# Quick start

## Target flow (multi-project)

1. **Sign up / log in** to your Release Log instance.
2. **Create a project** (e.g. “Startup A”). You receive a **public key** used in embeds and APIs.
3. **Create release notes** (changelogs) under that project.
4. **Copy the embed snippet** for that project and paste it into the site that should show **that** feed.
5. Repeat for another project (e.g. “Startup B”) with a **different** snippet for the other site.

> **Self-host note:** The first deployment may create a **default project** for existing data during database migration. Use **Admin → Projects** (or the projects API) to add more.

## Self-host quick path

1. Clone the repository and install dependencies: `npm install`
2. Configure MySQL and copy `.env` (see [Self-hosting](self-hosting.md)).
3. Start the server: `npm start`
4. Open the **Admin** panel at `{BASE_URL}/admin` and log in (default admin may be created on first DB init—**change the password** immediately in production).
5. Create a **project**, then **changelogs**, then use the **public key** in [Widget setup](widget-setup.md) or open the public feed with the key in the API path.

## SaaS

If you use a hosted offering from a provider, the same steps apply in their control panel; URLs and signup will differ—follow the provider’s onboarding.
