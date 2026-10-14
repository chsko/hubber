# Testing

| Layer                 | What it catches                                                                                     | Where                                  |
| --------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Unit tests            | Backend rules (membership, RSVP, invites, age gate) with `convex-test`; shared helpers              | `pnpm test`, CI on every push and PR   |
| Typecheck, lint, i18n | Type errors, lint rules, missing translation keys                                                   | CI on every push and PR                |
| Mobile bundle smoke   | The iOS and Android JavaScript bundles fail to build, or a native package no longer matches the SDK | CI job `Mobile bundle (iOS + Android)` |
| On-device smoke       | The app starts, signs in and shows its main screens (planned, see below)                            | EAS Workflows with Maestro             |

## Mobile bundle smoke test

Runs the same Metro bundle that the EAS Update on every push to `main` publishes, plus `expo install --check`, so a broken import, an unhoisted dependency or a Dependabot bump that breaks the bundle turns CI red instead of reaching phones. Run it locally from `apps/mobile`:

```sh
pnpm exec expo install --check
pnpm exec expo export --platform ios --platform android --output-dir /tmp/hubbr-export
```

It does not start the app, so a crash on launch or a broken screen still gets through.

## On-device smoke test (planned)

[Maestro](https://maestro.mobile.dev) flows run by an EAS Workflow `maestro` job on an iOS simulator and an Android emulator build. A first flow: launch, sign in as a dev persona (Kari) on the dev Convex deployment, open Home, a hub, its chat and Discover. Screens already carry `testID`s for the inputs a flow needs. Needs a simulator/emulator build profile in `eas.json`, and each run uses EAS build credits.
