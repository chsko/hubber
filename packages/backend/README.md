# @hubber/backend

Convex backend (EU region, Dublin): schema, queries, mutations and actions in `convex/`.

- `convex/schema.ts`: data model (see `docs/PLAN.md` §3)
- `convex/lib/auth.ts`: `requireUser()` / `requireHubMember()`. Every public function starts with one of these.
- Tests: Vitest + `convex-test` in the edge-runtime environment (`pnpm test`)

## Running against Convex

Set `CONVEX_DEPLOY_KEY` to a dev deploy key scoped to the dev deployment (format `dev:<deployment>|<token>`, with a literal `|`), then:

```sh
pnpm --filter @hubber/backend dev       # push functions + regenerate convex/_generated
pnpm --filter @hubber/backend codegen   # regenerate types only
```

`convex/_generated` is committed; `convex dev` regenerates it. Dev deployment: `tangible-ox-76` (EU, `eu-west-1`).
