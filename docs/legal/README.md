# Legal documents (HUB-34)

Drafts for Christian's review. **None of this is legal advice**; have a lawyer read it before the public launch.

| File                                                                  | What                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [personvern.nb.md](personvern.nb.md) / [privacy.en.md](privacy.en.md) | Privacy policy, to be published at hubbr.no/personvern (and /en/privacy)           |
| [vilkar.nb.md](vilkar.nb.md) / [terms.en.md](terms.en.md)             | Terms of use, to be published at hubbr.no/vilkar (and /en/terms)                   |
| This file                                                             | Records of processing (GDPR art. 30), processors, retention, and what's still open |

The Norwegian text is the main version. Keep both languages in step, and keep the policy true to the code: when a change adds data, a provider or a retention rule, update these files in the same commit.

## Open items before the beta

1. **Controller.** Fill in the controller's name, org. no. and postal address (the sole proprietorship from HUB-8, or Christian personally until it exists).
2. **Mailboxes.** Create personvern@hubbr.no and kontakt@hubbr.no.
3. **DPAs.** Accept or sign the data processing agreements: Convex (DPA in the dashboard/terms), Expo (check their DPA and whether it covers push and EAS Update), Vercel (when hosting is set up, pick an EU region). Store copies outside the repo.
4. **Backups.** Decide whether Convex backups are on and how long they are kept, then fill in "[XX] days".
5. **Vipps.** Confirm with Vipps how they describe the roles for Vipps Login (separate controllers) in the merchant agreement.
6. **Decisions for Christian**, already written into the drafts as the default:
   - Messages stay after account deletion, shown as from "Deleted user". Alternative: delete them too.
   - Handled reports are kept 12 months.
   - No deletion of inactive accounts. Alternative: delete accounts after e.g. 24 months without sign-in, with a warning.
7. **Publishing.** Publish on hubbr.no and link from the app (sign-in screen and Profile) once the website is hosted (HUB-32). The app stores need the privacy policy URL.
8. **Sentry/analytics.** Not used yet. Add them to the policy and the processor list before turning them on.

## Records of processing (art. 30)

**Controller:** see item 1. **Contact:** personvern@hubbr.no. **Data protection officer:** not required (no large-scale special-category processing or systematic monitoring).

| Purpose                    | Data subjects             | Personal data                                                                                        | Recipients                                   | Legal basis      | Retention                                                                                   |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| User accounts and sign-in  | Users                     | Name, phone, email, Vipps sub, birth year, photo, language, settings, sessions                       | Convex; Vipps (source)                       | 6(1)(b)          | Until account deletion                                                                      |
| Age check (18+)            | Users                     | Birth date (checked, not stored), birth year                                                         | Convex                                       | 6(1)(b), 6(1)(f) | Until account deletion                                                                      |
| Hubs, chat and events      | Users                     | Memberships, roles, messages, pictures, reactions, read state, events, places, RSVPs, notes, invites | Other hub members; Convex                    | 6(1)(b)          | Until deleted by the user or admin, or the hub closes; messages stay after account deletion |
| Push notifications         | Users who allow them      | Push token, platform, notification records                                                           | Expo, Apple, Google; Convex                  | 6(1)(b)          | Token until sign-out or deletion; records 30 days                                           |
| Calendar subscription      | Users who turn it on      | Feed token, events in the feed                                                                       | Anyone with the link (user's choice); Convex | 6(1)(b)          | Until reset, turned off or account deletion                                                 |
| Safety: reports and blocks | Reporters, reported users | Report reason, details, target, blocks                                                               | Controller only; police for serious crime    | 6(1)(f)          | Handled reports 12 months; blocks until removed or account deletion                         |
| Abuse limits               | Users                     | Rate-limit counters                                                                                  | Convex                                       | 6(1)(f)          | 7 days                                                                                      |
| Operations and security    | Users, website visitors   | IP address, device info, logs                                                                        | Convex, Expo, Vercel                         | 6(1)(f)          | Provider log retention, up to about 30 days                                                 |

No special categories of data (art. 9) are collected on purpose. Users could still write such things in chat; this is covered by the hub's own purpose and the reporting tools.

**Transfers outside the EEA:** Convex (US company, data in the EU), Expo (USA), Apple/Google (push delivery), Vercel (US company). Basis: EU Standard Contractual Clauses and, where the provider is certified, the EU–US Data Privacy Framework.

**Security measures:** Vipps-verified sign-in only; access checks on every backend function, covered by tests; TLS in transit; data stored in the EU; production keys kept out of the repo and out of logs; limited admin access; self-service deletion.

## Processors

| Provider                            | Role                                         | Data                                  | Location              | DPA            |
| ----------------------------------- | -------------------------------------------- | ------------------------------------- | --------------------- | -------------- |
| Convex, Inc.                        | Database, files, backend                     | Everything in the app                 | EU (Ireland)          | To accept      |
| 650 Industries, Inc. (Expo)         | Push relay, app updates (EAS Update), builds | Push tokens, notification content, IP | USA                   | To check       |
| Apple Inc. (APNs), Google LLC (FCM) | Push delivery                                | Device token, notification content    | USA/EU                | Platform terms |
| Vercel, Inc.                        | Website and invite pages (when live)         | IP, page requests                     | EU region (to choose) | To accept      |

Not processors: **Vipps MobilePay AS** (separate controller for Vipps Login) and **Kartverket** (the phone calls its public address API directly; no user ID is sent).

## Retention rules in code

| Rule                                                                                              | Where                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Account deletion removes personal data at once                                                    | `packages/backend/convex/account.ts`                                    |
| Deleting a message removes its text, pictures and reactions                                       | `messages.remove`                                                       |
| Closed hubs are deleted with chat, events and files                                               | `account.closeHub`                                                      |
| Notification records after 30 days, handled reports after 12 months, rate-limit rows after 7 days | `packages/backend/convex/retention.ts`, daily at 03:30 UTC (`crons.ts`) |
