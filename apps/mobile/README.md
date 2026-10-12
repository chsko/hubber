# @hubber/mobile

Expo Router app (Expo SDK 57) for iOS, Android and the logged-in web app.

- Routes live in `src/app/` (tabs in `src/app/(tabs)/`); other code in `src/components/` and `src/lib/`
- Styling: NativeWind 4 (Tailwind 3). Colour tokens come from `@hubber/shared` and are applied as CSS variables
  for the system colour scheme in `src/components/theme-root.tsx`, so `bg-bg`, `text-primary` etc. follow light/dark
- Fonts: Figtree (`font-sans`, `font-sans-semibold`, `font-sans-bold`, `font-sans-extrabold`); icons: Lucide
- Data: Convex React client (`src/lib/convex.ts`), URL from `EXPO_PUBLIC_CONVEX_URL`

## Run

```sh
cp apps/mobile/.env.example apps/mobile/.env   # once
pnpm --filter @hubber/mobile dev               # Expo dev server; scan the QR code with Expo Go
pnpm --filter @hubber/mobile web               # in the browser
pnpm --filter @hubber/mobile build:web         # static web build in dist/
```

Add native libraries with `npx expo install <pkg>` so versions match the SDK. See `AGENTS.md` for Expo-specific rules.

## Updates without a rebuild (EAS Update)

Every push to `main` that passes CI publishes the JavaScript to EAS Update on the `main` channel (the `update`
job in `.github/workflows/ci.yml`). The runtime version follows the SDK (`exposdk:57.0.0`), so Expo Go can open
it: `exp://u.expo.dev/<projectId>?runtime-version=exposdk:57.0.0&channel-name=main` (the job summary prints
the full link). Native changes (new native modules, plugins, permissions) still need a new build or an SDK
Expo Go supports. Requires the `EXPO_TOKEN` repository secret and `extra.eas.projectId` from `eas init`.
