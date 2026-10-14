# @hubbr/web

Next.js 16 (App Router, Turbopack, Cache Components) site for **public pages only**: the landing page and shared event and invite links. The logged-in app is `apps/mobile` (also on web).

- Routes: `/` (nb) and `/en` are separate root layouts (`src/app/(nb)`, `src/app/(en)`) so `<html lang>` is right and both pages stay fully static
- `/i/[code]` is the fallback for invite links when the app doesn't open: it shows the code and an "open in app" button (`hubbr://i/<code>`). `/e/[id]` is a stub (HUB-31)
- `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` let hubbr.no/i/* open the installed app (HUB-32). They read `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` (comma-separated fingerprints) from the environment and list no app until those are set
- Styling: Tailwind 4. Colour values come from `@hubbr/shared` (`src/lib/theme-css.ts`) and switch with `prefers-color-scheme` in CSS only, so there's no flash on load
- Font: Figtree via `next/font` (self-hosted at build time)

```sh
pnpm --filter @hubbr/web dev     # http://localhost:3000
pnpm --filter @hubbr/web build && pnpm --filter @hubbr/web start
```

Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` (see `AGENTS.md`) before changing conventions.

## Hosting (hubbr.no)

Vercel project with Root Directory `apps/web`; `vercel.json` pins pnpm and the Stockholm region. `hubbr.no` is the primary domain and `www.hubbr.no` redirects to it. The association files must be served from `hubbr.no` itself with no redirect.

Universal links only work in a native build (EAS Build) made after `associatedDomains` / `intentFilters` were added to `apps/mobile/app.json`; Expo Go never opens hubbr.no links.
