# Hubber

Groups, chat and events for Norway, with Vipps-verified people only. No feed, no algorithm, no ads.

- Product and design: [`docs/DESIGN.md`](docs/DESIGN.md) · [design canvas](https://claude.ai/artifact/NLcpvB8gnKQVaqcbxRjQg2)
- Technical plan: [`docs/PLAN.md`](docs/PLAN.md)
- Project management: [Linear — Hubber](https://linear.app/elug/project/hubber-d87743f1ed72)

## Repository layout

| Path               | What                                                            |
| ------------------ | --------------------------------------------------------------- |
| `apps/mobile`      | Expo Router app: iOS, Android and the logged-in web app         |
| `apps/web`         | Next.js site for public pages (landing, event and invite pages) |
| `packages/backend` | Convex backend (EU region)                                      |
| `packages/shared`  | Shared types, helpers and design tokens                         |
| `packages/i18n`    | Norwegian (bokmål) and English message catalogs                 |

## Getting started

Requirements: Node.js 22 (see `.nvmrc`) and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm typecheck   # TypeScript, all packages
pnpm lint        # ESLint, all packages
pnpm test        # Vitest, all packages
pnpm format      # Prettier
```

Tasks run through [Turborepo](https://turbo.build); add `--filter @hubber/<package>` to run one package.

## Conventions

- `main` is the default branch; work happens on branches named after the Linear issue (`hub-<n>-short-title`) and lands via pull request.
- TypeScript is strict everywhere (`tsconfig.base.json`).
