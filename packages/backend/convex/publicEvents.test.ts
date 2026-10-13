import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 12, 10, 0);
const OSLO = "0301";
const BERGEN = "4601";

type Sent = { to: string; title: string; body: string };
let sent: Sent[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
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

/** Kari owns a hub with Ola in it; Eva is outside it. */
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    kari: await ctx.db.insert("users", { name: "Kari" }),
    ola: await ctx.db.insert("users", { name: "Ola" }),
    eva: await ctx.db.insert("users", { name: "Eva" }),
  }));
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(ids.kari).mutation(api.hubs.create, { name: "Lia", template: "friends" });
  await t.run((ctx) =>
    ctx.db.insert("hubMembers", {
      hubId,
      userId: ids.ola,
      role: "member",
      status: "active",
      notifyLevel: "all",
    }),
  );
  for (const id of [ids.kari, ids.ola, ids.eva]) {
    await as(id).mutation(api.push.registerToken, {
      token: `ExponentPushToken[${id}]`,
      platform: "ios",
    });
  }
  const createPublic = (extra: Record<string, unknown> = {}) =>
    as(ids.kari).mutation(api.events.create, {
      visibility: "public",
      title: "Loppemarked på Lia",
      startsAt: NOW + 48 * HOUR,
      place: "Lia skole",
      kommuneNr: OSLO,
      category: "social",
      ...extra,
    });
  const discover = (who: Id<"users">, extra: Record<string, unknown> = {}) =>
    as(who).query(api.events.discover, { from: NOW, to: NOW + 30 * DAY, ...extra });
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
  };
  return { t, ids, as, hubId, createPublic, discover, settle };
}

describe("public events", () => {
  it("needs a category and a kommune", async () => {
    const { createPublic } = await setup();
    await expect(createPublic({ category: null })).rejects.toThrow(/category/);
    await expect(createPublic({ kommuneNr: null })).rejects.toThrow(/kommuneNr/);
    await expect(createPublic({ kommuneNr: "Oslo" })).rejects.toThrow(/kommuneNr/);
    // A place picked from address search brings its kommune.
    await expect(
      createPublic({
        kommuneNr: null,
        place: { text: "Bryggen 1, Bergen", lat: 60.39, lon: 5.32, kommuneNr: BERGEN },
      }),
    ).resolves.toBeDefined();
  });

  it("is visible to everyone, but its chat and guest list only to those coming", async () => {
    const { ids, as, createPublic, discover } = await setup();
    const eventId = await createPublic();
    const seen = await as(ids.eva).query(api.events.get, { eventId });
    expect(seen).toMatchObject({
      visibility: "public",
      category: "social",
      kommuneNr: OSLO,
      host: { name: "Kari" },
      hub: null,
      inHub: false,
      canManage: false,
      conversationId: null,
      counts: { yes: 1 },
    });
    expect(await as(ids.eva).query(api.events.attendees, { eventId })).toBeNull();

    await as(ids.eva).mutation(api.events.rsvp, { eventId, status: "yes" });
    const joined = (await as(ids.eva).query(api.events.get, { eventId }))!;
    expect(joined.conversationId).not.toBeNull();
    await as(ids.eva).mutation(api.messages.send, {
      conversationId: joined.conversationId!,
      body: "Kan jeg ta med en stand?",
    });
    const attendees = await as(ids.eva).query(api.events.attendees, { eventId });
    expect(attendees?.yes.map((p) => p.name)).toEqual(["Kari", "Eva"]);
    expect(attendees?.noReply).toEqual([]);
    expect(await discover(ids.eva)).toMatchObject([{ _id: eventId, hostName: "Kari" }]);
  });

  it("filters Discover by kommune, category, dates and title, in start order", async () => {
    const { ids, as, createPublic, discover } = await setup();
    const later = await createPublic({ title: "Quiz", startsAt: NOW + 5 * DAY });
    const soon = await createPublic({ startsAt: NOW + 2 * HOUR, category: "outdoors" });
    const bergen = await createPublic({ kommuneNr: BERGEN, title: "Konsert", category: "culture" });
    const called = await createPublic({ title: "Avlyst", startsAt: NOW + DAY });
    await as(ids.kari).mutation(api.events.cancel, { eventId: called });

    expect((await discover(ids.eva, { kommuneNr: OSLO })).map((e) => e._id)).toEqual([soon, later]);
    expect((await discover(ids.eva)).map((e) => e._id)).toEqual([soon, bergen, later]);
    expect((await discover(ids.eva, { category: "culture" })).map((e) => e._id)).toEqual([bergen]);
    expect((await discover(ids.eva, { to: NOW + DAY })).map((e) => e._id)).toEqual([soon]);
    expect((await discover(ids.eva, { search: "quiz" })).map((e) => e._id)).toEqual([later]);
  });

  it("leaves hub events out of Discover and away from outsiders", async () => {
    const { ids, as, hubId, discover } = await setup();
    const eventId = await as(ids.kari).mutation(api.events.create, {
      hubId,
      title: "Hyttetur",
      startsAt: NOW + 48 * HOUR,
      kommuneNr: OSLO,
      category: "outdoors",
    });
    expect(await discover(ids.eva)).toEqual([]);
    expect(await as(ids.eva).query(api.events.get, { eventId })).toBeNull();
    await expect(as(ids.eva).mutation(api.events.rsvp, { eventId, status: "yes" })).rejects.toThrow(
      /FORBIDDEN/,
    );
    // Category is for public events only.
    expect((await as(ids.ola).query(api.events.get, { eventId }))?.category).toBeNull();
  });

  it("tells the hub about a public event hosted on its behalf, and those coming about changes", async () => {
    const { ids, as, hubId, createPublic, discover, settle } = await setup();
    const eventId = await createPublic({ hubId });
    await settle();
    expect(sent.map((p) => p.to)).toEqual([`ExponentPushToken[${ids.ola}]`]);
    expect((await discover(ids.eva)).map((e) => e.hubName)).toEqual(["Lia"]);
    // Hub members see it from inside the hub, chat included.
    expect((await as(ids.ola).query(api.events.get, { eventId }))?.inHub).toBe(true);

    await as(ids.eva).mutation(api.events.rsvp, { eventId, status: "maybe" });
    sent = [];
    await as(ids.kari).mutation(api.events.update, {
      eventId,
      title: "Loppemarked på Lia",
      startsAt: NOW + 72 * HOUR,
      place: "Lia skole",
      kommuneNr: OSLO,
      category: "social",
    });
    await settle();
    expect(sent.map((p) => p.to)).toEqual([`ExponentPushToken[${ids.eva}]`]);
  });

  it("limits how many public events one person creates in a day", async () => {
    const { createPublic } = await setup();
    for (let i = 0; i < 5; i++) await createPublic();
    await expect(createPublic()).rejects.toThrow(/RATE_LIMITED/);
    vi.advanceTimersByTime(DAY);
    await expect(createPublic()).resolves.toBeDefined();
  });

  it("hides events across a block", async () => {
    const { ids, as, createPublic, discover } = await setup();
    const eventId = await createPublic();
    await as(ids.eva).mutation(api.moderation.block, { userId: ids.kari });
    expect(await discover(ids.eva)).toEqual([]);
    expect(await as(ids.eva).query(api.events.get, { eventId })).toBeNull();
  });

  it("puts public events you're going to in your calendar", async () => {
    const { ids, as, createPublic } = await setup();
    const eventId = await createPublic();
    const range = () => as(ids.eva).query(api.calendar.range, { from: NOW, to: NOW + 7 * DAY });
    expect(await range()).toEqual([]);
    await as(ids.eva).mutation(api.events.rsvp, { eventId, status: "yes" });
    expect(await range()).toMatchObject([{ _id: eventId, hubName: null }]);
    expect(await as(ids.eva).query(api.events.mine, {})).toMatchObject([{ _id: eventId }]);
  });

  it("calls off your own public events when you delete your account", async () => {
    const { t, ids, as, hubId, createPublic, settle } = await setup();
    await as(ids.kari).mutation(api.hubs.transferOwnership, { hubId, userId: ids.ola });
    const eventId = await createPublic();
    await as(ids.eva).mutation(api.events.rsvp, { eventId, status: "yes" });
    await settle();
    sent = [];
    await as(ids.kari).mutation(api.account.deleteAccount, {});
    await settle();
    expect((await t.run((ctx) => ctx.db.get(eventId)))?.cancelledAt).toBeDefined();
    expect(sent.map((p) => p.to)).toEqual([`ExponentPushToken[${ids.eva}]`]);
  });
});
