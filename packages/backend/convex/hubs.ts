import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { requireHubMember, requireUser } from "./lib/auth";
import { HUB_TEMPLATES } from "./lib/hubTemplates";
import { requireImage } from "./lib/images";
import { hubTemplate } from "./schema";

const MAX_NAME_LENGTH = 60;

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new ConvexError({ code: "INVALID_NAME" });
  }
  return trimmed;
}

function cleanEmoji(emoji: string | undefined): string | undefined {
  if (emoji === undefined) return undefined;
  // One emoji, possibly with modifiers or joiners; no free text in the icon slot.
  if (emoji.length === 0 || emoji.length > 16 || !/^\p{Extended_Pictographic}/u.test(emoji)) {
    throw new ConvexError({ code: "INVALID_EMOJI" });
  }
  return emoji;
}

async function activeMemberCount(ctx: QueryCtx, hubId: Id<"hubs">): Promise<number> {
  const members = await ctx.db
    .query("hubMembers")
    .withIndex("by_hub", (q) => q.eq("hubId", hubId))
    .collect();
  return members.filter((m) => m.status === "active").length;
}

/** The fields every hub view shows: name, icon and template. */
async function hubSummary(ctx: QueryCtx, hub: Doc<"hubs">) {
  return {
    _id: hub._id,
    name: hub.name,
    template: hub.template,
    emoji: hub.emoji ?? HUB_TEMPLATES[hub.template].emoji,
    iconUrl: hub.iconId ? await ctx.storage.getUrl(hub.iconId) : null,
    lastActivityAt: hub.lastActivityAt ?? hub._creationTime,
  };
}

/**
 * Creates a hub from a template (HUB-14). The creator becomes its owner, and
 * the hub's chat conversation is created with it.
 */
export const create = mutation({
  args: {
    name: v.string(),
    template: hubTemplate,
    emoji: v.optional(v.string()),
    iconId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const defaults = HUB_TEMPLATES[args.template];
    if (args.iconId !== undefined) await requireImage(ctx, args.iconId);
    const now = Date.now();
    const hubId = await ctx.db.insert("hubs", {
      name: cleanName(args.name),
      template: args.template,
      emoji: cleanEmoji(args.emoji) ?? defaults.emoji,
      ...(args.iconId !== undefined && { iconId: args.iconId }),
      ownerId: user._id,
      joinApproval: defaults.joinApproval,
      lastActivityAt: now,
    });
    await ctx.db.insert("hubMembers", {
      hubId,
      userId: user._id,
      role: "owner",
      status: "active",
      notifyLevel: defaults.notifyLevel,
    });
    await ctx.db.insert("conversations", { kind: "hub", hubId });
    return hubId;
  },
});

/** The signed-in user's hubs (active memberships only), most recently active first. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const memberships = await ctx.db
      .query("hubMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const hubs = await Promise.all(
      memberships
        .filter((m) => m.status === "active")
        .map(async (m) => {
          const hub = await ctx.db.get(m.hubId);
          if (hub === null) return null;
          return {
            ...(await hubSummary(ctx, hub)),
            role: m.role,
            memberCount: await activeMemberCount(ctx, hub._id),
          };
        }),
    );
    return hubs.filter((h) => h !== null).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  },
});

/** One hub, for its members. Throws `FORBIDDEN` for everyone else. */
export const get = query({
  args: { hubId: v.id("hubs") },
  handler: async (ctx, args) => {
    const { membership } = await requireHubMember(ctx, args.hubId);
    const hub = await ctx.db.get(args.hubId);
    if (hub === null) throw new ConvexError({ code: "FORBIDDEN" });
    return {
      ...(await hubSummary(ctx, hub)),
      joinApproval: hub.joinApproval,
      memberCount: await activeMemberCount(ctx, hub._id),
      myRole: membership.role,
    };
  },
});

/** Active members of a hub with name and photo, owners and admins first, for members only. */
export const members = query({
  args: { hubId: v.id("hubs") },
  handler: async (ctx, args) => {
    await requireHubMember(ctx, args.hubId);
    const rows = await ctx.db
      .query("hubMembers")
      .withIndex("by_hub", (q) => q.eq("hubId", args.hubId))
      .collect();
    const rank = { owner: 0, admin: 1, member: 2 } as const;
    const people = await Promise.all(
      rows
        .filter((m) => m.status === "active")
        .map(async (m) => {
          const user = await ctx.db.get(m.userId);
          if (user === null || user.deletedAt !== undefined) return null;
          return {
            userId: user._id,
            name: user.name ?? null,
            photoUrl: user.photoId ? await ctx.storage.getUrl(user.photoId) : null,
            role: m.role,
          };
        }),
    );
    return people
      .filter((p) => p !== null)
      .sort(
        (a, b) => rank[a.role] - rank[b.role] || (a.name ?? "").localeCompare(b.name ?? "", "nb"),
      );
  },
});
