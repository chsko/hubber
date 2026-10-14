# Hubbr — Product & Design

> Name **Hubbr** (from "hub"), domain **hubbr.no**, chosen 2026-10-12. It replaced the working names "Hubby" (English slang for husband) and "Hubber" (also the Norwegian plural of "hub", so the app's "Hubber" tab means "Hubs"). Trademark check at Patentstyret still pending.

## 1. Why Hubbr exists

Many Norwegians keep Facebook only to stay in their groups and to see events. Hubbr gives them exactly that — groups, chat and events — and nothing else.

**Product principles**

1. **Only real people.** Sign-in is Vipps only. Everyone is a verified adult with their real name. No anonymous accounts, no bots.
2. **No feed, no algorithm, no ads.** Content is shown chronologically, or by date and place for events. Nothing is boosted. We never sell data.
3. **Calm by default.** Notifications are for things that matter (a new event, a change, a mention). Everything else waits until you open the app.
4. **Fast to start.** You can create a hub and invite people in under a minute. Joining is one link plus Vipps.
5. **Norwegian first.** Bokmål and English from day one, with Norwegian conventions (24h clock, week starts Monday, kommune as location).

## 2. Who it's for (first version)

| Persona                        | Situation                                                                                                                              | What they need                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Klassekontakt / FAU parent** | Runs the class parents group, birthday parties, dugnad, class events. Today: a Facebook group plus a Messenger chat plus Spond or SMS. | One place for the class: chat, events with RSVP, a members list without exposing phone numbers.     |
| **Parent in the class**        | Wants info about their kid's class without joining Facebook.                                                                           | Join by link, see upcoming events, answer yes/no, mute chatter.                                     |
| **Family organizer**           | Coordinates the extended family: birthdays, Christmas, cabin trips.                                                                    | A family hub with a chat and events, and older relatives able to join easily (they all have Vipps). |
| **Friend group**               | Plans dinners, trips, parties.                                                                                                         | Chat plus quick events, and public events for larger gatherings.                                    |

**Leading segment:** school and kindergarten parent groups. Jev leaned this way (0.64 against 0.36, but with low confidence 0.28), and it has a clear seasonal moment: school start in August. Friend groups and families use the same product with different hub templates.

**Out of scope for now:** under-18s, people without Vipps, payments, organisations/clubs (later: org plan).

## 3. Core concepts

```
User (Vipps-verified adult)
 └── member of many Hubs
      ├── Hub chat (one main conversation per hub)
      ├── Events (private to the hub)
      │    └── Event chat (thread per event)
      └── Members (roles: owner, admin, member)

Public events (not tied to a hub's privacy)
 └── visible to every Hubbr user, discoverable by kommune + date, shareable link
```

- **Hub:** a group, created from a template (Class, Kindergarten, Family, Friends, Other). The template sets a default icon, the welcome text and the default notification rules.
- **Event:** title, start/end, place (free text or address via Kartverket), description, cover image, RSVP options (Yes / No / Maybe, plus guest count), optional RSVP deadline and capacity.
  - **Private event:** belongs to a hub. Only hub members can see it.
  - **Public event:** created by a user, optionally hosted "on behalf of" a hub. Listed in Discover, with a public web page and link previews. Joining requires Vipps sign-in.
- **Conversation:** the shared chat building block used by hub chat and event chat. Later also 1:1 direct messages.

## 4. Information architecture (app)

Bottom tabs:

1. **Home:** the next 3 events you've said Yes or Maybe to, hubs with unread messages, and pending invitations. No feed.
2. **Hubs:** list of your hubs, sorted by last activity, plus "Create hub".
3. **Calendar:** all your events (agenda list plus month view), with "Add to my calendar" (ICS / subscribe URL).
4. **Discover:** public events filtered by kommune, date range and category. Order is chronological or by distance only.
5. **Profile:** name (from Vipps), photo, language, notification settings, privacy, delete account.

**Hub screen:** a header (name, icon, member count, "Invite") with three segments: **Chat** · **Events** · **Members**.

**Event screen:** cover image, title, time, place (opens in the maps app), host, RSVP buttons, attendee list (Yes / Maybe / No / No reply, visible to members), description and event chat.

## 5. Key flows

### 5.1 Sign up / sign in (Vipps)

1. Landing screen shows the value proposition and one button: **"Fortsett med Vipps"** ("Continue with Vipps").
2. The Vipps app (or web flow) asks for consent to share name, phone number, email and birth date.
3. Server checks age ≥ 18 from `birthDate`. If under 18, a friendly rejection screen; nothing is stored.
4. Profile prefilled from Vipps (name is locked to the Vipps name), plus an optional photo. Pick language (default: device language).
5. If they arrived via an invite link, they go straight into that hub.

### 5.2 Create a hub and invite people

1. Hubs → **Create hub** → pick a template → name → optional icon or photo → done.
2. The invite sheet offers:
   - **Share link**: native share sheet, so Messenger/SMS/email all work.
   - **QR code**: for parent meetings.
   - **SMS to contacts**: opens the SMS composer with a prefilled link. We never upload the address book.
3. Invite links can expire, be revoked, or require admin approval (default: approval off for Family and Friends, on for Class and Kindergarten).

### 5.3 Join via link

`hubbr.no/i/{code}` opens a server-rendered web page showing the hub's name, icon and member count (no member names), with buttons **Open in app** / **Download the app** and **Continue in browser**. Then Vipps sign-in, then joined (or "waiting for admin approval").

### 5.4 Create an event

In a hub: Events → **+** → title, date/time (Norwegian date picker, 24h), place, description, RSVP settings, visibility (**Only this hub** / **Public**). Members get one push: "New event in 3B: Juleavslutning fre 13. des".

### 5.5 RSVP and reminders

- One tap on Yes / Maybe / No, with optional guest count and a short note.
- Automatic reminders: 24 hours before for Yes/Maybe, and 2 days before the RSVP deadline for those who haven't replied (the host can turn this off).
- The host sees counts and the list. Exporting the attendee list is a later feature.

### 5.6 Chat

- Text, emoji reactions, replies (quote), @mentions, images (several per message), link previews.
- Lightweight read state: unread counts per conversation, and "seen by N" on the latest message only.
- Edit within 15 minutes; delete your own message any time; admins can remove messages in their hub.
- Push notifications by default for @mentions, replies to you and new events. All other chat messages are bundled. The user can set each hub to _All_ / _Important only_ / _Muted_.

### 5.7 Discover public events

Filters: kommune (defaults to the one from the user's Vipps address or a manual choice), date (today / this weekend / next 30 days) and category. The list is ordered by start time. No recommendations, no ranking.

## 6. Trust, safety and privacy

- **Verified identity:** every user has a Vipps-verified name; the display name _is_ the Vipps name. A small badge shows "Verifisert med Vipps" ("Verified with Vipps").
- **Phone numbers and emails are never shown** to other users. They are used only for account recovery and notifications.
- **Report and block:** report a message, event, user or hub. Blocking hides each person's messages from the other and stops direct contact.
- **Hub admin tools:** approve joins, remove members, remove messages, transfer ownership.
- **Public events:** rate-limited per user, reportable; the creator's real name is shown.
- **Data:** hosted in the EU (Convex Dublin). Data minimisation: we store only what Vipps returns and what's needed. Account deletion is self-service and removes personal data (messages are shown as "Deleted user"). Privacy policy and terms (DPA list: Convex, Expo, Vipps, Sentry) are ready before beta.

## 7. Visual design

**Tone:** warm, calm, Nordic. It should feel like a tidy notice board in a kitchen, not a social network.

**Colour tokens** (light / dark):

| Token        | Light     | Dark      | Use                                          |
| ------------ | --------- | --------- | -------------------------------------------- |
| `bg`         | `#FAF8F5` | `#121413` | App background (warm off-white / near-black) |
| `surface`    | `#FFFFFF` | `#1C1F1E` | Cards, sheets                                |
| `text`       | `#1D2321` | `#ECEDEA` | Primary text                                 |
| `text-muted` | `#5F6B66` | `#9AA5A0` | Secondary text                               |
| `primary`    | `#2F5D50` | `#7FB8A6` | Pine green: primary buttons, active tab      |
| `accent`     | `#E8A33D` | `#F0B95E` | Warm amber: highlights, "Going" state        |
| `danger`     | `#C2410C` | `#F28B5B` | Destructive actions                          |
| `border`     | `#E6E1DA` | `#2A2F2D` | Dividers                                     |

- **Typography:** Figtree (UI) with tabular numbers for times. Sizes 13 / 15 / 17 / 20 / 28. Visual mockups: https://claude.ai/artifact/NLcpvB8gnKQVaqcbxRjQg2
- **Shape:** 12px radius on cards, 999px on pills and RSVP buttons. Generous spacing on an 8pt grid.
- **Icons:** Lucide.
- **Vipps button:** the official Vipps "Fortsett med Vipps" button assets, per Vipps brand guidelines.
- **Accessibility:** WCAG 2.2 AA contrast, Dynamic Type / font scaling, screen-reader labels, minimum 44pt touch targets.

### Key screens (wireframes)

```
┌ Home ─────────────────────┐   ┌ Hub: 3B Foreldre ─────────┐   ┌ Event ────────────────────┐
│ God kveld, Kari           │   │ [🎒] 3B Foreldre   Invite │   │ [ cover image           ] │
│                           │   │  24 members               │   │ Juleavslutning            │
│ NEXT UP                   │   │ ( Chat | Events | Members)│   │ Fre 13. des · 17:00–19:00 │
│ ┌───────────────────────┐ │   │                           │   │ Gymsalen, Lia skole  ↗    │
│ │ Fre 13 Juleavslutning │ │   │ Ola: Hvem tar med kake?   │   │ Host: Kari Nordmann ✓     │
│ │ 3B Foreldre · Going ✓ │ │   │ Kari: Jeg! 🎂     ❤️ 3    │   │                           │
│ └───────────────────────┘ │   │ ┌ 📅 New event ─────────┐ │   │ [ Going ][ Maybe ][ No ]  │
│ UNREAD                    │   │ │ Juleavslutning 13/12  │ │   │ 18 going · 3 maybe · 6 ?  │
│ 3B Foreldre          (4)  │   │ └───────────────────────┘ │   │                           │
│ Familien Hansen      (1)  │   │ [ Message…          ] [➤] │   │ Chat (12) ›               │
├───────────────────────────┤   ├───────────────────────────┤   ├───────────────────────────┤
│ Home Hubs Cal Disc Profile│   │                           │   │                           │
└───────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘
```

## 8. Monetization (later phases; nothing in the first version)

- Free core forever, with a written "no ads, no data selling" promise.
- **Phase 2:** payments via Vipps ePayment with a small fee (shared costs, event payments, class funds), and an **org plan** for clubs and associations.
- **Phase 3:** ticketing for public events, and **Hubbr Pluss** for individuals.
- Ruled out: promoted/sponsored content and affiliate links. Jev scored these lowest on brand fit (see the decision log in `docs/PLAN.md`).
