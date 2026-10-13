import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { blockedWith } from "./blocks";

/** An event without an end time counts as ongoing this long after it starts. */
export const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export async function rsvpRows(ctx: QueryCtx, eventId: Id<"events">) {
  return ctx.db
    .query("rsvps")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
}

/** People coming (yes), counting their guests. */
export function goingCount(rows: Doc<"rsvps">[]) {
  return rows.filter((r) => r.status === "yes").reduce((sum, r) => sum + 1 + r.guests, 0);
}

export function endOf(event: Doc<"events">) {
  return event.endsAt ?? event.startsAt + DEFAULT_DURATION_MS;
}

/** What a list row needs: title, time, place, and how it stands for me. */
export async function eventSummary(ctx: QueryCtx, event: Doc<"events">, userId: Id<"users">) {
  const rows = await rsvpRows(ctx, event._id);
  return {
    _id: event._id,
    hubId: event.hubId ?? null,
    visibility: event.visibility,
    category: event.category ?? null,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? null,
    place: event.place?.text ?? null,
    cancelled: event.cancelledAt !== undefined,
    going: goingCount(rows),
    myRsvp: rows.find((r) => r.userId === userId)?.status ?? null,
  };
}

type HubRole = Doc<"hubMembers">["role"];
export type NotifyLevel = Doc<"hubMembers">["notifyLevel"];

/**
 * What the signed-in `user` may do with an event (HUB-29).
 * - Hub events: the hub's active members see everything and are in the chat.
 * - Public events: every signed-in user sees them, except across a block with
 *   the host. The chat is for the host and those going or maybe, plus the
 *   hub's admins when it's hosted on behalf of a hub.
 * Returns null when the user can't see the event at all.
 */
export async function eventAccess(ctx: QueryCtx, event: Doc<"events">, user: Doc<"users">) {
  const membership =
    event.hubId === undefined
      ? null
      : await ctx.db
          .query("hubMembers")
          .withIndex("by_hub_user", (q) => q.eq("hubId", event.hubId!).eq("userId", user._id))
          .unique();
  const member = membership?.status === "active" ? membership : null;
  const isHost = event.createdBy === user._id;
  if (event.visibility === "hub") {
    if (member === null) return null;
    return {
      member,
      rsvp: null as Doc<"rsvps"> | null,
      canManage: isHost || member.role !== "member",
      inChat: true,
      chatSince: member._creationTime,
    };
  }
  if (member === null && !isHost && (await blockedWith(ctx, user._id)).has(event.createdBy)) {
    return null;
  }
  const rsvp = await ctx.db
    .query("rsvps")
    .withIndex("by_event_user", (q) => q.eq("eventId", event._id).eq("userId", user._id))
    .unique();
  const canManage = isHost || (member !== null && member.role !== "member");
  return {
    member,
    rsvp,
    canManage,
    inChat: canManage || (rsvp !== null && rsvp.status !== "no"),
    chatSince: isHost ? event._creationTime : (rsvp?._creationTime ?? event._creationTime),
  };
}

/** Someone who takes part in a chat: since when (for unread), how loud, and their role. */
export type Participant = {
  userId: Id<"users">;
  since: number;
  notifyLevel: NotifyLevel;
  role: HubRole;
};

/**
 * Who an event's chat and updates reach. Hub events: the hub's active
 * members. Public events: the host and those going or maybe; they hear
 * about mentions and replies ("important"), unless they're in the hub and
 * chose otherwise there.
 */
export async function eventParticipants(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<Participant[]> {
  const members = event.hubId
    ? (
        await ctx.db
          .query("hubMembers")
          .withIndex("by_hub", (q) => q.eq("hubId", event.hubId!))
          .collect()
      ).filter((m) => m.status === "active")
    : [];
  if (event.visibility === "hub") {
    return members.map((m) => ({
      userId: m.userId,
      since: m._creationTime,
      notifyLevel: m.notifyLevel,
      role: m.role,
    }));
  }
  const byUser = new Map(members.map((m) => [m.userId, m]));
  const people: Participant[] = [];
  const add = (userId: Id<"users">, since: number) => {
    if (people.some((p) => p.userId === userId)) return;
    const m = byUser.get(userId);
    people.push({
      userId,
      since,
      notifyLevel: m?.notifyLevel ?? "important",
      role: userId === event.createdBy ? "owner" : (m?.role ?? "member"),
    });
  };
  add(event.createdBy, event._creationTime);
  for (const r of await rsvpRows(ctx, event._id)) {
    if (r.status !== "no") add(r.userId, r._creationTime);
  }
  return people;
}
