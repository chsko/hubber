import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

/** A hub owned by Kari, with Ola as admin and Anna and Per as members. */
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const kari = await ctx.db.insert("users", { name: "Kari", phone: "+4790000001" });
    const ola = await ctx.db.insert("users", { name: "Ola" });
    const anna = await ctx.db.insert("users", { name: "Anna" });
    const per = await ctx.db.insert("users", { name: "Per" });
    return { kari, ola, anna, per };
  });
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(ids.kari).mutation(api.hubs.create, { name: "3B", template: "friends" });
  await t.run(async (ctx) => {
    for (const [userId, role] of [
      [ids.ola, "admin"],
      [ids.anna, "member"],
      [ids.per, "member"],
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
  const roles = async (): Promise<Record<string, string>> =>
    Object.fromEntries(
      (await as(ids.kari).query(api.hubs.members, { hubId })).map(
        (m) => [m.name ?? "", m.role] as const,
      ),
    );
  return { t, hubId, ...ids, as, roles };
}

describe("members list", () => {
  it("shows name, photo and role, marks me, and never phone or email", async () => {
    const { hubId, anna, as } = await setup();
    const members = await as(anna).query(api.hubs.members, { hubId });
    expect(members.map((m) => m.name)).toEqual(["Kari", "Ola", "Anna", "Per"]);
    expect(members.find((m) => m.isMe)?.name).toBe("Anna");
    for (const m of members) {
      expect(Object.keys(m).sort()).toEqual(["isMe", "name", "photoUrl", "role", "userId"]);
    }
  });
});

describe("hubs.setRole", () => {
  it("lets admins promote members", async () => {
    const { hubId, ola, anna, as, roles } = await setup();
    await as(ola).mutation(api.hubs.setRole, { hubId, userId: anna, role: "admin" });
    expect((await roles()).Anna).toBe("admin");
  });

  it("lets only the owner demote another admin", async () => {
    const { hubId, kari, ola, anna, as, roles } = await setup();
    await as(kari).mutation(api.hubs.setRole, { hubId, userId: anna, role: "admin" });
    await expect(
      as(ola).mutation(api.hubs.setRole, { hubId, userId: anna, role: "member" }),
    ).rejects.toThrow(/FORBIDDEN/);
    await as(kari).mutation(api.hubs.setRole, { hubId, userId: anna, role: "member" });
    expect((await roles()).Anna).toBe("member");
    // Stepping down yourself is fine.
    await as(ola).mutation(api.hubs.setRole, { hubId, userId: ola, role: "member" });
    expect((await roles()).Ola).toBe("member");
  });

  it("never changes the owner, and members can't change roles", async () => {
    const { hubId, kari, ola, anna, per, as } = await setup();
    await expect(
      as(ola).mutation(api.hubs.setRole, { hubId, userId: kari, role: "member" }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      as(anna).mutation(api.hubs.setRole, { hubId, userId: per, role: "admin" }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("hubs.removeMember", () => {
  it("lets admins remove members, but only the owner remove admins", async () => {
    const { hubId, kari, ola, anna, as, roles } = await setup();
    await as(ola).mutation(api.hubs.removeMember, { hubId, userId: anna });
    expect(await roles()).not.toHaveProperty("Anna");
    expect(await as(anna).query(api.hubs.get, { hubId })).toBeNull();

    await as(kari).mutation(api.hubs.setRole, { hubId, userId: ola, role: "admin" });
    await as(kari).mutation(api.hubs.removeMember, { hubId, userId: ola });
    expect(Object.keys(await roles())).toEqual(["Kari", "Per"]);
  });

  it("protects the owner and admins from admins, and refuses self-removal", async () => {
    const { hubId, kari, ola, anna, as } = await setup();
    await as(kari).mutation(api.hubs.setRole, { hubId, userId: anna, role: "admin" });
    await expect(as(ola).mutation(api.hubs.removeMember, { hubId, userId: kari })).rejects.toThrow(
      /FORBIDDEN/,
    );
    await expect(as(ola).mutation(api.hubs.removeMember, { hubId, userId: anna })).rejects.toThrow(
      /FORBIDDEN/,
    );
    await expect(as(ola).mutation(api.hubs.removeMember, { hubId, userId: ola })).rejects.toThrow(
      /USE_LEAVE/,
    );
  });
});

describe("hubs.transferOwnership and hubs.leave", () => {
  it("hands over ownership; the old owner becomes admin and can then leave", async () => {
    const { t, hubId, kari, anna, as, roles } = await setup();
    await expect(as(kari).mutation(api.hubs.leave, { hubId })).rejects.toThrow(
      /OWNER_MUST_TRANSFER/,
    );
    await as(kari).mutation(api.hubs.transferOwnership, { hubId, userId: anna });
    expect((await roles()).Anna).toBe("owner");
    expect((await roles()).Kari).toBe("admin");
    expect((await t.run((ctx) => ctx.db.get(hubId)))?.ownerId).toBe(anna);

    await as(kari).mutation(api.hubs.leave, { hubId });
    expect(await as(kari).query(api.hubs.mine, {})).toEqual([]);
  });

  it("is for the owner only", async () => {
    const { hubId, ola, anna, as } = await setup();
    await expect(
      as(ola).mutation(api.hubs.transferOwnership, { hubId, userId: anna }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("lets members leave", async () => {
    const { hubId, per, as, roles } = await setup();
    await as(per).mutation(api.hubs.leave, { hubId });
    expect(await roles()).not.toHaveProperty("Per");
  });
});
