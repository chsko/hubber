import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server";
import { getUserId, requireHubMember, requireUser } from "./lib/auth";
import { requireConversationAccess } from "./lib/conversations";
import { eventAccess } from "./lib/events";
import { hitRateLimit } from "./lib/rateLimit";

/**
 * Reporting and blocking (HUB-33), which app stores require for apps with
 * user-generated content. Reports land in `reports` and are handled from
 * the Convex dashboard with `openReports` and `handleReport`.
 */

const MAX_DETAILS_LENGTH = 1000;
/** Reports per person per day; well above honest use, low enough to stop flooding. */
const REPORT_LIMIT = { max: 20, windowMs: 24 * 60 * 60 * 1000 };

const targetType = v.union(
  v.literal("message"),
  v.literal("event"),
  v.literal("user"),
  v.literal("hub"),
);
const reason = v.union(
  v.literal("spam"),
  v.literal("harassment"),
  v.literal("inappropriate"),
  v.literal("child_safety"),
  v.literal("other"),
);

type Target = Doc<"reports">["targetType"];

/**
 * Checks that the reporter can see what they report and finds its hub.
 * Throws FORBIDDEN otherwise, so reports can't probe for hidden content.
 */
async function resolveTarget(
  ctx: MutationCtx,
  user: Doc<"users">,
  type: Target,
  rawId: string,
): Promise<{ id: string; hubId: Id<"hubs"> | undefined }> {
  const forbidden = new ConvexError({ code: "FORBIDDEN" });
  switch (type) {
    case "message": {
      const id = ctx.db.normalizeId("messages", rawId);
      const message = id ? await ctx.db.get(id) : null;
      if (message === null) throw forbidden;
      const { hubId } = await requireConversationAccess(ctx, message.conversationId);
      if (message.authorId === user._id) throw forbidden;
      return { id: message._id, hubId };
    }
    case "event": {
      const id = ctx.db.normalizeId("events", rawId);
      const event = id ? await ctx.db.get(id) : null;
      if (event === null || (await eventAccess(ctx, event, user)) === null) throw forbidden;
      return { id: event._id, hubId: event.hubId };
    }
    case "hub": {
      const id = ctx.db.normalizeId("hubs", rawId);
      if (id === null) throw forbidden;
      await requireHubMember(ctx, id);
      return { id, hubId: id };
    }
    case "user": {
      const id = ctx.db.normalizeId("users", rawId);
      if (id === null || id === user._id || (await ctx.db.get(id)) === null) throw forbidden;
      return { id, hubId: undefined };
    }
  }
}

/** Reports a message, event, person or hub, with a reason and optional details. */
export const report = mutation({
  args: {
    targetType,
    targetId: v.string(),
    reason,
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const details = args.details?.trim() ?? "";
    if (details.length > MAX_DETAILS_LENGTH) throw new ConvexError({ code: "INVALID_REPORT" });
    const target = await resolveTarget(ctx, user, args.targetType, args.targetId);
    if (!(await hitRateLimit(ctx, `report:${user._id}`, REPORT_LIMIT))) {
      return { ok: false as const, reason: "RATE_LIMITED" as const };
    }
    await ctx.db.insert("reports", {
      reporterId: user._id,
      targetType: args.targetType,
      targetId: target.id,
      ...(target.hubId !== undefined && { hubId: target.hubId }),
      reason: args.reason,
      ...(details.length > 0 && { details }),
      status: "open",
    });
    return { ok: true as const };
  },
});

/** Blocks someone: neither sees the other's messages, mentions or notifications. */
export const block = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.userId === user._id) throw new ConvexError({ code: "INVALID_BLOCK" });
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", user._id).eq("blockedId", args.userId))
      .unique();
    if (existing === null) {
      await ctx.db.insert("blocks", { blockerId: user._id, blockedId: args.userId });
    }
  },
});

export const unblock = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", user._id).eq("blockedId", args.userId))
      .unique();
    if (existing !== null) await ctx.db.delete(existing._id);
  },
});

/** People the signed-in user has blocked, for Profile → Blocked. */
export const blocked = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
      .collect();
    return Promise.all(
      rows.map(async (b) => {
        const other = await ctx.db.get(b.blockedId);
        const gone = other === null || other.deletedAt !== undefined;
        return { userId: b.blockedId, name: gone ? null : (other.name ?? null) };
      }),
    );
  },
});

/**
 * Open reports, oldest first, with what was reported, for handling in the
 * Convex dashboard (Functions → moderation:openReports).
 */
export const openReports = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(args.limit ?? 50);
    return Promise.all(
      rows.map(async (r) => {
        const reporter = await ctx.db.get(r.reporterId);
        let content: unknown;
        if (r.targetType === "message") {
          const id = ctx.db.normalizeId("messages", r.targetId);
          const m = id ? await ctx.db.get(id) : null;
          content = m && { authorId: m.authorId, body: m.body, images: m.imageIds.length };
        } else if (r.targetType === "event") {
          const id = ctx.db.normalizeId("events", r.targetId);
          const e = id ? await ctx.db.get(id) : null;
          content = e && { createdBy: e.createdBy, title: e.title, description: e.description };
        } else if (r.targetType === "user") {
          const id = ctx.db.normalizeId("users", r.targetId);
          const u = id ? await ctx.db.get(id) : null;
          content = u && { name: u.name };
        } else {
          const id = ctx.db.normalizeId("hubs", r.targetId);
          const h = id ? await ctx.db.get(id) : null;
          content = h && { name: h.name, ownerId: h.ownerId };
        }
        return { ...r, reporterName: reporter?.name ?? null, content };
      }),
    );
  },
});

/** Closes a report as resolved (action taken) or dismissed, with a note. */
export const handleReport = internalMutation({
  args: {
    reportId: v.id("reports"),
    status: v.union(v.literal("resolved"), v.literal("dismissed")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      status: args.status,
      handledAt: Date.now(),
      ...(args.note !== undefined && { note: args.note }),
    });
  },
});
