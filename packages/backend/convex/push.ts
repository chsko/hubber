import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import { pushText } from "./lib/pushText";
import { lastReadAt, unreadCount } from "./lib/unread";

/**
 * Push notifications, calm by default (HUB-22, docs/DESIGN.md §5.6):
 * - Mentions and replies to you push at once, unless the hub is muted.
 * - Other messages only push for hubs set to "All", bundled into one
 *   summary per hub after BUNDLE_WINDOW_MS.
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

/** Builds one push for `user`, or null if they have no devices. */
async function buildPush(
  ctx: QueryCtx,
  user: Doc<"users">,
  hub: Doc<"hubs">,
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
    data: { url: `/hub/${hub._id}` },
    badge: await totalUnread(ctx, user._id),
    sound: quiet ? null : "default",
    priority: quiet ? "normal" : "high",
    ...(quiet && { interruptionLevel: "passive" as const }),
    threadId: hub._id,
  };
}

function preview(message: Doc<"messages">, locale: "nb" | "en" | undefined): string {
  const text = message.body.length > 0 ? message.body : pushText(locale).photo;
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text;
}

/**
 * Opens (or keeps) the bundle window for `user` in `hub`; the flush sends one
 * summary of what's unread since the first bundled message was sent.
 */
async function addToBundle(
  ctx: MutationCtx,
  userId: Id<"users">,
  hubId: Id<"hubs">,
  sentAt: number,
) {
  const open = await ctx.db
    .query("notifications")
    .withIndex("by_user_kind_ref", (q) =>
      q.eq("userId", userId).eq("kind", "chat_bundle").eq("refId", hubId),
    )
    .filter((q) => q.eq(q.field("deliveredAt"), undefined))
    .first();
  if (open !== null) return;
  const bundleId = await ctx.db.insert("notifications", {
    userId,
    kind: "chat_bundle",
    refId: hubId,
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
    const hub = conversation?.hubId ? await ctx.db.get(conversation.hubId) : null;
    const author = await ctx.db.get(message.authorId);
    if (hub === null || author === null) return;
    const quoted = message.replyToId ? await ctx.db.get(message.replyToId) : null;
    const now = Date.now();

    const members = await ctx.db
      .query("hubMembers")
      .withIndex("by_hub", (q) => q.eq("hubId", hub._id))
      .collect();
    const pushes: PushMessage[] = [];
    for (const member of members) {
      if (member.status !== "active" || member.userId === author._id) continue;
      if (member.notifyLevel === "muted") continue;
      const user = await ctx.db.get(member.userId);
      if (user === null || user.deletedAt !== undefined) continue;
      const t = pushText(user.locale);
      const authorName = author.name ?? "Hubber";
      const mentioned = message.mentions.includes(user._id);
      const repliedTo = quoted?.authorId === user._id;
      if (mentioned || repliedTo) {
        const title = `${mentioned ? t.mention(authorName) : t.reply(authorName)} · ${hub.name}`;
        const push = await buildPush(ctx, user, hub, title, preview(message, user.locale), now);
        if (push) pushes.push(push);
      } else if (member.notifyLevel === "all") {
        await addToBundle(ctx, user._id, hub._id, message._creationTime);
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
    const hubId = ctx.db.normalizeId("hubs", bundle.refId);
    const hub = hubId ? await ctx.db.get(hubId) : null;
    const user = await ctx.db.get(bundle.userId);
    if (hub === null || user === null || user.deletedAt !== undefined) return;
    const member = await ctx.db
      .query("hubMembers")
      .withIndex("by_hub_user", (q) => q.eq("hubId", hub._id).eq("userId", user._id))
      .unique();
    if (member?.status !== "active" || member.notifyLevel !== "all") return;
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_hub", (q) => q.eq("hubId", hub._id))
      .filter((q) => q.eq(q.field("kind"), "hub"))
      .first();
    if (conversation === null) return;
    // Only what arrived in this window and is still unread; read it already, no push.
    const since = Math.max(
      bundle.bundledAt ?? 0,
      await lastReadAt(ctx, conversation._id, user._id, member._creationTime),
    );
    const count = await unreadCount(ctx, conversation._id, user._id, since - 1);
    if (count === 0) return;
    const push = await buildPush(
      ctx,
      user,
      hub,
      hub.name,
      pushText(user.locale).bundle(count),
      now,
    );
    if (push) await ctx.scheduler.runAfter(0, internal.push.send, { pushes: [push] });
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
