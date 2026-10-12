import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const [kari, ola] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { name: "Kari Nordmann" }),
    await ctx.db.insert("users", { name: "Ola Hansen" }),
  ]);
  return {
    t,
    kari,
    ola,
    asKari: t.withIdentity({ subject: `${kari}|s` }),
    asOla: t.withIdentity({ subject: `${ola}|s` }),
  };
}

describe("hubs.create", () => {
  it("makes the creator owner, applies template defaults and creates the hub chat", async () => {
    const { t, kari, asKari } = await setup();
    const hubId = await asKari.mutation(api.hubs.create, {
      name: " 3B  Foreldre ",
      template: "class",
    });

    const { hub, members, conversations } = await t.run(async (ctx) => ({
      hub: await ctx.db.get(hubId),
      members: await ctx.db.query("hubMembers").collect(),
      conversations: await ctx.db.query("conversations").collect(),
    }));
    expect(hub).toMatchObject({
      name: "3B Foreldre",
      template: "class",
      emoji: "🎒",
      ownerId: kari,
      joinApproval: true,
    });
    expect(members).toEqual([
      expect.objectContaining({
        hubId,
        userId: kari,
        role: "owner",
        status: "active",
        notifyLevel: "important",
      }),
    ]);
    expect(conversations).toEqual([expect.objectContaining({ kind: "hub", hubId })]);
  });

  it("uses open, chattier defaults for family and friends", async () => {
    const { t, asKari } = await setup();
    const hubId = await asKari.mutation(api.hubs.create, { name: "Familien", template: "family" });
    const hub = await t.run((ctx) => ctx.db.get(hubId));
    const member = await t.run((ctx) => ctx.db.query("hubMembers").first());
    expect(hub?.joinApproval).toBe(false);
    expect(member?.notifyLevel).toBe("all");
  });

  it("accepts a chosen emoji and rejects text in its place", async () => {
    const { asKari } = await setup();
    const hubId = await asKari.mutation(api.hubs.create, {
      name: "Fotball",
      template: "other",
      emoji: "⚽",
    });
    expect((await asKari.query(api.hubs.get, { hubId }))?.emoji).toBe("⚽");
    await expect(
      asKari.mutation(api.hubs.create, { name: "X", template: "other", emoji: "hi" }),
    ).rejects.toThrow(/INVALID_EMOJI/);
  });

  it("rejects empty and overlong names", async () => {
    const { asKari } = await setup();
    await expect(
      asKari.mutation(api.hubs.create, { name: "   ", template: "friends" }),
    ).rejects.toThrow(/INVALID_NAME/);
    await expect(
      asKari.mutation(api.hubs.create, { name: "x".repeat(61), template: "friends" }),
    ).rejects.toThrow(/INVALID_NAME/);
  });

  it("requires sign-in", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.hubs.create, { name: "X", template: "other" })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
  });
});

describe("hubs.mine", () => {
  it("lists my hubs, most recently active first, with pending ones marked", async () => {
    const { t, ola, asKari, asOla } = await setup();
    const older = await asKari.mutation(api.hubs.create, { name: "Older", template: "friends" });
    const newer = await asKari.mutation(api.hubs.create, { name: "Newer", template: "friends" });
    await asOla.mutation(api.hubs.create, { name: "Ola's", template: "family" });
    await t.run(async (ctx) => {
      await ctx.db.patch(older, { lastActivityAt: 1 });
      await ctx.db.patch(newer, { lastActivityAt: 2 });
      // A pending membership is listed for Ola, but not counted as a member.
      await ctx.db.insert("hubMembers", {
        hubId: older,
        userId: ola,
        role: "member",
        status: "pending",
        notifyLevel: "all",
      });
    });

    const mine = await asKari.query(api.hubs.mine, {});
    expect(mine.map((h) => h.name)).toEqual(["Newer", "Older"]);
    expect(mine[0]).toMatchObject({ role: "owner", memberCount: 1, emoji: "🎉", iconUrl: null });
    expect(mine[1]).toMatchObject({ memberCount: 1 });
    const olas = await asOla.query(api.hubs.mine, {});
    expect(olas.map((h) => [h.name, h.status])).toEqual([
      ["Ola's", "active"],
      ["Older", "pending"],
    ]);
  });
});

describe("hubs.get and hubs.members", () => {
  it("are for members only (null and empty for others, so live views don't crash)", async () => {
    const { asKari, asOla } = await setup();
    const hubId = await asKari.mutation(api.hubs.create, { name: "3B", template: "class" });
    expect(await asKari.query(api.hubs.get, { hubId })).toMatchObject({
      name: "3B",
      myRole: "owner",
      memberCount: 1,
      joinApproval: true,
    });
    expect(await asOla.query(api.hubs.get, { hubId })).toBeNull();
    expect(await asOla.query(api.hubs.members, { hubId })).toEqual([]);
  });

  it("lists owners and admins first, then by name", async () => {
    const { t, ola, asKari } = await setup();
    const hubId = await asKari.mutation(api.hubs.create, { name: "3B", template: "class" });
    await t.run(async (ctx) => {
      const anna = await ctx.db.insert("users", { name: "Anna Berg" });
      for (const [userId, role] of [
        [anna, "member"],
        [ola, "admin"],
      ] as const) {
        await ctx.db.insert("hubMembers", {
          hubId,
          userId,
          role,
          status: "active",
          notifyLevel: "all",
        });
      }
    });
    const members = await asKari.query(api.hubs.members, { hubId });
    expect(members.map((m) => [m.name, m.role])).toEqual([
      ["Kari Nordmann", "owner"],
      ["Ola Hansen", "admin"],
      ["Anna Berg", "member"],
    ]);
    expect(members[0]).not.toHaveProperty("phone");
    expect(members.map((m) => m.isMe)).toEqual([true, false, false]);
  });
});
