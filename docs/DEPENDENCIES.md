# Dependency updates

Dependabot (`.github/dependabot.yml`) checks for updates every Monday morning and opens pull requests. Every merge to `main` publishes an EAS Update to phones, and CI never runs the app on a phone, so only updates that can't change the app's runtime merge on their own.

| What                                                                                                                       | Pull request                          | Merge                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| Dev tooling (lint, types, tests, build), minor and patch                                                                   | One grouped PR a week (`dev-tooling`) | **Automatically** once CI is green       |
| GitHub Actions versions                                                                                                    | One grouped PR a week                 | **Automatically** once CI is green       |
| App runtime packages that aren't tied to the Expo SDK (Convex, i18next, Lucide, …), minor and patch                        | One grouped PR a week (`app-runtime`) | By hand, after trying the app            |
| Major versions of anything not listed below                                                                                | One PR per package                    | By hand                                  |
| Expo SDK packages (`expo`, `expo-*`, `react`, `react-native`, `react-native-*`, `@react-native/*`, `babel-preset-expo`, …) | None                                  | `pnpm expo install --fix` or SDK upgrade |
| Security updates                                                                                                           | One PR per alert                      | By hand                                  |

Other pins Dependabot respects: TypeScript stays on 6.0.x (typescript-eslint supports <6.1), Tailwind stays on 3 and NativeWind on 4 (NativeWind 4 needs Tailwind 3), `@types/node` stays on 22. A 3-day cooldown keeps it in line with pnpm's `minimumReleaseAge`.

The auto-merge is the `Dependabot auto-merge` job in `.github/workflows/ci.yml`. It runs only after the check and mobile bundle jobs pass, and only merges the exact commit CI checked.

## One-time GitHub settings

In the repository's **Settings → Advanced Security** (or **Code security**):

- **Dependabot alerts**: on.
- **Dependabot security updates**: on.

Settings → Actions → General needs no change: the auto-merge job asks for the write access it needs.
