import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;
type HubRole = Doc<"hubMembers">["role"];

const ROLE_RANK: Record<HubRole, number> = { member: 0, admin: 1, owner: 2 };

/**
 * The signed-in user's id, or null. Follows Convex Auth's convention that the
 * JWT subject is `<userId>|<sessionId>`, so it keeps working once Convex Auth
 * is wired up (HUB-9/10).
 */
export async function getUserId(ctx: Ctx): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  const [rawId] = identity.subject.split("|");
  return rawId === undefined ? null : ctx.db.normalizeId("users", rawId);
}

/** The signed-in, non-deleted user. Throws `UNAUTHENTICATED` otherwise. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const userId = await getUserId(ctx);
  const user = userId === null ? null : await ctx.db.get(userId);
  if (user === null || user.deletedAt !== undefined) {
    throw new ConvexError({ code: "UNAUTHENTICATED" });
  }
  return user;
}

/**
 * The signed-in user plus their active membership of `hubId` with at least
 * `minRole`, or null for non-members, pending members and members below
 * `minRole`. For live queries, which should go empty rather than throw when
 * someone is removed while looking at the hub.
 */
export async function getHubMember(
  ctx: Ctx,
  hubId: Id<"hubs">,
  minRole: HubRole = "member",
): Promise<{ user: Doc<"users">; membership: Doc<"hubMembers"> } | null> {
  const userId = await getUserId(ctx);
  const user = userId === null ? null : await ctx.db.get(userId);
  if (user === null || user.deletedAt !== undefined) return null;
  const membership = await ctx.db
    .query("hubMembers")
    .withIndex("by_hub_user", (q) => q.eq("hubId", hubId).eq("userId", user._id))
    .unique();
  if (
    membership === null ||
    membership.status !== "active" ||
    ROLE_RANK[membership.role] < ROLE_RANK[minRole]
  ) {
    return null;
  }
  return { user, membership };
}

/**
 * Like `getHubMember`, but throws `UNAUTHENTICATED` when signed out and
 * `FORBIDDEN` otherwise, so callers can't tell a hidden hub from a missing one.
 */
export async function requireHubMember(
  ctx: Ctx,
  hubId: Id<"hubs">,
  minRole: HubRole = "member",
): Promise<{ user: Doc<"users">; membership: Doc<"hubMembers"> }> {
  await requireUser(ctx);
  const member = await getHubMember(ctx, hubId, minRole);
  if (member === null) throw new ConvexError({ code: "FORBIDDEN" });
  return member;
}
