import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const [kari, ola] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { name: "Kari Nordmann" }),
    await ctx.db.insert("users", { name: "Ola Hansen" }),
  ]);
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(kari).mutation(api.hubs.create, { name: "3B", template: "friends" });
  const conversationId = await as(kari).query(api.messages.hubConversation, { hubId });
  if (conversationId === null) throw new Error("no hub conversation");
  const page = (id: Id<"users">, numItems = 50, cursor: string | null = null) =>
    as(id).query(api.messages.list, { conversationId, paginationOpts: { numItems, cursor } });
  return { t, hubId, conversationId, kari, ola, as, page };
}

describe("messages", () => {
  it("sends and lists newest first, with author and isMine", async () => {
    vi.useFakeTimers();
    const { t, hubId, conversationId, kari, as, page } = await setup();
    await as(kari).mutation(api.messages.send, { conversationId, body: "  Hei alle!  " });
    vi.advanceTimersByTime(1000);
    await as(kari).mutation(api.messages.send, { conversationId, body: "Hvem tar med kake?" });

    const { page: messages } = await page(kari);
    expect(messages.map((m) => m.body)).toEqual(["Hvem tar med kake?", "Hei alle!"]);
    expect(messages[0]).toMatchObject({
      isMine: true,
      deleted: false,
      editedAt: null,
      author: { _id: kari, name: "Kari Nordmann", photoUrl: null },
    });
    const { conversation, hub } = await t.run(async (ctx) => ({
      conversation: await ctx.db.get(conversationId),
      hub: await ctx.db.get(hubId),
    }));
    expect(conversation?.lastMessageAt).toBe(Date.now());
    expect(hub?.lastActivityAt).toBe(Date.now());
    vi.useRealTimers();
  });

  it("paginates older messages", async () => {
    const { conversationId, kari, as, page } = await setup();
    for (let i = 1; i <= 5; i++) {
      await as(kari).mutation(api.messages.send, { conversationId, body: `m${i}` });
    }
    const first = await page(kari, 3);
    expect(first.page.map((m) => m.body)).toEqual(["m5", "m4", "m3"]);
    expect(first.isDone).toBe(false);
    const second = await page(kari, 3, first.continueCursor);
    expect(second.page.map((m) => m.body)).toEqual(["m2", "m1"]);
    expect(second.isDone).toBe(true);
  });

  it("rejects empty and overlong messages", async () => {
    const { conversationId, kari, as } = await setup();
    await expect(
      as(kari).mutation(api.messages.send, { conversationId, body: "   " }),
    ).rejects.toThrow(/INVALID_MESSAGE/);
    await expect(
      as(kari).mutation(api.messages.send, { conversationId, body: "x".repeat(4001) }),
    ).rejects.toThrow(/INVALID_MESSAGE/);
  });

  it("is for hub members only", async () => {
    const { hubId, conversationId, kari, ola, as, page } = await setup();
    await as(kari).mutation(api.messages.send, { conversationId, body: "Secret" });
    expect(await as(ola).query(api.messages.hubConversation, { hubId })).toBeNull();
    expect((await page(ola)).page).toEqual([]);
    await expect(
      as(ola).mutation(api.messages.send, { conversationId, body: "Hi" }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("shows other members' messages as not mine", async () => {
    const { t, hubId, conversationId, kari, ola, as, page } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("hubMembers", {
        hubId,
        userId: ola,
        role: "member",
        status: "active",
        notifyLevel: "all",
      }),
    );
    await as(ola).mutation(api.messages.send, { conversationId, body: "Jeg!" });
    expect((await page(kari)).page[0]).toMatchObject({
      isMine: false,
      author: { name: "Ola Hansen" },
    });
  });
});
