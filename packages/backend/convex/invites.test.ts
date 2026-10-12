import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { normalizeCode } from "./invites";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup(template: "class" | "friends" = "friends") {
  const t = convexTest(schema, modules);
  const [kari, ola, ingrid] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { name: "Kari Nordmann" }),
    await ctx.db.insert("users", { name: "Ola Hansen" }),
    await ctx.db.insert("users", { name: "Ingrid Berg" }),
  ]);
  const as = (id: typeof kari) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(kari).mutation(api.hubs.create, { name: "Hub", template });
  return { t, hubId, kari, ola, ingrid, asKari: as(kari), asOla: as(ola), asIngrid: as(ingrid) };
}

describe("normalizeCode", () => {
  it("accepts codes typed loosely or pasted as links", () => {
    expect(normalizeCode("abcd-efgh-23")).toBe("ABCDEFGH23");
    expect(normalizeCode(" https://hubbr.no/i/ABCDEFGH23 ")).toBe("ABCDEFGH23");
    expect(normalizeCode("hubber://i/abcdefgh23")).toBe("ABCDEFGH23");
  });
});

describe("invites.current", () => {
  it("creates one 30-day link and then keeps returning it", async () => {
    const { hubId, asKari } = await setup();
    const first = await asKari.mutation(api.invites.current, { hubId });
    expect(first.code).toMatch(/^[2-9A-HJKMNP-Z]{10}$/);
    expect(first.expiresAt).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
    expect((await asKari.mutation(api.invites.current, { hubId })).code).toBe(first.code);
  });

  it("is for members only", async () => {
    const { hubId, asOla } = await setup();
    await expect(asOla.mutation(api.invites.current, { hubId })).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("invites.redeem", () => {
  it("joins an open hub directly and counts the use", async () => {
    const { t, hubId, asKari, asOla } = await setup("friends");
    const { code } = await asKari.mutation(api.invites.current, { hubId });

    expect(await asOla.query(api.invites.preview, { code })).toMatchObject({
      name: "Hub",
      memberCount: 1,
      joinApproval: false,
      myStatus: null,
    });
    expect(await asOla.mutation(api.invites.redeem, { code: code.toLowerCase() })).toEqual({
      ok: true,
      hubId,
      status: "active",
    });
    expect((await asOla.query(api.hubs.get, { hubId }))?.memberCount).toBe(2);
    expect((await t.run((ctx) => ctx.db.query("invites").first()))?.uses).toBe(1);

    // Redeeming again changes nothing.
    await asOla.mutation(api.invites.redeem, { code });
    expect((await t.run((ctx) => ctx.db.query("invites").first()))?.uses).toBe(1);
  });

  it("waits for approval in a class hub, and the admin approves", async () => {
    const { hubId, ola, asKari, asOla } = await setup("class");
    const { code } = await asKari.mutation(api.invites.current, { hubId });
    expect(await asOla.mutation(api.invites.redeem, { code })).toMatchObject({ status: "pending" });
    expect(await asOla.query(api.hubs.get, { hubId })).toBeNull();
    expect((await asOla.query(api.invites.preview, { code }))?.myStatus).toBe("pending");

    expect(await asKari.query(api.hubs.pending, { hubId })).toEqual([
      expect.objectContaining({ userId: ola, name: "Ola Hansen" }),
    ]);
    expect(await asOla.query(api.hubs.pending, { hubId })).toEqual([]);
    await asKari.mutation(api.hubs.approve, { hubId, userId: ola });
    expect((await asOla.query(api.hubs.get, { hubId }))?.myRole).toBe("member");
    expect(await asKari.query(api.hubs.pending, { hubId })).toEqual([]);
  });

  it("lets the admin decline, and the person cancel their own request", async () => {
    const { hubId, ola, asKari, asOla, asIngrid } = await setup("class");
    const { code } = await asKari.mutation(api.invites.current, { hubId });
    await asOla.mutation(api.invites.redeem, { code });
    await asIngrid.mutation(api.invites.redeem, { code });

    await asKari.mutation(api.hubs.decline, { hubId, userId: ola });
    expect((await asOla.query(api.hubs.mine, {})).length).toBe(0);
    await asIngrid.mutation(api.hubs.cancelRequest, { hubId });
    expect(await asKari.query(api.hubs.pending, { hubId })).toEqual([]);
  });

  it("rejects revoked and expired links", async () => {
    vi.useFakeTimers();
    try {
      const { hubId, asKari, asOla } = await setup();
      const old = await asKari.mutation(api.invites.current, { hubId });
      const day = await asKari.mutation(api.invites.renew, { hubId, expiresInDays: 1 });
      expect(day.code).not.toBe(old.code);
      expect(await asOla.mutation(api.invites.redeem, { code: old.code })).toEqual({
        ok: false,
        reason: "INVALID_CODE",
      });
      expect(await asOla.query(api.invites.preview, { code: old.code })).toBeNull();

      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(await asOla.mutation(api.invites.redeem, { code: day.code })).toMatchObject({
        ok: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("only lets admins renew or revoke links", async () => {
    const { hubId, asKari, asOla } = await setup();
    const { code } = await asKari.mutation(api.invites.current, { hubId });
    await asOla.mutation(api.invites.redeem, { code });
    await expect(asOla.mutation(api.invites.renew, { hubId, expiresInDays: null })).rejects.toThrow(
      /FORBIDDEN/,
    );
    await expect(asOla.mutation(api.invites.revokeAll, { hubId })).rejects.toThrow(/FORBIDDEN/);
    await expect(
      asOla.mutation(api.hubs.setJoinApproval, { hubId, joinApproval: true }),
    ).rejects.toThrow(/FORBIDDEN/);
    await asKari.mutation(api.invites.revokeAll, { hubId });
    expect(await asOla.query(api.invites.preview, { code })).toBeNull();
  });

  it("rate-limits guessing: 10 bad codes an hour, then nothing works until the hour is up", async () => {
    vi.useFakeTimers();
    const { hubId, asKari, asOla } = await setup();
    const { code } = await asKari.mutation(api.invites.current, { hubId });
    for (let i = 0; i < 10; i++) {
      expect(await asOla.mutation(api.invites.redeem, { code: `WRONG${i}` })).toMatchObject({
        reason: "INVALID_CODE",
      });
    }
    expect(await asOla.mutation(api.invites.redeem, { code: "WRONG" })).toMatchObject({
      reason: "RATE_LIMITED",
    });
    // Over the limit even a valid code is refused, so guessing can't confirm a hit.
    expect(await asOla.mutation(api.invites.redeem, { code })).toMatchObject({
      reason: "RATE_LIMITED",
    });
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(await asOla.mutation(api.invites.redeem, { code })).toMatchObject({ ok: true });
    vi.useRealTimers();
  });
});
