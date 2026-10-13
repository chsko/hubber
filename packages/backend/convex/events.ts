import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { getHubMember, getUserId, requireHubMember, requireUser } from "./lib/auth";
import { blockedWith } from "./lib/blocks";
import { requireImage } from "./lib/images";
import {
  DEFAULT_DURATION_MS,
  endOf,
  eventAccess,
  eventSummary,
  goingCount,
  rsvpRows,
} from "./lib/events";
import { hitRateLimit } from "./lib/rateLimit";
import { lastReadAt, unreadCount } from "./lib/unread";
import { eventCategory, rsvpStatus } from "./schema";

/**
 * Events in a hub (HUB-23), RSVP (HUB-24), event chat (HUB-25) and public
 * events with Discover (HUB-29, HUB-30). A hub event is for the hub's
 * members; a public event is for every signed-in user (see `eventAccess`).
 */
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 4000;
export const MAX_PLACE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 200;
export const MAX_GUESTS = 10;
export const MAX_CAPACITY = 1000;
/** Past events in a hub's list. */
const PAST_LIMIT = 20;
/** Public events one person can create per day (HUB-29). */
const PUBLIC_EVENT_LIMIT = { max: 5, windowMs: 24 * 60 * 60 * 1000 };
const DAY_MS = 24 * 60 * 60 * 1000;
/** Discover looks at most this far ahead in one query. */
const DISCOVER_MAX_RANGE_MS = 31 * DAY_MS;
const DISCOVER_LIMIT = 100;

type Ctx = QueryCtx | MutationCtx;

const eventFields = {
  title: v.string(),
  startsAt: v.number(),
  endsAt: v.optional(v.union(v.number(), v.null())),
  /** Free text, or an address picked from Geonorge's search (HUB-28). */
  place: v.optional(
    v.union(
      v.string(),
      v.null(),
      v.object({ text: v.string(), lat: v.number(), lon: v.number(), kommuneNr: v.string() }),
    ),
  ),
  description: v.optional(v.union(v.string(), v.null())),
  coverId: v.optional(v.union(v.id("_storage"), v.null())),
  capacity: v.optional(v.union(v.number(), v.null())),
  rsvpDeadline: v.optional(v.union(v.number(), v.null())),
  reminders: v.optional(v.boolean()),
  /** Public events: a category, and the kommune when the place wasn't picked from search. */
  category: v.optional(v.union(eventCategory, v.null())),
  kommuneNr: v.optional(v.union(v.string(), v.null())),
};

function invalid(field: string): never {
  throw new ConvexError({ code: "INVALID_EVENT", field });
}

/** Trimmed text, undefined when empty; too long is an error. */
function optionalText(value: string | null | undefined, max: number, field: string) {
  const text = value?.trim() ?? "";
  if (text.length > max) invalid(field);
  return text.length > 0 ? text : undefined;
}

type Fields = {
  title: string;
  startsAt: number;
  endsAt?: number | null;
  place?: string | null | { text: string; lat: number; lon: number; kommuneNr: string };
  description?: string | null;
  coverId?: Id<"_storage"> | null;
  capacity?: number | null;
  rsvpDeadline?: number | null;
  reminders?: boolean;
  category?: Doc<"events">["category"] | null;
  kommuneNr?: string | null;
};

const KOMMUNE_NR = /^\d{4}$/;

/**
 * Validates the form; the result is a full patch, with `undefined` clearing a
 * field. A public event needs a category and a kommune, for Discover.
 */
async function cleanFields(
  ctx: MutationCtx,
  args: Fields,
  visibility: Doc<"events">["visibility"],
) {
  const title = args.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) invalid("title");
  if (!Number.isFinite(args.startsAt)) invalid("startsAt");
  const endsAt = args.endsAt ?? undefined;
  if (endsAt !== undefined && endsAt <= args.startsAt) invalid("endsAt");
  const capacity = args.capacity ?? undefined;
  if (
    capacity !== undefined &&
    (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY)
  ) {
    invalid("capacity");
  }
  const rsvpDeadline = args.rsvpDeadline ?? undefined;
  if (rsvpDeadline !== undefined && rsvpDeadline > args.startsAt) invalid("rsvpDeadline");
  const coverId = args.coverId ?? undefined;
  if (coverId !== undefined) await requireImage(ctx, coverId);
  const picked = typeof args.place === "object" && args.place !== null ? args.place : null;
  const rawPlace = typeof args.place === "string" ? args.place : (picked?.text ?? null);
  const placeText = optionalText(rawPlace, MAX_PLACE_LENGTH, "place");
  const geo =
    picked && placeText !== undefined && KOMMUNE_NR.test(picked.kommuneNr)
      ? { lat: picked.lat, lon: picked.lon, kommuneNr: picked.kommuneNr }
      : null;
  const manualKommune = args.kommuneNr ?? undefined;
  if (manualKommune !== undefined && !KOMMUNE_NR.test(manualKommune)) invalid("kommuneNr");
  const kommuneNr = geo?.kommuneNr ?? manualKommune;
  const isPublic = visibility === "public";
  const category = isPublic ? (args.category ?? undefined) : undefined;
  if (isPublic && category === undefined) invalid("category");
  if (isPublic && kommuneNr === undefined) invalid("kommuneNr");
  return {
    title,
    startsAt: args.startsAt,
    endsAt,
    place:
      placeText === undefined
        ? undefined
        : { text: placeText, ...(geo && { lat: geo.lat, lon: geo.lon }) },
    kommuneNr,
    category,
    description: optionalText(args.description, MAX_DESCRIPTION_LENGTH, "description"),
    coverId,
    capacity,
    rsvpDeadline,
    remindersOff: args.reminders === false ? true : undefined,
  };
}

/** Reminders go out this long before the start (HUB-26)... */
export const START_REMINDER_MS = 24 * 60 * 60 * 1000;
/** ...and this long before the reply deadline, to those who haven't answered. */
export const DEADLINE_REMINDER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * (Re)schedules an event's reminders: cancels the old ones and, unless the
 * event is cancelled or the host turned them off, schedules those still ahead.
 */
export async function scheduleReminders(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (event === null) return;
  for (const job of event.reminderJobs ?? []) {
    const scheduled = await ctx.db.system.get(job);
    if (scheduled?.state.kind === "pending") await ctx.scheduler.cancel(job);
  }
  const jobs: Id<"_scheduled_functions">[] = [];
  const now = Date.now();
  if (event.cancelledAt === undefined && event.remindersOff !== true) {
    const startAt = event.startsAt - START_REMINDER_MS;
    if (startAt > now) {
      jobs.push(
        await ctx.scheduler.runAt(startAt, internal.push.remind, { eventId, kind: "start" }),
      );
    }
    const deadlineAt = (event.rsvpDeadline ?? 0) - DEADLINE_REMINDER_MS;
    if (event.rsvpDeadline !== undefined && deadlineAt > now) {
      jobs.push(
        await ctx.scheduler.runAt(deadlineAt, internal.push.remind, { eventId, kind: "deadline" }),
      );
    }
  }
  await ctx.db.patch(eventId, { reminderJobs: jobs.length > 0 ? jobs : undefined });
}

/** The event plus what the signed-in user may do with it, or null if they can't see it. */
async function getEvent(ctx: Ctx, eventId: Id<"events">) {
  const userId = await getUserId(ctx);
  const user = userId === null ? null : await ctx.db.get(userId);
  const event = await ctx.db.get(eventId);
  if (user === null || user.deletedAt !== undefined || event === null) return null;
  const access = await eventAccess(ctx, event, user);
  return access === null ? null : { event, user, ...access };
}

async function requireEvent(ctx: Ctx, eventId: Id<"events">) {
  await requireUser(ctx);
  const access = await getEvent(ctx, eventId);
  if (access === null) throw new ConvexError({ code: "FORBIDDEN" });
  return access;
}

/** The host and, for an event in a hub, the hub's admins can edit and cancel. */
async function requireManager(ctx: MutationCtx, eventId: Id<"events">) {
  const access = await requireEvent(ctx, eventId);
  if (!access.canManage) throw new ConvexError({ code: "FORBIDDEN" });
  return access;
}

async function eventConversation(ctx: Ctx, eventId: Id<"events">) {
  return ctx.db
    .query("conversations")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .first();
}

/**
 * Creates an event (HUB-23): in a hub for its members, or public (HUB-29),
 * either on behalf of a hub or on its own. The host is marked as going and
 * the event gets its own chat. In a hub, a card is posted in the hub chat
 * and members are told.
 */
export const create = mutation({
  args: {
    hubId: v.optional(v.id("hubs")),
    visibility: v.optional(v.union(v.literal("hub"), v.literal("public"))),
    ...eventFields,
  },
  handler: async (ctx, { hubId, visibility = "hub", ...args }) => {
    const user =
      hubId === undefined ? await requireUser(ctx) : (await requireHubMember(ctx, hubId)).user;
    if (visibility === "hub" && hubId === undefined) invalid("hubId");
    const fields = await cleanFields(ctx, args, visibility);
    if (fields.startsAt < Date.now() - DEFAULT_DURATION_MS) invalid("startsAt");
    if (
      visibility === "public" &&
      !(await hitRateLimit(ctx, `publicEvent:${user._id}`, PUBLIC_EVENT_LIMIT))
    ) {
      throw new ConvexError({ code: "RATE_LIMITED" });
    }
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      ...(hubId !== undefined && { hubId }),
      visibility,
      createdBy: user._id,
      ...withoutUndefined(fields),
    });
    await ctx.db.insert("rsvps", { eventId, userId: user._id, status: "yes", guests: 0 });
    await ctx.db.insert("conversations", { kind: "event", eventId });

    if (hubId !== undefined) {
      const hubChat = await ctx.db
        .query("conversations")
        .withIndex("by_hub", (q) => q.eq("hubId", hubId))
        .filter((q) => q.eq(q.field("kind"), "hub"))
        .first();
      if (hubChat !== null) {
        await ctx.db.insert("messages", {
          conversationId: hubChat._id,
          authorId: user._id,
          body: "",
          imageIds: [],
          mentions: [],
          eventId,
        });
        await ctx.db.patch(hubChat._id, { lastMessageAt: now });
      }
      await ctx.db.patch(hubId, { lastActivityAt: now });
    }
    await scheduleReminders(ctx, eventId);
    await ctx.scheduler.runAfter(0, internal.push.onEvent, {
      eventId,
      change: "new",
      actorId: user._id,
    });
    return eventId;
  },
});

/** Drops undefined values, for inserts under exactOptionalPropertyTypes. */
function withoutUndefined<T extends Record<string, unknown>>(fields: T) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

/**
 * Edits an event (host or hub admin). People who said yes or maybe are told
 * when the time or place changes.
 */
export const update = mutation({
  args: { eventId: v.id("events"), ...eventFields },
  handler: async (ctx, { eventId, ...args }) => {
    const { event, user } = await requireManager(ctx, eventId);
    if (event.cancelledAt !== undefined) throw new ConvexError({ code: "EVENT_CANCELLED" });
    const fields = await cleanFields(ctx, args, event.visibility);
    if (event.coverId !== undefined && event.coverId !== fields.coverId) {
      await ctx.storage.delete(event.coverId);
    }
    await ctx.db.patch(eventId, fields);
    await scheduleReminders(ctx, eventId);
    const moved =
      fields.startsAt !== event.startsAt ||
      fields.endsAt !== event.endsAt ||
      fields.place?.text !== event.place?.text;
    if (moved) {
      await ctx.scheduler.runAfter(0, internal.push.onEvent, {
        eventId,
        change: "changed",
        actorId: user._id,
      });
    }
  },
});

/** Cancels an event (host or hub admin) and tells everyone who said yes or maybe. */
export const cancel = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, user } = await requireManager(ctx, args.eventId);
    if (event.cancelledAt !== undefined) return;
    await ctx.db.patch(event._id, { cancelledAt: Date.now() });
    await scheduleReminders(ctx, event._id);
    await ctx.scheduler.runAfter(0, internal.push.onEvent, {
      eventId: event._id,
      change: "cancelled",
      actorId: user._id,
    });
  },
});

/** One event for the event screen; null for those who can't see it. */
export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const access = await getEvent(ctx, args.eventId);
    if (access === null) return null;
    const { event, user } = access;
    const hub = event.hubId ? await ctx.db.get(event.hubId) : null;
    const host = await ctx.db.get(event.createdBy);
    const rows = await rsvpRows(ctx, event._id);
    const mine = rows.find((r) => r.userId === user._id) ?? null;
    const conversation = access.inChat ? await eventConversation(ctx, event._id) : null;
    const since = conversation
      ? await lastReadAt(ctx, conversation._id, user._id, access.chatSince)
      : 0;
    const now = Date.now();
    const going = goingCount(rows);
    return {
      ...(await eventSummary(ctx, event, user._id)),
      description: event.description ?? null,
      coverUrl: event.coverId ? await ctx.storage.getUrl(event.coverId) : null,
      coverId: event.coverId ?? null,
      capacity: event.capacity ?? null,
      rsvpDeadline: event.rsvpDeadline ?? null,
      reminders: event.remindersOff !== true,
      placeGeo:
        event.place?.lat !== undefined && event.place.lon !== undefined && event.kommuneNr
          ? { lat: event.place.lat, lon: event.place.lon, kommuneNr: event.kommuneNr }
          : null,
      hub: hub ? { _id: hub._id, name: hub.name, emoji: hub.emoji ?? null } : null,
      host: {
        _id: event.createdBy,
        name: host && host.deletedAt === undefined ? (host.name ?? null) : null,
        verified: host?.vippsSub !== undefined,
      },
      kommuneNr: event.kommuneNr ?? null,
      /** Whether the user is in the event's hub; others see a public event from outside. */
      inHub: access.member !== null,
      canManage: access.canManage,
      my: mine ? { status: mine.status, guests: mine.guests, note: mine.note ?? null } : null,
      counts: {
        yes: going,
        maybe: rows.filter((r) => r.status === "maybe").length,
        no: rows.filter((r) => r.status === "no").length,
      },
      full: event.capacity !== undefined && going >= event.capacity,
      rsvpClosed:
        event.cancelledAt !== undefined ||
        endOf(event) < now ||
        (event.rsvpDeadline !== undefined && event.rsvpDeadline < now),
      past: endOf(event) < now,
      conversationId: conversation?._id ?? null,
      chatUnread: conversation ? await unreadCount(ctx, conversation._id, user._id, since) : 0,
    };
  },
});

/** A hub's events: upcoming (soonest first) and recent past ones. Empty for non-members. */
export const forHub = query({
  args: { hubId: v.id("hubs") },
  handler: async (ctx, args) => {
    const member = await getHubMember(ctx, args.hubId);
    if (member === null) return { upcoming: [], past: [] };
    const now = Date.now();
    // Started up to a day ago may still be going on; check the end time below.
    const upcomingRows = await ctx.db
      .query("events")
      .withIndex("by_hub_start", (q) =>
        q.eq("hubId", args.hubId).gte("startsAt", now - 24 * 60 * 60 * 1000),
      )
      .collect();
    const pastRows = await ctx.db
      .query("events")
      .withIndex("by_hub_start", (q) => q.eq("hubId", args.hubId).lt("startsAt", now))
      .order("desc")
      .take(PAST_LIMIT + 24);
    const upcoming = upcomingRows.filter((e) => endOf(e) >= now);
    const past = pastRows.filter((e) => endOf(e) < now).slice(0, PAST_LIMIT);
    const summary = (e: Doc<"events">) => eventSummary(ctx, e, member.user._id);
    return {
      upcoming: await Promise.all(upcoming.map(summary)),
      past: await Promise.all(past.map(summary)),
    };
  },
});

/**
 * Events the signed-in user is going to or might go to, from now on, for
 * Home's "Next up" and the Calendar. Only events they can still see.
 */
export const mine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const member = await getUserId(ctx);
    const user = member === null ? null : await ctx.db.get(member);
    if (member === null || user === null || user.deletedAt !== undefined) return [];
    const now = Date.now();
    const rows = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("userId", member))
      .collect();
    const events = [];
    for (const r of rows) {
      if (r.status === "no") continue;
      const event = await ctx.db.get(r.eventId);
      if (event === null || event.cancelledAt !== undefined || endOf(event) < now) continue;
      if ((await eventAccess(ctx, event, user)) === null) continue;
      const hub = event.hubId ? await ctx.db.get(event.hubId) : null;
      events.push({
        ...(await eventSummary(ctx, event, member)),
        hubName: hub?.name ?? null,
        hubEmoji: hub?.emoji ?? null,
      });
    }
    events.sort((a, b) => a.startsAt - b.startsAt);
    return events.slice(0, Math.min(args.limit ?? 50, 100));
  },
});

/**
 * Going / Maybe / No for the signed-in user (HUB-24), with guests and a
 * short note. Respects the deadline and the capacity.
 */
export const rsvp = mutation({
  args: {
    eventId: v.id("events"),
    status: rsvpStatus,
    guests: v.optional(v.number()),
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { event, user } = await requireEvent(ctx, args.eventId);
    const now = Date.now();
    if (event.cancelledAt !== undefined) throw new ConvexError({ code: "EVENT_CANCELLED" });
    if (endOf(event) < now || (event.rsvpDeadline !== undefined && event.rsvpDeadline < now)) {
      throw new ConvexError({ code: "RSVP_CLOSED" });
    }
    const rows = await rsvpRows(ctx, event._id);
    const existing = rows.find((r) => r.userId === user._id) ?? null;
    const guests = args.status === "yes" ? (args.guests ?? existing?.guests ?? 0) : 0;
    if (!Number.isInteger(guests) || guests < 0 || guests > MAX_GUESTS) {
      throw new ConvexError({ code: "INVALID_RSVP" });
    }
    const note =
      args.note === undefined ? existing?.note : optionalText(args.note, MAX_NOTE_LENGTH, "note");
    if (args.status === "yes" && event.capacity !== undefined) {
      const others = goingCount(rows.filter((r) => r.userId !== user._id));
      if (others + 1 + guests > event.capacity) throw new ConvexError({ code: "EVENT_FULL" });
    }
    if (existing === null) {
      await ctx.db.insert("rsvps", {
        eventId: event._id,
        userId: user._id,
        status: args.status,
        guests,
        ...(note !== undefined && { note }),
      });
    } else {
      await ctx.db.replace(existing._id, {
        eventId: event._id,
        userId: user._id,
        status: args.status,
        guests,
        ...(note !== undefined && { note }),
      });
    }
  },
});

/**
 * Who's coming: Going / Maybe / No / No reply (HUB-24). For a hub event, its
 * members see it; for a public one, only those in its chat (the host and
 * those going or maybe), so strangers can't list who's coming.
 */
export const attendees = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const access = await getEvent(ctx, args.eventId);
    if (access === null || !access.inChat) return null;
    const rows = await rsvpRows(ctx, args.eventId);
    const members =
      access.event.visibility === "hub" && access.event.hubId !== undefined
        ? await ctx.db
            .query("hubMembers")
            .withIndex("by_hub", (q) => q.eq("hubId", access.event.hubId!))
            .collect()
        : [];
    const person = async (userId: Id<"users">) => {
      const user = await ctx.db.get(userId);
      const gone = user === null || user.deletedAt !== undefined;
      return {
        _id: userId,
        name: gone ? null : (user.name ?? null),
        photoUrl: !gone && user.photoId ? await ctx.storage.getUrl(user.photoId) : null,
        isMe: userId === access.user._id,
      };
    };
    const byStatus = async (status: Doc<"rsvps">["status"]) =>
      Promise.all(
        rows
          .filter((r) => r.status === status)
          .map(async (r) => ({
            ...(await person(r.userId)),
            guests: r.guests,
            note: r.note ?? null,
          })),
      );
    const replied = new Set(rows.map((r) => r.userId));
    return {
      yes: await byStatus("yes"),
      maybe: await byStatus("maybe"),
      no: await byStatus("no"),
      noReply: await Promise.all(
        members
          .filter((m) => m.status === "active" && !replied.has(m.userId))
          .map((m) => person(m.userId)),
      ),
    };
  },
});

/**
 * Discover (HUB-30): public events in a kommune (or all of Norway) that
 * overlap [from, to), optionally by category or a title search. Ordered by
 * start time only: no ranking and no recommendations.
 */
export const discover = query({
  args: {
    kommuneNr: v.optional(v.union(v.string(), v.null())),
    from: v.number(),
    to: v.number(),
    category: v.optional(v.union(eventCategory, v.null())),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const user = userId === null ? null : await ctx.db.get(userId);
    if (user === null || user.deletedAt !== undefined) return [];
    const now = Date.now();
    const from = Math.max(args.from, now);
    const to = Math.min(args.to, from + DISCOVER_MAX_RANGE_MS);
    if (to <= from) return [];
    const kommuneNr = args.kommuneNr ?? undefined;
    const category = args.category ?? undefined;
    const search = args.search?.trim() ?? "";

    let rows: Doc<"events">[];
    if (search.length > 0) {
      rows = await ctx.db
        .query("events")
        .withSearchIndex("search_title", (q) => {
          let query = q.search("title", search).eq("visibility", "public");
          if (kommuneNr !== undefined) query = query.eq("kommuneNr", kommuneNr);
          if (category !== undefined) query = query.eq("category", category);
          return query;
        })
        .take(DISCOVER_LIMIT * 2);
      rows = rows.filter((e) => e.startsAt >= from - DAY_MS && e.startsAt < to);
    } else {
      // Started up to a day before `from` may still be going on.
      const base =
        kommuneNr === undefined
          ? ctx.db.query("events").withIndex("by_visibility_start", (q) =>
              q
                .eq("visibility", "public")
                .gte("startsAt", from - DAY_MS)
                .lt("startsAt", to),
            )
          : ctx.db.query("events").withIndex("by_visibility_kommune_start", (q) =>
              q
                .eq("visibility", "public")
                .eq("kommuneNr", kommuneNr)
                .gte("startsAt", from - DAY_MS)
                .lt("startsAt", to),
            );
      rows = await base
        .filter((q) =>
          q.and(
            q.eq(q.field("cancelledAt"), undefined),
            category === undefined ? true : q.eq(q.field("category"), category),
          ),
        )
        .take(DISCOVER_LIMIT * 2);
    }
    const blocked = await blockedWith(ctx, user._id);
    const events = rows
      .filter((e) => e.cancelledAt === undefined && endOf(e) >= from && !blocked.has(e.createdBy))
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, DISCOVER_LIMIT);
    return Promise.all(
      events.map(async (e) => {
        const host = await ctx.db.get(e.createdBy);
        const hub = e.hubId ? await ctx.db.get(e.hubId) : null;
        return {
          ...(await eventSummary(ctx, e, user._id)),
          kommuneNr: e.kommuneNr ?? null,
          hostName: host && host.deletedAt === undefined ? (host.name ?? null) : null,
          hubName: hub?.name ?? null,
        };
      }),
    );
  },
});
