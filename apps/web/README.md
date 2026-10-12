# @hubber/web

Next.js 16 (App Router, Turbopack, Cache Components) site for **public pages only**: the landing page and shared event and invite links. The logged-in app is `apps/mobile` (also on web).

- Routes: `/` (nb) and `/en` are separate root layouts (`src/app/(nb)`, `src/app/(en)`) so `<html lang>` is right and both pages stay fully static
- `/e/[id]` and `/i/[code]` are stubs rendered at request time; real data and link previews arrive in HUB-31 and HUB-16
- Styling: Tailwind 4. Colour values come from `@hubber/shared` (`src/lib/theme-css.ts`) and switch with `prefers-color-scheme` in CSS only, so there's no flash on load
- Font: Figtree via `next/font` (self-hosted at build time)

```sh
pnpm --filter @hubber/web dev     # http://localhost:3000
pnpm --filter @hubber/web build && pnpm --filter @hubber/web start
```

Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` (see `AGENTS.md`) before changing conventions.
