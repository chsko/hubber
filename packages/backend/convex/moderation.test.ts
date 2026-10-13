import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

/** Kari owns a hub with Ola and Per in it; Eva is outside. */
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    kari: await ctx.db.insert("users", { name: "Kari" }),
    ola: await ctx.db.insert("users", { name: "Ola" }),
    per: await ctx.db.insert("users", { name: "Per" }),
    eva: await ctx.db.insert("users", { name: "Eva" }),
  }));
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(ids.kari).mutation(api.hubs.create, { name: "3B", template: "friends" });
  await t.run(async (ctx) => {
    for (const userId of [ids.ola, ids.per]) {
      await ctx.db.insert("hubMembers", {
        hubId,
        userId,
        role: "member",
        status: "active",
        notifyLevel: "all",
      });
    }
  });
  const conversationId = (await as(ids.kari).query(api.messages.hubConversation, { hubId }))!;
  const send = (from: Id<"users">, body: string, extra = {}) =>
    as(from).mutation(api.messages.send, { conversationId, body, ...extra });
  const bodies = async (who: Id<"users">) =>
    (
      await as(who).query(api.messages.list, {
        conversationId,
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page.map((m) => m.body);
  return { t, ids, as, hubId, conversationId, send, bodies };
}

describe("reports", () => {
  it("records a report with its hub, for the dashboard queue", async () => {
    const { t, ids, as, hubId, send } = await setup();
    const messageId = await send(ids.ola, "Kjøp billige klokker!");
    const result = await as(ids.per).mutation(api.moderation.report, {
      targetType: "message",
      targetId: messageId,
      reason: "spam",
      details: "  Reklame  ",
    });
    expect(result).toEqual({ ok: true });
    const open = await t.query(internal.moderation.openReports, {});
    expect(open).toMatchObject([
      {
        targetType: "message",
        targetId: messageId,
        hubId,
        reason: "spam",
        details: "Reklame",
        reporterName: "Per",
        content: { body: "Kjøp billige klokker!" },
      },
    ]);
    await t.mutation(internal.moderation.handleReport, {
      reportId: open[0]!._id,
      status: "resolved",
      note: "Message removed",
    });
    expect(await t.query(internal.moderation.openReports, {})).toEqual([]);
  });

  it("only lets you report what you can see, and not your own messages", async () => {
    const { ids, as, hubId, send } = await setup();
    const messageId = await send(ids.ola, "Hei");
    const report = (who: Id<"users">, targetType: "message" | "hub", targetId: string) =>
      as(who).mutation(api.moderation.report, { targetType, targetId, reason: "other" });
    await expect(report(ids.eva, "message", messageId)).rejects.toThrow(/FORBIDDEN/);
    await expect(report(ids.eva, "hub", hubId)).rejects.toThrow(/FORBIDDEN/);
    await expect(report(ids.ola, "message", messageId)).rejects.toThrow(/FORBIDDEN/);
    await expect(report(ids.per, "message", "not-an-id")).rejects.toThrow(/FORBIDDEN/);
    expect(await report(ids.per, "hub", hubId)).toEqual({ ok: true });
  });

  it("limits how many reports one person can send in a day", async () => {
    const { ids, as } = await setup();
    const results = [];
    for (let i = 0; i < 21; i++) {
      results.push(
        await as(ids.per).mutation(api.moderation.report, {
          targetType: "user",
          targetId: ids.ola,
          reason: "harassment",
        }),
      );
    }
    expect(results.at(-2)).toEqual({ ok: true });
    expect(results.at(-1)).toEqual({ ok: false, reason: "RATE_LIMITED" });
  });
});

describe("blocking", () => {
  it("hides each person's messages from the other, both ways", async () => {
    const { ids, as, send, bodies } = await setup();
    await send(ids.ola, "Fra Ola");
    await send(ids.per, "Fra Per");
    await send(ids.kari, "Fra Kari");
    await as(ids.per).mutation(api.moderation.block, { userId: ids.ola });
    expect(await bodies(ids.per)).toEqual(["Fra Kari", "Fra Per"]);
    expect(await bodies(ids.ola)).toEqual(["Fra Kari", "Fra Ola"]);
    expect(await bodies(ids.kari)).toHaveLength(3);
    expect(await as(ids.per).query(api.moderation.blocked, {})).toEqual([
      { userId: ids.ola, name: "Ola" },
    ]);
    await as(ids.per).mutation(api.moderation.unblock, { userId: ids.ola });
    expect(await bodies(ids.per)).toHaveLength(3);
  });

  it("drops mentions across a block, doesn't count their messages as unread, and marks them in members", async () => {
    const { ids, as, hubId, send } = await setup();
    await as(ids.per).mutation(api.moderation.block, { userId: ids.ola });
    const messageId = await send(ids.ola, "Hei @Per", { mentions: [ids.per] });
    const stored = await as(ids.kari).query(api.messages.list, {
      conversationId: (await as(ids.kari).query(api.messages.hubConversation, { hubId }))!,
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(stored.page.find((m) => m._id === messageId)?.mentions).toEqual([]);
    const mine = await as(ids.per).query(api.hubs.mine, {});
    expect(mine[0]?.unread).toBe(0);
    const members = await as(ids.per).query(api.hubs.members, { hubId });
    expect(members.find((m) => m.userId === ids.ola)?.blocked).toBe(true);
  });

  it("can't block yourself", async () => {
    const { ids, as } = await setup();
    await expect(as(ids.per).mutation(api.moderation.block, { userId: ids.per })).rejects.toThrow(
      /INVALID_BLOCK/,
    );
  });
});
