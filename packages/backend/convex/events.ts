import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { getHubMember, getUserId, requireHubMember } from "./lib/auth";
import { requireImage } from "./lib/images";
import { lastReadAt, unreadCount } from "./lib/unread";
import { rsvpStatus } from "./schema";

/**
 * Events in a hub (HUB-23), RSVP (HUB-24) and event chat (HUB-25).
 * Only the hub's members see an event; public events come in M5.
 */
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 4000;
export const MAX_PLACE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 200;
export const MAX_GUESTS = 10;
export const MAX_CAPACITY = 1000;
/** Past events in a hub's list. */
const PAST_LIMIT = 20;
/** An event without an end time counts as ongoing this long after it starts. */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

type Ctx = QueryCtx | MutationCtx;

const eventFields = {
  title: v.string(),
  startsAt: v.number(),
  endsAt: v.optional(v.union(v.number(), v.null())),
  place: v.optional(v.union(v.string(), v.null())),
  description: v.optional(v.union(v.string(), v.null())),
  coverId: v.optional(v.union(v.id("_storage"), v.null())),
  capacity: v.optional(v.union(v.number(), v.null())),
  rsvpDeadline: v.optional(v.union(v.number(), v.null())),
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
  place?: string | null;
  description?: string | null;
  coverId?: Id<"_storage"> | null;
  capacity?: number | null;
  rsvpDeadline?: number | null;
};

/** Validates the form; the result is a full patch, with `undefined` clearing a field. */
async function cleanFields(ctx: MutationCtx, args: Fields) {
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
  const placeText = optionalText(args.place, MAX_PLACE_LENGTH, "place");
  return {
    title,
    startsAt: args.startsAt,
    endsAt,
    place: placeText === undefined ? undefined : { text: placeText },
    description: optionalText(args.description, MAX_DESCRIPTION_LENGTH, "description"),
    coverId,
    capacity,
    rsvpDeadline,
  };
}

/** The event plus the caller's membership of its hub, or null for non-members. */
async function getEventMember(ctx: Ctx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (event?.hubId === undefined) return null;
  const member = await getHubMember(ctx, event.hubId);
  return member === null ? null : { event, hubId: event.hubId, ...member };
}

async function requireEventMember(ctx: Ctx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (event?.hubId === undefined) throw new ConvexError({ code: "FORBIDDEN" });
  return { event, hubId: event.hubId, ...(await requireHubMember(ctx, event.hubId)) };
}

/** The host and hub admins can edit and cancel. */
function canManage(event: Doc<"events">, user: Doc<"users">, membership: Doc<"hubMembers">) {
  return event.createdBy === user._id || membership.role !== "member";
}

async function requireManager(ctx: MutationCtx, eventId: Id<"events">) {
  const access = await requireEventMember(ctx, eventId);
  if (!canManage(access.event, access.user, access.membership)) {
    throw new ConvexError({ code: "FORBIDDEN" });
  }
  return access;
}

async function eventConversation(ctx: Ctx, eventId: Id<"events">) {
  return ctx.db
    .query("conversations")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .first();
}

async function rsvpRows(ctx: Ctx, eventId: Id<"events">) {
  return ctx.db
    .query("rsvps")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
}

/** People coming (yes), counting their guests. */
function goingCount(rows: Doc<"rsvps">[]) {
  return rows.filter((r) => r.status === "yes").reduce((sum, r) => sum + 1 + r.guests, 0);
}

function endOf(event: Doc<"events">) {
  return event.endsAt ?? event.startsAt + DEFAULT_DURATION_MS;
}

/** What a list row needs: title, time, place, and how it stands for me. */
async function eventSummary(ctx: Ctx, event: Doc<"events">, userId: Id<"users">) {
  const rows = await rsvpRows(ctx, event._id);
  return {
    _id: event._id,
    hubId: event.hubId ?? null,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? null,
    place: event.place?.text ?? null,
    cancelled: event.cancelledAt !== undefined,
    going: goingCount(rows),
    myRsvp: rows.find((r) => r.userId === userId)?.status ?? null,
  };
}

/**
 * Creates an event in a hub (HUB-23). The host is marked as going, the event
 * gets its own chat, a card is posted in the hub chat, and members are told.
 */
export const create = mutation({
  args: { hubId: v.id("hubs"), ...eventFields },
  handler: async (ctx, { hubId, ...args }) => {
    const { user } = await requireHubMember(ctx, hubId);
    const fields = await cleanFields(ctx, args);
    if (fields.startsAt < Date.now() - DEFAULT_DURATION_MS) invalid("startsAt");
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      hubId,
      visibility: "hub",
      createdBy: user._id,
      ...withoutUndefined(fields),
    });
    await ctx.db.insert("rsvps", { eventId, userId: user._id, status: "yes", guests: 0 });
    await ctx.db.insert("conversations", { kind: "event", eventId });

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
    const fields = await cleanFields(ctx, args);
    if (event.coverId !== undefined && event.coverId !== fields.coverId) {
      await ctx.storage.delete(event.coverId);
    }
    await ctx.db.patch(eventId, fields);
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
    await ctx.scheduler.runAfter(0, internal.push.onEvent, {
      eventId: event._id,
      change: "cancelled",
      actorId: user._id,
    });
  },
});

/** One event for the event screen; null for non-members. */
export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const access = await getEventMember(ctx, args.eventId);
    if (access === null) return null;
    const { event, user, membership, hubId } = access;
    const hub = await ctx.db.get(hubId);
    const host = await ctx.db.get(event.createdBy);
    const rows = await rsvpRows(ctx, event._id);
    const mine = rows.find((r) => r.userId === user._id) ?? null;
    const conversation = await eventConversation(ctx, event._id);
    const since = conversation
      ? await lastReadAt(ctx, conversation._id, user._id, membership._creationTime)
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
      hub: hub ? { _id: hub._id, name: hub.name, emoji: hub.emoji ?? null } : null,
      host: {
        _id: event.createdBy,
        name: host && host.deletedAt === undefined ? (host.name ?? null) : null,
        verified: host?.vippsSub !== undefined,
      },
      canManage: canManage(event, user, membership),
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
 * Home's "Next up" and the Calendar. Only hubs they're still in.
 */
export const mine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const member = await getUserId(ctx);
    if (member === null) return [];
    const now = Date.now();
    const rows = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (q) => q.eq("userId", member))
      .collect();
    const events = [];
    for (const r of rows) {
      if (r.status === "no") continue;
      const event = await ctx.db.get(r.eventId);
      if (event?.hubId === undefined || event.cancelledAt !== undefined || endOf(event) < now) {
        continue;
      }
      if ((await getHubMember(ctx, event.hubId)) === null) continue;
      const hub = await ctx.db.get(event.hubId);
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
    const { event, user } = await requireEventMember(ctx, args.eventId);
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

/** Who's coming: Going / Maybe / No / No reply, for members (HUB-24). */
export const attendees = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const access = await getEventMember(ctx, args.eventId);
    if (access === null) return null;
    const rows = await rsvpRows(ctx, args.eventId);
    const members = await ctx.db
      .query("hubMembers")
      .withIndex("by_hub", (q) => q.eq("hubId", access.hubId))
      .collect();
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
