import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

/** Kari owns the hub; Ola and Anna are members; Per is an outsider. */
async function setup() {
  const t = convexTest(schema, modules);
  const [kari, ola, anna, per] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { name: "Kari" }),
    await ctx.db.insert("users", { name: "Ola" }),
    await ctx.db.insert("users", { name: "Anna" }),
    await ctx.db.insert("users", { name: "Per" }),
  ]);
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(kari).mutation(api.hubs.create, { name: "3B", template: "friends" });
  await t.run(async (ctx) => {
    for (const userId of [ola, anna]) {
      await ctx.db.insert("hubMembers", {
        hubId,
        userId,
        role: "member",
        status: "active",
        notifyLevel: "all",
      });
    }
  });
  const conversationId = (await as(kari).query(api.messages.hubConversation, { hubId }))!;
  const say = (id: Id<"users">, body: string, extra: object = {}) =>
    as(id).mutation(api.messages.send, { conversationId, body, ...extra });
  const latest = async (id: Id<"users">) =>
    (
      await as(id).query(api.messages.list, {
        conversationId,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page;
  return { t, hubId, conversationId, kari, ola, anna, per, as, say, latest };
}

describe("reactions", () => {
  it("toggles per person and emoji, with counts and mine", async () => {
    const { kari, ola, anna, as, say, latest } = await setup();
    const messageId = await say(kari, "Hei!");
    await as(ola).mutation(api.messages.toggleReaction, { messageId, emoji: "❤️" });
    await as(anna).mutation(api.messages.toggleReaction, { messageId, emoji: "❤️" });
    await as(anna).mutation(api.messages.toggleReaction, { messageId, emoji: "👍" });
    expect((await latest(ola))[0]?.reactions).toEqual([
      { emoji: "❤️", count: 2, mine: true },
      { emoji: "👍", count: 1, mine: false },
    ]);
    await as(ola).mutation(api.messages.toggleReaction, { messageId, emoji: "❤️" });
    expect((await latest(ola))[0]?.reactions).toEqual([
      { emoji: "❤️", count: 1, mine: false },
      { emoji: "👍", count: 1, mine: false },
    ]);
  });

  it("only takes emoji, and only from members", async () => {
    const { kari, per, as, say } = await setup();
    const messageId = await say(kari, "Hei!");
    await expect(
      as(kari).mutation(api.messages.toggleReaction, { messageId, emoji: "lol" }),
    ).rejects.toThrow(/INVALID_EMOJI/);
    await expect(
      as(per).mutation(api.messages.toggleReaction, { messageId, emoji: "👍" }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("replies and mentions", () => {
  it("quotes the replied-to message", async () => {
    const { kari, ola, say, latest } = await setup();
    const question = await say(kari, "Hvem tar med kake?");
    await say(ola, "Jeg!", { replyToId: question });
    expect((await latest(kari))[0]?.replyTo).toEqual({
      _id: question,
      authorName: "Kari",
      body: "Hvem tar med kake?",
      deleted: false,
    });
  });

  it("refuses replies to messages from another conversation", async () => {
    const { kari, as, say } = await setup();
    const otherHub = await as(kari).mutation(api.hubs.create, { name: "X", template: "other" });
    const otherConversation = (await as(kari).query(api.messages.hubConversation, {
      hubId: otherHub,
    }))!;
    const elsewhere = await as(kari).mutation(api.messages.send, {
      conversationId: otherConversation,
      body: "Elsewhere",
    });
    await expect(say(kari, "Hm", { replyToId: elsewhere })).rejects.toThrow(/INVALID_REPLY/);
  });

  it("keeps mentions of members only, never yourself", async () => {
    const { kari, ola, per, say, latest } = await setup();
    await say(kari, "@Ola @Per @Kari", { mentions: [ola, per, kari, ola] });
    const [message] = await latest(ola);
    expect(message?.mentions).toEqual([{ _id: ola, name: "Ola" }]);
    expect(message?.mentionsMe).toBe(true);
    expect((await latest(kari))[0]?.mentionsMe).toBe(false);
  });
});

describe("edit and delete", () => {
  it("edits your own message within 15 minutes only", async () => {
    vi.useFakeTimers();
    const { kari, ola, as, say, latest } = await setup();
    const messageId = await say(kari, "Mote kl 18");
    await expect(
      as(ola).mutation(api.messages.edit, { messageId, body: "Hacked" }),
    ).rejects.toThrow(/FORBIDDEN/);
    await as(kari).mutation(api.messages.edit, { messageId, body: "Møte kl 18" });
    expect((await latest(kari))[0]).toMatchObject({ body: "Møte kl 18", editedAt: Date.now() });

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    await expect(
      as(kari).mutation(api.messages.edit, { messageId, body: "Too late" }),
    ).rejects.toThrow(/EDIT_WINDOW_PASSED/);
    vi.useRealTimers();
  });

  it("deletes your own message, clearing text, mentions and reactions", async () => {
    const { t, kari, ola, as, say, latest } = await setup();
    const messageId = await say(ola, "Oops @Kari", { mentions: [kari] });
    await as(kari).mutation(api.messages.toggleReaction, { messageId, emoji: "😂" });
    expect((await latest(ola))[0]?.canDelete).toBe(true);
    await as(ola).mutation(api.messages.remove, { messageId });
    expect((await latest(kari))[0]).toMatchObject({
      body: "",
      deleted: true,
      reactions: [],
      mentions: [],
      canDelete: false,
    });
    const stored = await t.run((ctx) => ctx.db.get(messageId));
    expect(stored?.body).toBe("");
    expect(await t.run((ctx) => ctx.db.query("reactions").collect())).toEqual([]);
  });

  it("lets admins remove anyone's message, but not other members", async () => {
    const { kari, ola, anna, as, say, latest } = await setup();
    const messageId = await say(ola, "Spam");
    expect((await latest(anna))[0]?.canDelete).toBe(false);
    expect((await latest(kari))[0]?.canDelete).toBe(true);
    await expect(as(anna).mutation(api.messages.remove, { messageId })).rejects.toThrow(
      /FORBIDDEN/,
    );
    await as(kari).mutation(api.messages.remove, { messageId });
    expect((await latest(anna))[0]?.deleted).toBe(true);
  });
});
