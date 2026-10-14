# @hubbr/backend

Convex backend (EU region, Dublin): schema, queries, mutations and actions in `convex/`.

- `convex/schema.ts`: data model (see `docs/PLAN.md` §3)
- `convex/lib/auth.ts`: `requireUser()` / `requireHubMember()`. Every public function starts with one of these.
- Tests: Vitest + `convex-test` in the edge-runtime environment (`pnpm test`)

## Running against Convex

Set `CONVEX_DEPLOY_KEY` to a dev deploy key scoped to the dev deployment (format `dev:<deployment>|<token>`, with a literal `|`), then:

```sh
pnpm --filter @hubbr/backend dev       # push functions + regenerate convex/_generated
pnpm --filter @hubbr/backend codegen   # regenerate types only
```

`convex/_generated` is committed; `convex dev` regenerates it. Dev deployment: `tangible-ox-76` (EU, `eu-west-1`).

## Sign-in (Convex Auth)

`convex/auth.ts` configures Convex Auth. Until Vipps credentials exist, the only provider is the **dev-only sign-in** (`convex/lib/devSignIn.ts`): `signIn("dev", { persona })` signs in as one of the fake Vipps profiles in `convex/lib/devPersonas.ts` (Nora is under 18, for the age gate). Profiles go through `vippsProfile()` in `convex/lib/vipps.ts`, which the real Vipps provider will reuse.

Deployment environment variables:

| Variable                  | Dev                | Production                              |
| ------------------------- | ------------------ | --------------------------------------- |
| `JWT_PRIVATE_KEY`, `JWKS` | set (RSA key pair) | set (own key pair)                      |
| `HUBBER_DEV_SIGN_IN`      | `enabled`          | **never set**: dev sign-in fails closed |

Without `HUBBER_DEV_SIGN_IN=enabled` the provider throws `DEV_SIGN_IN_DISABLED` and `devSignIn.personas` returns `[]`, so the app hides the test sign-in.
