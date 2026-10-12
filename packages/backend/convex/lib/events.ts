import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

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
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? null,
    place: event.place?.text ?? null,
    cancelled: event.cancelledAt !== undefined,
    going: goingCount(rows),
    myRsvp: rows.find((r) => r.userId === userId)?.status ?? null,
  };
}
