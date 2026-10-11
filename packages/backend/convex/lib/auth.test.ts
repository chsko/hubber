import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { requireHubMember, requireUser } from "./auth";

type Membership = Pick<Doc<"hubMembers">, "role" | "status">;

async function setup(membership: Membership | null) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Kari" });
    const ownerId = await ctx.db.insert("users", { name: "Owner" });
    const hubId = await ctx.db.insert("hubs", {
      name: "3B Foreldre",
      template: "class",
      ownerId,
      joinApproval: true,
    });
    if (membership !== null) {
      await ctx.db.insert("hubMembers", { hubId, userId, notifyLevel: "important", ...membership });
    }
    return { userId, hubId };
  });
  const asUser = t.withIdentity({ subject: `${ids.userId}|session` });
  return { t, asUser, ...ids };
}

const codeOf = (hubId: Id<"hubs">, asUser: Awaited<ReturnType<typeof setup>>["asUser"]) =>
  asUser.run(async (ctx) => {
    try {
      await requireHubMember(ctx, hubId, "admin");
      return "OK";
    } catch (e) {
      return (e as { data?: { code?: string } }).data?.code;
    }
  });

describe("requireUser", () => {
  it("throws UNAUTHENTICATED when signed out", async () => {
    const { t } = await setup(null);
    await expect(t.run((ctx) => requireUser(ctx))).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it("returns the user when signed in", async () => {
    const { asUser, userId } = await setup(null);
    const user = await asUser.run((ctx) => requireUser(ctx));
    expect(user._id).toBe(userId);
  });
});

describe("requireHubMember", () => {
  it("allows an active member", async () => {
    const { asUser, hubId } = await setup({ role: "member", status: "active" });
    const { membership } = await asUser.run((ctx) => requireHubMember(ctx, hubId));
    expect(membership.role).toBe("member");
  });

  it("rejects a non-member with FORBIDDEN", async () => {
    const { asUser, hubId } = await setup(null);
    await expect(asUser.run((ctx) => requireHubMember(ctx, hubId))).rejects.toThrow(/FORBIDDEN/);
  });

  it("rejects a pending member", async () => {
    const { asUser, hubId } = await setup({ role: "member", status: "pending" });
    await expect(asUser.run((ctx) => requireHubMember(ctx, hubId))).rejects.toThrow(/FORBIDDEN/);
  });

  it("enforces the minimum role", async () => {
    const member = await setup({ role: "member", status: "active" });
    const admin = await setup({ role: "admin", status: "active" });
    const owner = await setup({ role: "owner", status: "active" });
    expect(await codeOf(member.hubId, member.asUser)).toBe("FORBIDDEN");
    expect(await codeOf(admin.hubId, admin.asUser)).toBe("OK");
    expect(await codeOf(owner.hubId, owner.asUser)).toBe("OK");
  });
});
