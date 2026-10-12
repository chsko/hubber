import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BUNDLE_WINDOW_MS, inQuietHours } from "./push";
import schema from "./schema";
import { modules } from "./test.setup";

type Sent = { to: string; title: string; body: string; badge: number; sound: string | null };

/** Kari owns a hub; Ola ("all") and Per ("important") are members with a device each. */
async function setup(template: "friends" | "class" = "friends") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    kari: await ctx.db.insert("users", { name: "Kari", locale: "nb" }),
    ola: await ctx.db.insert("users", { name: "Ola", locale: "en" }),
    per: await ctx.db.insert("users", { name: "Per" }),
  }));
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(ids.kari).mutation(api.hubs.create, { name: "3B", template });
  await t.run(async (ctx) => {
    for (const [userId, notifyLevel] of [
      [ids.ola, "all"],
      [ids.per, "important"],
    ] as const) {
      await ctx.db.insert("hubMembers", {
        hubId,
        userId,
        role: "member",
        status: "active",
        notifyLevel,
      });
    }
  });
  for (const id of [ids.kari, ids.ola, ids.per]) {
    await as(id).mutation(api.push.registerToken, {
      token: `ExponentPushToken[${id}]`,
      platform: "ios",
    });
  }
  const conversationId = (await as(ids.kari).query(api.messages.hubConversation, { hubId }))!;
  const send = (from: Id<"users">, body: string, extra = {}) =>
    as(from).mutation(api.messages.send, { conversationId, body, ...extra });
  const settle = () => t.finishAllScheduledFunctions(() => vi.runAllTimers());
  return { t, ids, as, hubId, conversationId, send, settle };
}

let sent: Sent[];

beforeEach(() => {
  vi.useFakeTimers();
  // Daytime in Oslo, so pushes make a sound.
  vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: { body: string }) => {
      const batch = JSON.parse(init.body) as Sent[];
      sent.push(...batch);
      return Promise.resolve(Response.json({ data: batch.map(() => ({ status: "ok" })) }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const tokenOf = (id: Id<"users">) => `ExponentPushToken[${id}]`;

describe("push notifications", () => {
  it("knows quiet hours in Oslo time", () => {
    expect(inQuietHours(Date.parse("2026-10-12T20:30:00Z"))).toBe(true); // 22:30 Oslo
    expect(inQuietHours(Date.parse("2026-10-12T04:59:00Z"))).toBe(true); // 06:59
    expect(inQuietHours(Date.parse("2026-10-12T05:00:00Z"))).toBe(false); // 07:00
    expect(inQuietHours(Date.parse("2026-10-12T19:59:00Z"))).toBe(false); // 21:59
  });

  it("pushes mentions at once, in the recipient's language", async () => {
    const { ids, send, settle } = await setup();
    await send(ids.kari, "Hei @Per og @Ola", { mentions: [ids.per, ids.ola] });
    await settle();
    const now = sent.filter((p) => p.title.includes("·"));
    expect(now.map((p) => [p.to, p.title, p.body])).toEqual([
      [tokenOf(ids.ola), "Kari mentioned you · 3B", "Hei @Per og @Ola"],
      [tokenOf(ids.per), "Kari nevnte deg · 3B", "Hei @Per og @Ola"],
    ]);
    expect(now[0]!.sound).toBe("default");
    expect(sent.some((p) => p.to === tokenOf(ids.kari))).toBe(false);
  });

  it("pushes a reply to your message even on 'important only'", async () => {
    const { ids, as, conversationId, send, settle } = await setup();
    const replyToId = await send(ids.per, "Når er foreldremøtet?");
    await as(ids.per).mutation(api.readStates.markRead, { conversationId });
    await settle();
    sent = [];
    await send(ids.kari, "Torsdag kl. 18", { replyToId });
    await settle();
    expect(sent.find((p) => p.to === tokenOf(ids.per))?.title).toBe("Kari svarte deg · 3B");
  });

  it("bundles ordinary messages for 'all' and skips 'important' and 'muted'", async () => {
    const { t, ids, as, hubId, send } = await setup();
    await as(ids.kari).mutation(api.hubs.setNotifyLevel, { hubId, level: "muted" });
    await send(ids.ola, "Hei!");
    await send(ids.kari, "Hallo");
    await send(ids.kari, "Hvem kommer?");
    await send(ids.kari, "Noen?");
    await t.finishInProgressScheduledFunctions();
    expect(sent).toEqual([]);
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(BUNDLE_WINDOW_MS));
    expect(sent.map((p) => [p.to, p.title, p.body, p.badge])).toEqual([
      [tokenOf(ids.ola), "3B", "3 new messages", 3],
    ]);
  });

  it("skips the bundle when the messages were read in the meantime", async () => {
    const { t, ids, as, conversationId, send, settle } = await setup();
    await send(ids.kari, "Hallo");
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(1000);
    await as(ids.ola).mutation(api.readStates.markRead, { conversationId });
    await settle();
    expect(sent).toEqual([]);
  });

  it("delivers silently during quiet hours, unless turned off", async () => {
    const { ids, as, send, settle } = await setup();
    vi.setSystemTime(new Date("2026-10-12T21:00:00Z")); // 23:00 Oslo
    await as(ids.ola).mutation(api.push.setQuietHours, { enabled: false });
    expect((await as(ids.ola).query(api.users.me, {}))?.quietHours).toBe(false);
    await send(ids.kari, "@Per @Ola", { mentions: [ids.per, ids.ola] });
    await settle();
    const byTo = Object.fromEntries(sent.map((p) => [p.to, p.sound] as const));
    expect(byTo[tokenOf(ids.per)]).toBeNull();
    expect(byTo[tokenOf(ids.ola)]).toBe("default");
  });

  it("moves a token to whoever signs in on the device, and forgets it on sign-out", async () => {
    const { t, ids, as } = await setup();
    const token = tokenOf(ids.kari);
    await as(ids.ola).mutation(api.push.registerToken, { token, platform: "ios" });
    await as(ids.kari).mutation(api.push.unregisterToken, { token });
    const owner = async () =>
      t.run(async (ctx) => {
        const row = await ctx.db
          .query("pushTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .unique();
        return row?.userId ?? null;
      });
    expect(await owner()).toBe(ids.ola);
    await as(ids.ola).mutation(api.push.unregisterToken, { token });
    expect(await owner()).toBeNull();
    // Not an Expo token: ignored.
    await as(ids.ola).mutation(api.push.registerToken, { token: "nope", platform: "ios" });
    expect(await t.run((ctx) => ctx.db.query("pushTokens").collect())).toHaveLength(2);
  });

  it("prunes tokens Expo reports as no longer registered", async () => {
    const { t, ids, send, settle } = await setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
          }),
        ),
      ),
    );
    await send(ids.kari, "@Per", { mentions: [ids.per] });
    await settle();
    const tokens = await t.run((ctx) => ctx.db.query("pushTokens").collect());
    expect(tokens.map((r) => r.token)).not.toContain(tokenOf(ids.per));
  });
});
