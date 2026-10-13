import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getHubMember, getUserId } from "./auth";
import { eventAccess, eventParticipants, type Participant } from "./events";

type Access = {
  user: Doc<"users">;
  role: Doc<"hubMembers">["role"];
  conversation: Doc<"conversations">;
  /** The hub the chat belongs to; none for a public event's chat without a hub. */
  hubId: Id<"hubs"> | undefined;
  /** When the user joined the chat, for unread counts without a read state. */
  since: number;
};

/**
 * Who may read and write a conversation: active members of its hub, or for
 * an event's chat, whoever `eventAccess` lets in (HUB-29). DMs come later.
 * Returns null for everyone else, so live queries go empty instead of throwing.
 */
export async function getConversationAccess(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<Access | null> {
  const conversation = await ctx.db.get(conversationId);
  if (conversation === null) return null;
  if (conversation.kind === "event" && conversation.eventId !== undefined) {
    const event = await ctx.db.get(conversation.eventId);
    const userId = await getUserId(ctx);
    const user = userId === null ? null : await ctx.db.get(userId);
    if (event === null || user === null || user.deletedAt !== undefined) return null;
    const access = await eventAccess(ctx, event, user);
    if (access === null || !access.inChat) return null;
    return {
      user,
      role: access.canManage ? "admin" : "member",
      conversation,
      hubId: event.hubId,
      since: access.chatSince,
    };
  }
  if (conversation.hubId === undefined) return null;
  const member = await getHubMember(ctx, conversation.hubId);
  return member === null
    ? null
    : {
        user: member.user,
        role: member.membership.role,
        conversation,
        hubId: conversation.hubId,
        since: member.membership._creationTime,
      };
}

/** Like `getConversationAccess`, but throws `FORBIDDEN`. For mutations. */
export async function requireConversationAccess(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<Access> {
  const access = await getConversationAccess(ctx, conversationId);
  if (access === null) throw new ConvexError({ code: "FORBIDDEN" });
  return access;
}

/** Everyone in a conversation, for mentions and notifications. */
export async function conversationParticipants(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
): Promise<Participant[]> {
  if (conversation.kind === "event" && conversation.eventId !== undefined) {
    const event = await ctx.db.get(conversation.eventId);
    return event === null ? [] : eventParticipants(ctx, event);
  }
  if (conversation.hubId === undefined) return [];
  const members = await ctx.db
    .query("hubMembers")
    .withIndex("by_hub", (q) => q.eq("hubId", conversation.hubId!))
    .collect();
  return members
    .filter((m) => m.status === "active")
    .map((m) => ({
      userId: m.userId,
      since: m._creationTime,
      notifyLevel: m.notifyLevel,
      role: m.role,
    }));
}
