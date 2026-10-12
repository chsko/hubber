import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { requireHubMember, requireUser } from "./lib/auth";
import { HUB_TEMPLATES } from "./lib/hubTemplates";
import { hitRateLimit, isRateLimited } from "./lib/rateLimit";

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRY_DAYS = 30;

/** Unambiguous upper-case letters and digits (no 0/O, 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10; // 31^10 ≈ 2^49: not guessable, still easy to type.

/** Failed redemptions allowed per user per hour (HUB-15). */
const REDEEM_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // 256 % 31 leaves a tiny bias, irrelevant at this length.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Accepts "ABCD-EFGH-23", lower case, or a whole link, and returns the bare code. */
export function normalizeCode(input: string): string {
  const last = input.trim().split("/").pop() ?? "";
  return last.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function isUsable(invite: Doc<"invites">, now: number): boolean {
  return (
    invite.revokedAt === undefined && (invite.expiresAt === undefined || invite.expiresAt > now)
  );
}

async function usableInvites(ctx: QueryCtx, hubId: Id<"hubs">) {
  const now = Date.now();
  const invites = await ctx.db
    .query("invites")
    .withIndex("by_hub", (q) => q.eq("hubId", hubId))
    .collect();
  return invites.filter((i) => isUsable(i, now));
}

async function createInvite(
  ctx: MutationCtx,
  hubId: Id<"hubs">,
  createdBy: Id<"users">,
  expiresInDays: number | null,
) {
  const inviteId = await ctx.db.insert("invites", {
    hubId,
    code: newCode(),
    createdBy,
    uses: 0,
    ...(expiresInDays !== null && { expiresAt: Date.now() + expiresInDays * DAY }),
  });
  const invite = await ctx.db.get(inviteId);
  if (invite === null) throw new ConvexError({ code: "NOT_FOUND" });
  return invite;
}

function inviteView(invite: Doc<"invites">) {
  return {
    _id: invite._id,
    code: invite.code,
    expiresAt: invite.expiresAt ?? null,
    uses: invite.uses,
  };
}

/**
 * The hub's current invite link, created on first use (default expiry 30
 * days). Any active member may share it; only admins change it.
 */
export const current = mutation({
  args: { hubId: v.id("hubs") },
  handler: async (ctx, args) => {
    const { user } = await requireHubMember(ctx, args.hubId);
    const [latest] = (await usableInvites(ctx, args.hubId)).sort(
      (a, b) => b._creationTime - a._creationTime,
    );
    return inviteView(
      latest ?? (await createInvite(ctx, args.hubId, user._id, DEFAULT_EXPIRY_DAYS)),
    );
  },
});

/** Admins: revoke every current link and make a new one with the given expiry (null = never). */
export const renew = mutation({
  args: {
    hubId: v.id("hubs"),
    expiresInDays: v.union(v.literal(1), v.literal(7), v.literal(30), v.null()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireHubMember(ctx, args.hubId, "admin");
    const now = Date.now();
    for (const invite of await usableInvites(ctx, args.hubId)) {
      await ctx.db.patch(invite._id, { revokedAt: now });
    }
    return inviteView(await createInvite(ctx, args.hubId, user._id, args.expiresInDays));
  },
});

/** Admins: revoke all links without making a new one. */
export const revokeAll = mutation({
  args: { hubId: v.id("hubs") },
  handler: async (ctx, args) => {
    await requireHubMember(ctx, args.hubId, "admin");
    const now = Date.now();
    for (const invite of await usableInvites(ctx, args.hubId)) {
      await ctx.db.patch(invite._id, { revokedAt: now });
    }
  },
});

/**
 * What an invite leads to, for the join screen: hub name, icon and member
 * count, never member names (docs/DESIGN.md §5.3). Null for unknown,
 * expired or revoked codes.
 */
export const preview = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(args.code)))
      .unique();
    if (invite === null || !isUsable(invite, Date.now())) return null;
    const hub = await ctx.db.get(invite.hubId);
    if (hub === null) return null;
    const members = await ctx.db
      .query("hubMembers")
      .withIndex("by_hub", (q) => q.eq("hubId", hub._id))
      .collect();
    const mine = members.find((m) => m.userId === user._id);
    return {
      hubId: hub._id,
      name: hub.name,
      template: hub.template,
      emoji: hub.emoji ?? HUB_TEMPLATES[hub.template].emoji,
      iconUrl: hub.iconId ? await ctx.storage.getUrl(hub.iconId) : null,
      memberCount: members.filter((m) => m.status === "active").length,
      joinApproval: hub.joinApproval,
      myStatus: mine?.status ?? null,
    };
  },
});

/**
 * Joins the hub behind an invite code. Joins directly, or as pending when
 * the hub requires approval. Bad codes return `{ ok: false }` instead of
 * throwing, so the rate-limit counter isn't rolled back.
 */
export const redeem = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limitKey = `redeem:${user._id}`;
    // Checked before the lookup, so a guesser over the limit learns nothing.
    if (await isRateLimited(ctx, limitKey, REDEEM_LIMIT)) {
      return { ok: false as const, reason: "RATE_LIMITED" as const };
    }
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(args.code)))
      .unique();
    const hub = invite && isUsable(invite, Date.now()) ? await ctx.db.get(invite.hubId) : null;
    if (invite === null || hub === null) {
      await hitRateLimit(ctx, limitKey, REDEEM_LIMIT);
      return { ok: false as const, reason: "INVALID_CODE" as const };
    }

    const existing = await ctx.db
      .query("hubMembers")
      .withIndex("by_hub_user", (q) => q.eq("hubId", hub._id).eq("userId", user._id))
      .unique();
    if (existing !== null) return { ok: true as const, hubId: hub._id, status: existing.status };

    const status = hub.joinApproval ? ("pending" as const) : ("active" as const);
    await ctx.db.insert("hubMembers", {
      hubId: hub._id,
      userId: user._id,
      role: "member",
      status,
      notifyLevel: HUB_TEMPLATES[hub.template].notifyLevel,
    });
    await ctx.db.patch(invite._id, { uses: invite.uses + 1 });
    if (status === "active") await ctx.db.patch(hub._id, { lastActivityAt: Date.now() });
    return { ok: true as const, hubId: hub._id, status };
  },
});
