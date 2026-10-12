import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getHubMember } from "./auth";

type Access = {
  user: Doc<"users">;
  role: Doc<"hubMembers">["role"];
  conversation: Doc<"conversations">;
  hubId: Id<"hubs">;
};

/**
 * Who may read and write a conversation: active members of its hub. Event
 * chats belong to the event's hub. DMs come later. Returns null for
 * everyone else, so live queries go empty instead of throwing.
 */
export async function getConversationAccess(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<Access | null> {
  const conversation = await ctx.db.get(conversationId);
  if (conversation === null) return null;
  let hubId = conversation.hubId;
  if (conversation.kind === "event" && conversation.eventId !== undefined) {
    hubId = (await ctx.db.get(conversation.eventId))?.hubId;
  }
  if (hubId === undefined) return null;
  const member = await getHubMember(ctx, hubId);
  return member === null
    ? null
    : { user: member.user, role: member.membership.role, conversation, hubId };
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
