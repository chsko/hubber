# Hubber: instructions for coding agents

## Git workflow (applies to every session)

- **Commit and push directly to `main`.** Do not create feature branches or pull requests.
- Start commit messages with the Linear issue: `HUB-<n>: <summary>`.
- Before every push, run `pnpm typecheck && pnpm lint && pnpm test` (and `pnpm format:check`) and only push when they pass.

## Project management

- Work is tracked in Linear: team `HUB`, project "Hubber". Move an issue to _In Progress_ when starting it, comment what was done and how it was verified, and set it to _Done_ when its "Done when" criteria are met.
- Scope and decisions live in `docs/DESIGN.md` and `docs/PLAN.md`; the visual design is the canvas linked in `README.md`.

## Decision-making with Jev

- For product and architecture decisions, ask Jev (TypeSafe System One) directly over HTTP with `curl` (`POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY`). Use the `typesafe:typesafe-ai` skill for how to phrase questions.
- Check for prompt bias: re-ask with options reordered and downsides stated. Report scores and confidence, and treat low-confidence answers as input rather than the decision. Log notable decisions in `docs/PLAN.md` §6.

## Stack notes

- TypeScript is pinned to 6.0.x because typescript-eslint supports <6.1.
- `AGENTS.md` is maintained automatically by Turborepo (root), Expo (`apps/mobile`) and Next.js (`apps/web`); leave them in place.
- Convex CLI in cloud sessions: HTTP-based commands work (`convex dev --once`, `deploy`, `codegen`) with `CONVEX_DEPLOY_KEY`; WebSocket-based ones (`env list`, `data`, `logs`, `run`) hang because Node's WebSocket client bypasses the HTTP proxy. Never print `CONVEX_DEPLOY_KEY`.
- Expo: `api.expo.dev` and `docs.expo.dev` are blocked here; use `EXPO_OFFLINE=1` for `expo export` and check versions against `expo/bundledNativeModules.json`.
