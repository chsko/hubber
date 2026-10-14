import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import { blockedWith } from "./lib/blocks";
import { conversationParticipants } from "./lib/conversations";
import { eventParticipants } from "./lib/events";
import { pushText } from "./lib/pushText";
import { lastReadAt, unreadCount } from "./lib/unread";

/**
 * Push notifications, calm by default (HUB-22, docs/DESIGN.md §5.6):
 * - Mentions and replies to you push at once, unless the hub is muted.
 * - New events push to the hub; changes and cancellations to those coming.
 * - Other messages only push for hubs set to "All", bundled into one
 *   summary per chat (hub or event) after BUNDLE_WINDOW_MS.
 * - "Important only" (the default for school hubs) skips ordinary chat.
 * - Quiet hours (22–07 Oslo, on by default) deliver silently.
 */
export const BUNDLE_WINDOW_MS = 5 * 60 * 1000;
const QUIET_START = 22;
const QUIET_END = 7;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PREVIEW_LENGTH = 120;

const osloHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Oslo",
  hour: "numeric",
  hourCycle: "h23",
});

export function inQuietHours(now: number): boolean {
  const hour = Number(osloHour.format(now));
  return hour >= QUIET_START || hour < QUIET_END;
}

const platform = v.union(v.literal("ios"), v.literal("android"), v.literal("web"));

/** Saves this device's Expo push token for the signed-in user (moving it from anyone else). */
export const registerToken = mutation({
  args: { token: v.string(), platform },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!/^Expo(nent)?PushToken\[.+\]$/.test(args.token)) return;
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (existing === null) {
      await ctx.db.insert("pushTokens", { userId: user._id, ...args });
    } else if (existing.userId !== user._id) {
      await ctx.db.patch(existing._id, { userId: user._id });
    }
  },
});

/** Forgets this device's token, e.g. on sign-out. */
export const unregisterToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (existing?.userId === user._id) await ctx.db.delete(existing._id);
  },
});

/** Turns quiet hours (22–07) on or off for the signed-in user. */
export const setQuietHours = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { quietHours: args.enabled });
  },
});

type PushMessage = {
  to: string[];
  title: string;
  body: string;
  data: { url: string };
  badge: number;
  sound: "default" | null;
  priority: "high" | "normal";
  interruptionLevel?: "passive";
  threadId: string;
};

async function totalUnread(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  const memberships = await ctx.db
    .query("hubMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let total = 0;
  for (const m of memberships) {
    if (m.status !== "active") continue;
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_hub", (q) => q.eq("hubId", m.hubId))
      .filter((q) => q.eq(q.field("kind"), "hub"))
      .first();
    if (conversation === null) continue;
    const since = await lastReadAt(ctx, conversation._id, userId, m._creationTime);
    total += await unreadCount(ctx, conversation._id, userId, since);
  }
  return total;
}

/** Where a tap leads, and how notifications are grouped on the phone. */
type Target = { url: string; threadId: string };

const hubTarget = (hubId: Id<"hubs">): Target => ({ url: `/hub/${hubId}`, threadId: hubId });
const eventTarget = (eventId: Id<"events">): Target => ({
  url: `/event/${eventId}`,
  threadId: eventId,
});

/**
 * What to call a conversation in a push and where a tap leads: the hub
 * chat, or an event's chat.
 */
async function conversationContext(ctx: QueryCtx, conversation: Doc<"conversations">) {
  if (conversation.kind === "event" && conversation.eventId !== undefined) {
    const event = await ctx.db.get(conversation.eventId);
    return event === null ? null : { label: event.title, target: eventTarget(event._id) };
  }
  const hub = conversation.hubId ? await ctx.db.get(conversation.hubId) : null;
  return hub === null ? null : { label: hub.name, target: hubTarget(hub._id) };
}

/** Builds one push for `user`, or null if they have no devices. */
async function buildPush(
  ctx: QueryCtx,
  user: Doc<"users">,
  target: Target,
  title: string,
  body: string,
  now: number,
): Promise<PushMessage | null> {
  const tokens = await ctx.db
    .query("pushTokens")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  if (tokens.length === 0) return null;
  const quiet = user.quietHours !== false && inQuietHours(now);
  return {
    to: tokens.map((t) => t.token),
    title,
    body,
    data: { url: target.url },
    badge: await totalUnread(ctx, user._id),
    sound: quiet ? null : "default",
    priority: quiet ? "normal" : "high",
    ...(quiet && { interruptionLevel: "passive" as const }),
    threadId: target.threadId,
  };
}

function preview(message: Doc<"messages">, locale: "nb" | "en" | undefined): string {
  const text = message.body.length > 0 ? message.body : pushText(locale).photo;
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text;
}

/**
 * Opens (or keeps) the bundle window for `user` in a conversation; the flush
 * sends one summary of what's unread since the first bundled message was sent.
 */
async function addToBundle(
  ctx: MutationCtx,
  userId: Id<"users">,
  conversationId: Id<"conversations">,
  sentAt: number,
) {
  const open = await ctx.db
    .query("notifications")
    .withIndex("by_user_kind_ref", (q) =>
      q.eq("userId", userId).eq("kind", "chat_bundle").eq("refId", conversationId),
    )
    .filter((q) => q.eq(q.field("deliveredAt"), undefined))
    .first();
  if (open !== null) return;
  const bundleId = await ctx.db.insert("notifications", {
    userId,
    kind: "chat_bundle",
    refId: conversationId,
    bundledAt: sentAt,
  });
  await ctx.scheduler.runAfter(BUNDLE_WINDOW_MS, internal.push.flushBundle, { bundleId });
}

/**
 * Decides who hears about a new message, right after it's sent. Immediate
 * pushes go out now; ordinary messages join each "All" member's bundle.
 */
export const onMessage = internalMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (message === null || message.deletedAt !== undefined) return;
    const conversation = await ctx.db.get(message.conversationId);
    const where = conversation ? await conversationContext(ctx, conversation) : null;
    const author = await ctx.db.get(message.authorId);
    if (conversation === null || where === null || author === null) return;
    const { label, target } = where;
    const quoted = message.replyToId ? await ctx.db.get(message.replyToId) : null;
    const now = Date.now();

    const members = await conversationParticipants(ctx, conversation);
    const pushes: PushMessage[] = [];
    const blocked = await blockedWith(ctx, author._id);
    for (const member of members) {
      if (member.userId === author._id) continue;
      if (blocked.has(member.userId)) continue;
      if (member.notifyLevel === "muted") continue;
      const user = await ctx.db.get(member.userId);
      if (user === null || user.deletedAt !== undefined) continue;
      const t = pushText(user.locale);
      const authorName = author.name ?? "Hubbr";
      const mentioned = message.mentions.includes(user._id);
      const repliedTo = quoted?.authorId === user._id;
      if (mentioned || repliedTo) {
        const title = `${mentioned ? t.mention(authorName) : t.reply(authorName)} · ${label}`;
        const push = await buildPush(ctx, user, target, title, preview(message, user.locale), now);
        if (push) pushes.push(push);
      } else if (member.notifyLevel === "all") {
        await addToBundle(ctx, user._id, conversation._id, message._creationTime);
      }
    }
    if (pushes.length > 0) await ctx.scheduler.runAfter(0, internal.push.send, { pushes });
  },
});

/** Sends the summary for a bundle window, counting what's still unread. */
export const flushBundle = internalMutation({
  args: { bundleId: v.id("notifications") },
  handler: async (ctx, args) => {
    const bundle = await ctx.db.get(args.bundleId);
    if (bundle === null || bundle.deliveredAt !== undefined) return;
    const now = Date.now();
    await ctx.db.patch(bundle._id, { deliveredAt: now });
    const conversationId = ctx.db.normalizeId("conversations", bundle.refId);
    const conversation = conversationId ? await ctx.db.get(conversationId) : null;
    const where = conversation ? await conversationContext(ctx, conversation) : null;
    const user = await ctx.db.get(bundle.userId);
    if (conversation === null || where === null || user === null || user.deletedAt !== undefined) {
      return;
    }
    const member = (await conversationParticipants(ctx, conversation)).find(
      (p) => p.userId === user._id,
    );
    if (member?.notifyLevel !== "all") return;
    // Only what arrived in this window and is still unread; read it already, no push.
    const since = Math.max(
      bundle.bundledAt ?? 0,
      await lastReadAt(ctx, conversation._id, user._id, member.since),
    );
    const count = await unreadCount(ctx, conversation._id, user._id, since - 1);
    if (count === 0) return;
    const body = pushText(user.locale).bundle(count);
    const push = await buildPush(ctx, user, where.target, where.label, body, now);
    if (push) await ctx.scheduler.runAfter(0, internal.push.send, { pushes: [push] });
  },
});

/**
 * Tells people about an event (HUB-23): a new event goes to every member
 * who hasn't muted the hub; a change or cancellation goes to those who
 * said yes or maybe. Never to the person who made the change.
 */
export const onEvent = internalMutation({
  args: {
    eventId: v.id("events"),
    change: v.union(v.literal("new"), v.literal("changed"), v.literal("cancelled")),
    actorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (event === null) return;
    const hub = event.hubId ? await ctx.db.get(event.hubId) : null;
    let recipients: { userId: Id<"users"> }[];
    if (args.change === "new") {
      // A new event is news for its hub; a public one without a hub has no one to tell yet.
      if (hub === null) return;
      const members = await ctx.db
        .query("hubMembers")
        .withIndex("by_hub", (q) => q.eq("hubId", hub._id))
        .collect();
      recipients = members.filter(
        (m) => m.status === "active" && m.userId !== args.actorId && m.notifyLevel !== "muted",
      );
    } else {
      const rsvps = await ctx.db
        .query("rsvps")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      const interested = new Set(rsvps.filter((r) => r.status !== "no").map((r) => r.userId));
      recipients = (await eventParticipants(ctx, event)).filter(
        (p) => p.userId !== args.actorId && interested.has(p.userId),
      );
    }
    const now = Date.now();
    const pushes: PushMessage[] = [];
    for (const member of recipients) {
      const user = await ctx.db.get(member.userId);
      if (user === null || user.deletedAt !== undefined) continue;
      const t = pushText(user.locale);
      const when = t.when(event.startsAt);
      const title =
        args.change === "new"
          ? t.newEvent(hub?.name ?? "Hubbr")
          : args.change === "changed"
            ? t.changedEvent(event.title)
            : t.cancelledEvent(event.title);
      const body =
        args.change === "new"
          ? `${event.title} · ${when}`
          : args.change === "changed"
            ? [when, event.place?.text].filter(Boolean).join(" · ")
            : [when, hub?.name].filter(Boolean).join(" · ");
      const push = await buildPush(ctx, user, eventTarget(event._id), title, body, now);
      if (push) pushes.push(push);
    }
    if (pushes.length > 0) await ctx.scheduler.runAfter(0, internal.push.send, { pushes });
  },
});

/**
 * An event reminder (HUB-26): 24 hours before the start to those going or
 * maybe, and two days before the reply deadline to members who haven't
 * answered. Muted hubs stay quiet; quiet hours make it silent.
 */
export const remind = internalMutation({
  args: { eventId: v.id("events"), kind: v.union(v.literal("start"), v.literal("deadline")) },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (event === null) return;
    if (event.cancelledAt !== undefined || event.remindersOff === true) return;
    const members = await eventParticipants(ctx, event);
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const answer = new Map(rsvps.map((r) => [r.userId, r.status]));
    const now = Date.now();
    const pushes: PushMessage[] = [];
    for (const member of members) {
      if (member.notifyLevel === "muted") continue;
      const status = answer.get(member.userId);
      const wanted = args.kind === "start" ? status === "yes" || status === "maybe" : !status;
      if (!wanted) continue;
      const user = await ctx.db.get(member.userId);
      if (user === null || user.deletedAt !== undefined) continue;
      const t = pushText(user.locale);
      const title =
        args.kind === "start" ? t.startReminder(event.title) : t.deadlineReminder(event.title);
      const body =
        args.kind === "start"
          ? [t.when(event.startsAt), event.place?.text].filter(Boolean).join(" · ")
          : t.answerBy(t.when(event.rsvpDeadline ?? event.startsAt));
      const push = await buildPush(ctx, user, eventTarget(event._id), title, body, now);
      if (push) pushes.push(push);
    }
    if (pushes.length > 0) await ctx.scheduler.runAfter(0, internal.push.send, { pushes });
  },
});

/** Drops a token Expo says is no longer registered (app uninstalled, etc.). */
export const pruneToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (row !== null) await ctx.db.delete(row._id);
  },
});

const pushValidator = v.object({
  to: v.array(v.string()),
  title: v.string(),
  body: v.string(),
  data: v.object({ url: v.string() }),
  badge: v.number(),
  sound: v.union(v.literal("default"), v.null()),
  priority: v.union(v.literal("high"), v.literal("normal")),
  interruptionLevel: v.optional(v.literal("passive")),
  threadId: v.string(),
});

type Ticket = { status: "ok" | "error"; details?: { error?: string } };

/** Delivers pushes through the Expo Push API, one request per token, pruning dead tokens. */
export const send = internalAction({
  args: { pushes: v.array(pushValidator) },
  handler: async (ctx, args) => {
    const messages = args.pushes.flatMap(({ to, ...rest }) =>
      to.map((token) => ({ to: token, ...rest })),
    );
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!response.ok) {
        console.error(`Expo push failed: ${response.status} ${await response.text()}`);
        continue;
      }
      const { data } = (await response.json()) as { data: Ticket[] };
      for (const [j, ticket] of data.entries()) {
        const token = chunk[j]?.to;
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" && token) {
          await ctx.runMutation(internal.push.pruneToken, { token });
        }
      }
    }
  },
});

/** Registered devices per user name, for checking push setup (no tokens in the result). */
export const devices = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("pushTokens").collect();
    return Promise.all(
      rows.map(async (row) => ({
        user: (await ctx.db.get(row.userId))?.name ?? null,
        platform: row.platform,
      })),
    );
  },
});

export const testTokens = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const tokens: string[] = [];
    for (const row of await ctx.db.query("pushTokens").collect()) {
      if ((await ctx.db.get(row.userId))?.name === args.name) tokens.push(row.token);
    }
    return tokens;
  },
});

/** Sends a test push to every device of the users with this name; returns Expo's ticket statuses. */
export const sendTest = internalAction({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<unknown> => {
    const to = await ctx.runQuery(internal.push.testTokens, { name: args.name });
    if (to.length === 0) return { sent: 0 };
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        to.map((token) => ({
          to: token,
          title: "Hubbr",
          body: "Test notification",
          sound: "default",
        })),
      ),
    });
    const { data } = (await response.json()) as { data?: Ticket[] };
    return {
      sent: to.length,
      status: response.status,
      tickets: data?.map((t) => ({ status: t.status, error: t.details?.error })),
    };
  },
});
