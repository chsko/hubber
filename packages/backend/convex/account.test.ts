import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    kari: await ctx.db.insert("users", { name: "Kari", phone: "+4790000001", vippsSub: "k" }),
    ola: await ctx.db.insert("users", { name: "Ola" }),
  }));
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const settle = () => t.finishAllScheduledFunctions(() => vi.runAllTimers());
  return { t, ids, as, settle };
}

async function addMember(
  t: Awaited<ReturnType<typeof setup>>["t"],
  hubId: Id<"hubs">,
  userId: Id<"users">,
) {
  await t.run((ctx) =>
    ctx.db.insert("hubMembers", {
      hubId,
      userId,
      role: "member",
      status: "active",
      notifyLevel: "all",
    }),
  );
}

describe("account deletion", () => {
  it("asks for a new owner first for hubs with other members", async () => {
    const { t, ids, as } = await setup();
    const shared = await as(ids.kari).mutation(api.hubs.create, { name: "3B", template: "class" });
    const alone = await as(ids.kari).mutation(api.hubs.create, {
      name: "Notater",
      template: "other",
    });
    await addMember(t, shared, ids.ola);
    expect(await as(ids.kari).query(api.account.deletionCheck, {})).toEqual({
      needOwner: [{ _id: shared, name: "3B" }],
      willClose: [{ _id: alone, name: "Notater" }],
    });
    await expect(as(ids.kari).mutation(api.account.deleteAccount, {})).rejects.toThrow(/OWNS_HUBS/);
    await as(ids.kari).mutation(api.hubs.transferOwnership, { hubId: shared, userId: ids.ola });
    expect((await as(ids.kari).query(api.account.deletionCheck, {}))?.needOwner).toEqual([]);
  });

  it("removes personal data, keeps messages as from a deleted user, and closes hubs left empty", async () => {
    const { t, ids, as, settle } = await setup();
    const shared = await as(ids.ola).mutation(api.hubs.create, { name: "3B", template: "class" });
    await addMember(t, shared, ids.kari);
    const alone = await as(ids.kari).mutation(api.hubs.create, {
      name: "Notater",
      template: "other",
    });
    const conversationId = (await as(ids.kari).query(api.messages.hubConversation, {
      hubId: shared,
    }))!;
    const messageId = await as(ids.kari).mutation(api.messages.send, {
      conversationId,
      body: "Hei fra Kari",
    });
    await as(ids.kari).mutation(api.messages.toggleReaction, { messageId, emoji: "👍" });
    await as(ids.kari).mutation(api.push.registerToken, {
      token: "ExponentPushToken[kari]",
      platform: "ios",
    });
    await as(ids.kari).mutation(api.calendar.createFeed, {});
    await as(ids.kari).mutation(api.moderation.block, { userId: ids.ola });
    const lonelyChat = (await as(ids.kari).query(api.messages.hubConversation, { hubId: alone }))!;
    await as(ids.kari).mutation(api.messages.send, { conversationId: lonelyChat, body: "Notat" });
    await settle();

    await as(ids.kari).mutation(api.account.deleteAccount, {});
    await settle();

    const left = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.kari),
      memberships: await ctx.db
        .query("hubMembers")
        .withIndex("by_user", (q) => q.eq("userId", ids.kari))
        .collect(),
      tokens: await ctx.db.query("pushTokens").collect(),
      feeds: await ctx.db.query("calendarFeeds").collect(),
      blocks: await ctx.db.query("blocks").collect(),
      reactions: await ctx.db.query("reactions").collect(),
      lonelyHub: await ctx.db.get(alone),
      lonelyChat: await ctx.db.get(lonelyChat),
      messages: await ctx.db.query("messages").collect(),
    }));
    expect(left.user).toMatchObject({ deletedAt: expect.any(Number) as number });
    expect(left.user).not.toHaveProperty("name");
    expect(left.user).not.toHaveProperty("phone");
    expect(left.user).not.toHaveProperty("vippsSub");
    expect(left).toMatchObject({
      memberships: [],
      tokens: [],
      feeds: [],
      blocks: [],
      reactions: [],
      lonelyHub: null,
      lonelyChat: null,
    });
    expect(left.messages.map((m) => m.body)).toEqual(["Hei fra Kari"]);

    const { page } = await as(ids.ola).query(api.messages.list, {
      conversationId,
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(page[0]?.author.name).toBeNull();
    expect(await as(ids.kari).query(api.users.me, {})).toBeNull();
    await expect(as(ids.kari).mutation(api.account.deleteAccount, {})).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
  });
});
