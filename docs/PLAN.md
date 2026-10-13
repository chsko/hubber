# Hubber — Technical Plan

Companion to [`DESIGN.md`](./DESIGN.md). Project management happens in Linear: [Hubber project](https://linear.app/elug/project/hubber-d87743f1ed72) (team `HUB`). Each milestone below is a Linear milestone (M0–M6), and each bullet is an issue (HUB-1 … HUB-36). Commits reference the Linear issue (`HUB-<n>: …`).

## 1. Architecture

```
┌──────────────────────────┐     ┌──────────────────────────┐
│ apps/mobile (Expo Router)│     │ apps/web (Next.js)       │
│ iOS · Android · web app  │     │ public pages only:       │
│ (logged-in experience)   │     │ landing, /e/[id], /i/[code]│
└────────────┬─────────────┘     └────────────┬─────────────┘
             │ Convex React client (live queries)
             ▼                                ▼
┌──────────────────────────────────────────────────────────┐
│ packages/backend — Convex (EU, Dublin)                    │
│ schema · queries · mutations · actions · crons · storage │
│ Convex Auth + Auth.js Vipps provider (OIDC)              │
└───────┬───────────────┬───────────────┬──────────────────┘
        ▼               ▼               ▼
   Vipps Login     Expo Push API    Kartverket/Geonorge
   (OIDC)          (APNs/FCM)       (addresses, kommuner)
```

**Monorepo:** pnpm workspaces plus Turborepo.

| Path               | Contents                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `apps/mobile`      | Expo SDK (latest), Expo Router, NativeWind (Tailwind), expo-notifications, expo-image-picker, i18next |
| `apps/web`         | Next.js App Router, Tailwind, server-rendered public event and invite pages with Open Graph images    |
| `packages/backend` | Convex functions and schema (`convex/`), shared by both apps                                          |
| `packages/shared`  | Zod schemas, types, date/time helpers (Europe/Oslo), design tokens                                    |
| `packages/i18n`    | `nb` and `en` message catalogs, with a CI check for missing keys                                      |

**Why these choices:** see the decision log in §6. Convex gives real-time data for chat and RSVPs out of the box, which matters a lot for a solo developer. Expo covers iOS, Android and the logged-in web app from one codebase. A small Next.js app handles only the pages that must be server-rendered for link previews and SEO.

## 2. Authentication: Vipps

- **Convex Auth** with the Auth.js provider `@auth/core/providers/vipps` (OIDC, PKCE + state + nonce).
- Scopes: `openid name phoneNumber email birthDate`, plus `address` if we use it for the default kommune.
- On first sign-in, compute age from `birthDate`; if under 18, reject without storing anything.
- The user record stores the Vipps `sub` (stable ID), name, phone, email and birth year (not the full date, once verified).
- On mobile, the flow runs through `expo-auth-session` / an in-app browser, which supports app-switch to the Vipps app.
- **Blocker:** Vipps requires a registered business (Norwegian org number), a business bank account, and a signed merchant agreement before you get _test_ credentials.
  - Action: register an ENK (enkeltpersonforetak) in Altinn / Brønnøysund; it's free and quick, and can be converted to an AS later. Then apply for Vipps Login on portal.vippsmobilepay.com.
  - Until credentials arrive, a **dev-only sign-in** (Convex Auth with a fake "Vipps" test profile, disabled in production builds) lets every other milestone proceed.

## 3. Data model (Convex)

| Table           | Key fields                                                                                                                                                                  | Indexes                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `users`         | vippsSub, name, phone, email, birthYear, photoId, locale, kommuneNr, deletedAt                                                                                              | by_vippsSub                                                  |
| `hubs`          | name, template (`class`/`kindergarten`/`family`/`friends`/`other`), iconId, ownerId, joinApproval                                                                           | —                                                            |
| `hubMembers`    | hubId, userId, role (`owner`/`admin`/`member`), status (`active`/`pending`), notifyLevel (`all`/`important`/`muted`)                                                        | by_hub, by_user, by_hub_user                                 |
| `invites`       | hubId, code, createdBy, expiresAt, revokedAt, uses                                                                                                                          | by_code, by_hub                                              |
| `conversations` | kind (`hub`/`event`/`dm`), hubId?, eventId?, lastMessageAt                                                                                                                  | by_hub, by_event                                             |
| `messages`      | conversationId, authorId, body, imageIds[], replyToId?, mentions[], editedAt, deletedAt                                                                                     | by_conversation_time                                         |
| `reactions`     | messageId, userId, emoji                                                                                                                                                    | by_message, by_message_user                                  |
| `readStates`    | conversationId, userId, lastReadAt                                                                                                                                          | by_user, by_conversation_user                                |
| `events`        | hubId?, visibility (`hub`/`public`), title, description, startsAt, endsAt, tz, place {text, lat, lon, kommuneNr}, coverId, capacity?, rsvpDeadline?, createdBy, cancelledAt | by_hub_start, by_public_kommune_start, search index on title |
| `rsvps`         | eventId, userId, status (`yes`/`maybe`/`no`), guests, note                                                                                                                  | by_event, by_user, by_event_user                             |
| `pushTokens`    | userId, token, platform                                                                                                                                                     | by_user                                                      |
| `notifications` | userId, kind, refId, createdAt, deliveredAt, bundledAt                                                                                                                      | by_user_time                                                 |
| `reports`       | reporterId, targetType, targetId, reason, status                                                                                                                            | by_status                                                    |
| `blocks`        | blockerId, blockedId                                                                                                                                                        | by_blocker, by_pair                                          |

**Access rules:** each query and mutation starts with `requireUser()` and a membership check (`requireHubMember(hubId)`). These are covered by `convex-test` unit tests.

## 4. Quality and operations

- **Tests:** Vitest + `convex-test` for backend rules (membership, RSVP, invites, age gate); React Native Testing Library for components; Playwright for `apps/web`; Maestro flows for mobile smoke tests (later).
- **CI (GitHub Actions):** typecheck, lint (ESLint + Prettier), unit tests, i18n key check, and Convex schema validation on every pull request. Preview deploys of `apps/web` on Vercel (EU region).
- **Mobile builds:** EAS Build plus EAS Update; TestFlight and Play internal testing for the beta.
- **Monitoring:** Sentry (EU data region) for the apps and the backend. Product analytics stay minimal and privacy-friendly (PostHog EU, cookieless; or none in the first version).
- **Branching:** commit and push directly to `main`; no feature branches or pull requests. Commit messages start with the Linear issue (`HUB-123: …`). Run `pnpm typecheck && pnpm lint && pnpm test` before every push.

## 5. Milestones

No fixed dates; milestones are ordered by dependency. Sizes: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks of focused solo work.

### M0 — Foundations

- Register an ENK and apply for a Vipps Login merchant agreement _(you; blocks M1 Vipps)_ — S
- Register domain (done: hubbr.no); trademark search for "Hubbr" (Patentstyret) _(you)_ — S
- Monorepo scaffold: pnpm, Turborepo, TypeScript strict, ESLint/Prettier — S
- Convex project in the EU region, schema skeleton, `convex-test` set-up — S
- Expo app skeleton: Expo Router tabs, NativeWind, design tokens, light/dark — M
- Next.js public-site skeleton with a landing page — S
- i18n set-up (`nb`, `en`) plus a CI key check — S
- GitHub Actions CI — S

### M1 — Identity

- Dev-only sign-in provider (until Vipps test credentials arrive) — S
- Vipps Login through Convex Auth (web and mobile app-switch) — M
- 18+ gate from `birthDate` — S
- Onboarding plus profile (photo, language) — M
- Account deletion (self-service, anonymises content) — M

### M2 — Hubs

- Create hub with templates — M
- Invite links (expiry, revoke, approval), QR code, SMS share — M
- Join flow, including the web invite page `/i/[code]` with link preview — M
- Members list, roles, remove member, transfer ownership — M

### M3 — Chat

- Conversations and messages with live updates, pagination — L
- Reactions, replies, mentions, edit/delete — M
- Images (Convex storage, client-side resize) — M
- Read state and unread counts — M
- Push notifications (Expo push), per-hub notify level, bundling of non-important messages — L

### M4 — Events (private)

- Create, edit and cancel events in a hub (Norwegian date/time, Europe/Oslo) — M
- RSVP (yes/maybe/no, guests, note), attendee list — M
- Event chat — S (reuses conversations)
- Reminders via Convex crons (24 hours before; before the RSVP deadline) — M
- Calendar tab plus ICS export / subscription URL — M
- Place search via Geonorge address API — S

### M5 — Public events and web

- Public visibility, rate limits — S
- Discover: filter by kommune, date and category — M
- Public event page `/e/[id]` (server-rendered, Open Graph image) with "Join with Vipps" — M
- Universal links / app links (hubbr.no opens the app) — S. Site and app config done 2026-10-13 (HUB-32); goes live with hosting on Vercel and the first native build

### M6 — Safety and beta launch

- Report, block, admin moderation actions — M
- Privacy policy, terms, DPA list; data-processing records — M _(text reviewed by you)_
- App Store / Play listings, screenshots, review readiness — M
- Closed beta: 3–5 school classes via TestFlight / Play internal testing, plus a feedback loop — M

### Later (Phase 2+)

Vipps ePayment (shared costs, event payments) with a fee · org plan for clubs and associations · direct messages · polls · files and albums · ticketing · Hubber Pluss.

## 6. Decision log (Jev-assisted)

Decisions are scored with **Jev** (TypeSafe System One) by calling the API directly. Low-confidence results are treated as input, not as the answer.

| Date       | Decision             | Jev result                                                                                                                            | Outcome                                                                                                                                     |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-11 | Monetization ranking | Pluss 51 · Org plan 50 · Payment fees 47 · Public sector 40 · Ticketing 39 · Affiliate 28 · Promoted 27 (min confidence down to 0.08) | Top three too close to call; we go with payments + org plan first. Ads-like models are ruled out.                                           |
| 2026-10-11 | Backend              | Convex 1.00. Re-checked with Convex downsides and reordered options: Convex 0.92 / Supabase 0.07                                      | **Convex** (matches your preference)                                                                                                        |
| 2026-10-11 | Chat implementation  | Build on our own backend 1.00 (vs Stream, Sendbird)                                                                                   | **Own chat on Convex**                                                                                                                      |
| 2026-10-11 | Frontend             | Expo app plus a small Next.js site for public pages 0.99                                                                              | **Expo Router + Next.js (public pages only)**                                                                                               |
| 2026-10-11 | Leading segment      | School parents 0.64 / friends & families 0.36 (confidence 0.28)                                                                       | Low confidence; **school parents** lead, both are supported via templates                                                                   |
| 2026-10-11 | Name                 | Hubber 0.97 vs Hubby; "has unwanted meaning" 0.37 (inconclusive)                                                                      | **Hubber** as working name, pending trademark and domain check                                                                              |
| 2026-10-12 | Tab bar              | Custom JS tabs 1.00 (asked twice, options reversed, downsides stated) vs NativeTabs                                                   | **Expo Router JS Tabs** styled to the design, Lucide icons                                                                                  |
| 2026-10-12 | Name and domain      | Not asked (owner's choice)                                                                                                            | **Hubbr**, domain **hubbr.no** (bought). Invite and universal links use hubbr.no; app and repo keep the name Hubber until renamed           |
| 2026-10-12 | Styling              | Not asked: NativeWind 4.2.7 officially supports Expo SDK 57; v5 is still a release candidate                                          | **NativeWind 4.2.7 + Tailwind 3.4**, colours as CSS variables from `@hubber/shared`                                                         |
| 2026-10-12 | Platform focus       | Not asked (founder's call)                                                                                                            | **Mobile app only (iOS, Android).** Next.js site (`apps/web`) and Expo web paused; code kept. HUB-4/31/32 to Backlog, HUB-16 is in-app only |

## 7. Open items for you

1. Register an ENK and apply to Vipps — **postponed**. Development continues with the dev-only sign-in; real Vipps sign-in (HUB issue in M1) stays blocked until then.
2. Domain registered: **hubbr.no** (2026-10-12). Trademark search for "Hubbr" still to do.
3. Delete the old `master` branch on GitHub (`main` is now default and contains all of `master`).
