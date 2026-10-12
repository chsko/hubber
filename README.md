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

Requirements: Node.js 22 (see `.nvmrc`) and pnpm 12 (`npm i -g pnpm`; the repo pins the exact version in `packageManager` and pnpm switches to it automatically).

```sh
pnpm install
pnpm typecheck   # TypeScript, all packages
pnpm lint        # ESLint, all packages
pnpm test        # Vitest, all packages
pnpm format      # Prettier
```

Tasks run through [Turborepo](https://turbo.build); add `--filter @hubber/<package>` to run one package.

## Conventions

- Commit and push directly to `main` (no feature branches or pull requests). Reference the Linear issue in the commit message (`HUB-<n>: …`).
- TypeScript is strict everywhere (`tsconfig.base.json`).
