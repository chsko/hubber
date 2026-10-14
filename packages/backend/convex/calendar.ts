import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, type QueryCtx, query } from "./_generated/server";
import { getUserId, requireUser } from "./lib/auth";
import { endOf, eventAccess, eventSummary } from "./lib/events";
import type { IcsEvent } from "./lib/ics";

/**
 * The Calendar tab and calendar export (HUB-27). The calendar holds every
 * event in the hubs you're in, except the ones you said no to.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** The longest range the Calendar tab asks for at once (a month view plus margins). */
const MAX_RANGE_MS = 62 * DAY_MS;
/** What the subscription feed covers. */
const FEED_PAST_MS = 60 * DAY_MS;
const FEED_FUTURE_MS = 365 * DAY_MS;
/** Secret feed tokens: 32 characters from a 32-letter alphabet, 160 bits. */
const TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TOKEN_LENGTH = 32;

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

/**
 * Events that overlap [from, to), soonest first: those in the user's active
 * hubs, plus public events elsewhere they said yes or maybe to (HUB-29).
 */
async function eventsFor(ctx: QueryCtx, userId: Id<"users">, from: number, to: number) {
  const memberships = await ctx.db
    .query("hubMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const events: { event: Doc<"events">; hub: Doc<"hubs"> | null }[] = [];
  for (const m of memberships) {
    if (m.status !== "active") continue;
    const hub = await ctx.db.get(m.hubId);
    if (hub === null) continue;
    // Starting up to a day before `from` may still be going on.
    const rows = await ctx.db
      .query("events")
      .withIndex("by_hub_start", (q) =>
        q
          .eq("hubId", m.hubId)
          .gte("startsAt", from - DAY_MS)
          .lt("startsAt", to),
      )
      .collect();
    for (const event of rows) {
      if (endOf(event) >= from) events.push({ event, hub });
    }
  }
  const seen = new Set(events.map((e) => e.event._id));
  const user = await ctx.db.get(userId);
  const rsvps = await ctx.db
    .query("rsvps")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const r of rsvps) {
    if (r.status === "no" || seen.has(r.eventId) || user === null) continue;
    const event = await ctx.db.get(r.eventId);
    if (event?.visibility !== "public" || event.startsAt >= to || endOf(event) < from) continue;
    if ((await eventAccess(ctx, event, user)) === null) continue;
    events.push({ event, hub: event.hubId ? await ctx.db.get(event.hubId) : null });
  }
  return events.sort((a, b) => a.event.startsAt - b.event.startsAt);
}

/** The Calendar tab: events overlapping [from, to), at most about two months. */
export const range = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (userId === null || args.to <= args.from) return [];
    const to = Math.min(args.to, args.from + MAX_RANGE_MS);
    const rows = await eventsFor(ctx, userId, args.from, to);
    const views = await Promise.all(
      rows.map(async ({ event, hub }) => ({
        ...(await eventSummary(ctx, event, userId)),
        hubName: hub?.name ?? null,
        hubEmoji: hub?.emoji ?? null,
      })),
    );
    return views.filter((e) => e.myRsvp !== "no");
  },
});

/** The signed-in user's feed token, or null if they haven't made a link. */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return row?.token ?? null;
  },
});

/**
 * Makes (or with `reset`, replaces) the secret subscription link. Replacing
 * it stops the old link working, e.g. if it was shared by mistake.
 */
export const createFeed = mutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (row !== null && args.reset !== true) return row.token;
    const token = newToken();
    if (row === null) await ctx.db.insert("calendarFeeds", { userId: user._id, token });
    else await ctx.db.patch(row._id, { token });
    return token;
  },
});

/** Turns the subscription link off. */
export const deleteFeed = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const row = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (row !== null) await ctx.db.delete(row._id);
  },
});

function toIcsEvent(event: Doc<"events">, hub: Doc<"hubs"> | null, now: number): IcsEvent {
  return {
    id: event._id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: endOf(event),
    place: event.place?.text ?? null,
    description: [event.description, hub?.name].filter(Boolean).join("\n\n"),
    url: `hubbr://event/${event._id}`,
    cancelled: event.cancelledAt !== undefined,
    updatedAt: now,
  };
}

/**
 * The events behind a feed token, for the `/calendar/` HTTP route: the whole
 * feed, or with `eventId` just that one ("Add to my calendar"). Null for an
 * unknown token or an event the user can't see.
 */
export const feedEvents = internalQuery({
  args: { token: v.string(), eventId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("calendarFeeds")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    const user = row ? await ctx.db.get(row.userId) : null;
    if (row === null || user === null || user.deletedAt !== undefined) return null;
    const now = Date.now();
    const name = "Hubbr";

    if (args.eventId !== undefined) {
      const eventId = ctx.db.normalizeId("events", args.eventId);
      const event = eventId ? await ctx.db.get(eventId) : null;
      if (event === null || (await eventAccess(ctx, event, user)) === null) return null;
      const hub = event.hubId ? await ctx.db.get(event.hubId) : null;
      return { name, events: [toIcsEvent(event, hub, now)] };
    }

    const rows = await eventsFor(ctx, user._id, now - FEED_PAST_MS, now + FEED_FUTURE_MS);
    const declined = new Set(
      (
        await ctx.db
          .query("rsvps")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect()
      )
        .filter((r) => r.status === "no")
        .map((r) => r.eventId),
    );
    return {
      name,
      events: rows
        .filter(({ event }) => !declined.has(event._id))
        .map(({ event, hub }) => toIcsEvent(event, hub, now)),
    };
  },
});
