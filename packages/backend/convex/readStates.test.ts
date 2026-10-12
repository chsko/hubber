import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const [kari, ola, anna] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { name: "Kari" }),
    await ctx.db.insert("users", { name: "Ola" }),
    await ctx.db.insert("users", { name: "Anna" }),
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
  const say = async (id: Id<"users">, body: string) => {
    vi.advanceTimersByTime(1000);
    return await as(id).mutation(api.messages.send, { conversationId, body });
  };
  const read = async (id: Id<"users">) => {
    vi.advanceTimersByTime(1000);
    await as(id).mutation(api.readStates.markRead, { conversationId });
  };
  const unread = async (id: Id<"users">) => (await as(id).query(api.hubs.mine, {}))[0]?.unread;
  return { t, hubId, conversationId, kari, ola, anna, as, say, read, unread };
}

describe("unread counts", () => {
  it("counts others' messages since you last read, not your own", async () => {
    const { kari, ola, say, read, unread } = await setup();
    await say(kari, "1");
    await say(kari, "2");
    await say(ola, "3");
    expect(await unread(ola)).toBe(2);
    expect(await unread(kari)).toBe(1);
    await read(ola);
    expect(await unread(ola)).toBe(0);
    await say(kari, "4");
    expect(await unread(ola)).toBe(1);
  });

  it("starts from when you joined, and skips deleted messages", async () => {
    const { t, hubId, kari, as, say, unread } = await setup();
    await say(kari, "before Per joined");
    const per = await t.run((ctx) => ctx.db.insert("users", { name: "Per" }));
    vi.advanceTimersByTime(1000);
    await t.run((ctx) =>
      ctx.db.insert("hubMembers", {
        hubId,
        userId: per,
        role: "member",
        status: "active",
        notifyLevel: "all",
      }),
    );
    expect(await unread(per)).toBe(0);
    const oops = await say(kari, "oops");
    expect(await unread(per)).toBe(1);
    await as(kari).mutation(api.messages.remove, { messageId: oops });
    expect(await unread(per)).toBe(0);
  });
});

describe("seen by", () => {
  it("counts readers of the latest message other than its author", async () => {
    const { conversationId, kari, ola, anna, as, say, read } = await setup();
    await say(kari, "Hei");
    await read(kari);
    await read(ola);
    const latest = await say(kari, "Ses i morgen");
    expect(await as(kari).query(api.readStates.seenBy, { conversationId })).toEqual({
      messageId: latest,
      count: 0,
    });
    await read(ola);
    await read(anna);
    expect((await as(kari).query(api.readStates.seenBy, { conversationId }))?.count).toBe(2);
  });

  it("is for members only", async () => {
    const { t, conversationId, as } = await setup();
    const per = await t.run((ctx) => ctx.db.insert("users", { name: "Per" }));
    expect(await as(per).query(api.readStates.seenBy, { conversationId })).toBeNull();
    await expect(as(per).mutation(api.readStates.markRead, { conversationId })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });
});
