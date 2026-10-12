import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 10, 0);

type Sent = { to: string; title: string; body: string; data: { url: string } };
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

/** Kari owns the hub, Ola is a member, Per is muted, Eva is outside. */
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    kari: await ctx.db.insert("users", { name: "Kari" }),
    ola: await ctx.db.insert("users", { name: "Ola", locale: "en" }),
    per: await ctx.db.insert("users", { name: "Per" }),
    eva: await ctx.db.insert("users", { name: "Eva" }),
  }));
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(ids.kari).mutation(api.hubs.create, { name: "3B", template: "class" });
  await t.run(async (ctx) => {
    for (const [userId, notifyLevel] of [
      [ids.ola, "important"],
      [ids.per, "muted"],
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
  const create = (extra: Record<string, unknown> = {}) =>
    as(ids.kari).mutation(api.events.create, {
      hubId,
      title: "Juleavslutning",
      startsAt: NOW + 48 * HOUR,
      endsAt: NOW + 50 * HOUR,
      place: "Gymsalen, Lia skole",
      ...extra,
    });
  // Runs what's due now (pushes), not reminders scheduled for later.
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
  };
  return { t, ids, as, hubId, create, settle };
}

describe("events", () => {
  it("creates an event: host going, own chat, a card in the hub chat, members told", async () => {
    const { ids, as, hubId, create, settle } = await setup();
    const eventId = await create();
    const event = await as(ids.ola).query(api.events.get, { eventId });
    expect(event).toMatchObject({
      title: "Juleavslutning",
      place: "Gymsalen, Lia skole",
      counts: { yes: 1, maybe: 0, no: 0 },
      my: null,
      canManage: false,
      host: { name: "Kari" },
    });
    expect(event?.conversationId).not.toBeNull();

    const hubChat = (await as(ids.ola).query(api.messages.hubConversation, { hubId }))!;
    const { page } = await as(ids.ola).query(api.messages.list, {
      conversationId: hubChat,
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(page[0]?.event).toMatchObject({ _id: eventId, title: "Juleavslutning" });

    await settle();
    // Ola is told (in English); Per muted the hub; Kari made it.
    expect(sent.map((p) => [p.to, p.title, p.data.url])).toEqual([
      [`ExponentPushToken[${ids.ola}]`, "New event in 3B", `/event/${eventId}`],
    ]);
    expect(sent[0]?.body).toBe("Juleavslutning · Wed 14 Oct, 12:00");
  });

  it("is only visible to the hub's members", async () => {
    const { ids, as, hubId, create } = await setup();
    const eventId = await create();
    expect(await as(ids.eva).query(api.events.get, { eventId })).toBeNull();
    expect(await as(ids.eva).query(api.events.forHub, { hubId })).toEqual({
      upcoming: [],
      past: [],
    });
    await expect(as(ids.eva).mutation(api.events.rsvp, { eventId, status: "yes" })).rejects.toThrow(
      /FORBIDDEN/,
    );
  });

  it("keeps the coordinates and kommune of an address picked from the search", async () => {
    const { ids, as, create } = await setup();
    const eventId = await create({
      place: { text: "Lia skole, Oslo", lat: 59.95, lon: 10.86, kommuneNr: "0301" },
    });
    const event = await as(ids.ola).query(api.events.get, { eventId });
    expect(event?.place).toBe("Lia skole, Oslo");
    expect(event?.placeGeo).toEqual({ lat: 59.95, lon: 10.86, kommuneNr: "0301" });
    const stored = await as(ids.kari).query(api.events.get, { eventId });
    expect(stored?.placeGeo?.kommuneNr).toBe("0301");
  });

  it("validates the form", async () => {
    const { create } = await setup();
    await expect(create({ title: "  " })).rejects.toThrow(/INVALID_EVENT/);
    await expect(create({ endsAt: NOW + 47 * HOUR })).rejects.toThrow(/INVALID_EVENT/);
    await expect(create({ rsvpDeadline: NOW + 49 * HOUR })).rejects.toThrow(/INVALID_EVENT/);
    await expect(create({ capacity: 0 })).rejects.toThrow(/INVALID_EVENT/);
    await expect(create({ startsAt: NOW - 30 * HOUR, endsAt: null })).rejects.toThrow(
      /INVALID_EVENT/,
    );
  });

  it("lists upcoming and past events for the hub", async () => {
    const { ids, as, hubId, create } = await setup();
    const later = await create({ title: "Later", startsAt: NOW + 72 * HOUR, endsAt: null });
    const soon = await create({ title: "Soon", startsAt: NOW + HOUR, endsAt: null });
    vi.setSystemTime(NOW + 4 * HOUR);
    const { upcoming, past } = await as(ids.ola).query(api.events.forHub, { hubId });
    expect(upcoming.map((e) => e._id)).toEqual([later]);
    expect(past.map((e) => e._id)).toEqual([soon]);
  });

  it("lets the host or an admin edit and cancel, and tells those coming", async () => {
    const { ids, as, create, settle } = await setup();
    const eventId = await create();
    await as(ids.ola).mutation(api.events.rsvp, { eventId, status: "maybe" });
    await settle();
    sent = [];
    const edit = (who: Id<"users">, extra = {}) =>
      as(who).mutation(api.events.update, {
        eventId,
        title: "Juleavslutning",
        startsAt: NOW + 48 * HOUR,
        endsAt: NOW + 50 * HOUR,
        place: "Gymsalen, Lia skole",
        ...extra,
      });
    await expect(edit(ids.ola)).rejects.toThrow(/FORBIDDEN/);
    await edit(ids.kari, { description: "Ta med kake" });
    await settle();
    expect(sent).toEqual([]); // Same time and place: nobody is bothered.
    await edit(ids.kari, { place: "Aulaen" });
    await settle();
    expect(sent.map((p) => [p.to, p.title])).toEqual([
      [`ExponentPushToken[${ids.ola}]`, "Changed: Juleavslutning"],
    ]);
    sent = [];
    await as(ids.kari).mutation(api.events.cancel, { eventId });
    await settle();
    expect(sent.map((p) => p.title)).toEqual(["Cancelled: Juleavslutning"]);
    expect((await as(ids.ola).query(api.events.get, { eventId }))?.rsvpClosed).toBe(true);
    await expect(as(ids.ola).mutation(api.events.rsvp, { eventId, status: "yes" })).rejects.toThrow(
      /EVENT_CANCELLED/,
    );
  });
});

describe("RSVP", () => {
  it("records going, maybe or no with guests and a note, and lists who's coming", async () => {
    const { ids, as, create } = await setup();
    const eventId = await create();
    await as(ids.ola).mutation(api.events.rsvp, {
      eventId,
      status: "yes",
      guests: 2,
      note: "Tar med søsken",
    });
    expect((await as(ids.ola).query(api.events.get, { eventId }))?.my).toEqual({
      status: "yes",
      guests: 2,
      note: "Tar med søsken",
    });
    // Changing to maybe drops the guests but keeps the note.
    await as(ids.ola).mutation(api.events.rsvp, { eventId, status: "maybe" });
    const list = await as(ids.kari).query(api.events.attendees, { eventId });
    expect(list?.yes.map((p) => p.name)).toEqual(["Kari"]);
    expect(list?.maybe).toMatchObject([{ name: "Ola", guests: 0, note: "Tar med søsken" }]);
    expect(list?.noReply.map((p) => p.name)).toEqual(["Per"]);
    expect((await as(ids.kari).query(api.events.get, { eventId }))?.counts).toEqual({
      yes: 1,
      maybe: 1,
      no: 0,
    });
  });

  it("respects capacity and the RSVP deadline", async () => {
    const { ids, as, create } = await setup();
    const eventId = await create({ capacity: 3, rsvpDeadline: NOW + 24 * HOUR });
    await expect(
      as(ids.ola).mutation(api.events.rsvp, { eventId, status: "yes", guests: 2 }),
    ).rejects.toThrow(/EVENT_FULL/);
    await as(ids.ola).mutation(api.events.rsvp, { eventId, status: "yes", guests: 1 });
    expect((await as(ids.per).query(api.events.get, { eventId }))?.full).toBe(true);
    await as(ids.per).mutation(api.events.rsvp, { eventId, status: "maybe" });
    vi.setSystemTime(NOW + 25 * HOUR);
    await expect(as(ids.per).mutation(api.events.rsvp, { eventId, status: "no" })).rejects.toThrow(
      /RSVP_CLOSED/,
    );
  });

  it("shows my upcoming yes and maybe events, soonest first", async () => {
    const { ids, as, create } = await setup();
    const a = await create({ title: "A", startsAt: NOW + 72 * HOUR, endsAt: null });
    const b = await create({ title: "B", startsAt: NOW + 24 * HOUR, endsAt: null });
    const c = await create({ title: "C", startsAt: NOW + 30 * HOUR, endsAt: null });
    await as(ids.ola).mutation(api.events.rsvp, { eventId: a, status: "yes" });
    await as(ids.ola).mutation(api.events.rsvp, { eventId: b, status: "maybe" });
    await as(ids.ola).mutation(api.events.rsvp, { eventId: c, status: "no" });
    const mine = await as(ids.ola).query(api.events.mine, {});
    expect(mine.map((e) => [e.title, e.myRsvp, e.hubName])).toEqual([
      ["B", "maybe", "3B"],
      ["A", "yes", "3B"],
    ]);
  });
});

describe("event chat", () => {
  it("works like the hub chat, for the hub's members, and pushes mentions to the event", async () => {
    const { ids, as, create, settle } = await setup();
    const eventId = await create();
    await settle();
    sent = [];
    const conversationId = (await as(ids.kari).query(api.events.get, { eventId }))!.conversationId!;
    await as(ids.kari).mutation(api.messages.send, {
      conversationId,
      body: "Hvem tar med kake, @Ola?",
      mentions: [ids.ola],
    });
    expect((await as(ids.ola).query(api.events.get, { eventId }))?.chatUnread).toBe(1);
    await settle();
    expect(sent.map((p) => [p.title, p.data.url])).toEqual([
      ["Kari mentioned you · Juleavslutning", `/event/${eventId}`],
    ]);
    await expect(
      as(ids.eva).mutation(api.messages.send, { conversationId, body: "Hei" }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("reminders", () => {
  /** Moves the clock to `at` and runs whatever has fallen due. */
  async function advanceTo(t: Awaited<ReturnType<typeof setup>>["t"], at: number) {
    vi.advanceTimersByTime(at - Date.now());
    for (let i = 0; i < 3; i++) {
      await t.finishInProgressScheduledFunctions();
      vi.advanceTimersByTime(1);
    }
  }

  it("reminds those coming a day before, and those who haven't answered before the deadline", async () => {
    const { t, ids, as, create, settle } = await setup();
    const eventId = await create({ rsvpDeadline: NOW + 40 * HOUR }); // starts NOW + 48h
    await settle();
    sent = [];
    // Deadline reminder at deadline - 48h = NOW - 8h: already passed, so not scheduled.
    await as(ids.ola).mutation(api.events.rsvp, { eventId, status: "maybe" });
    await advanceTo(t, NOW + 24 * HOUR);
    // Kari (host, going) and Ola (maybe); Per has muted the hub.
    expect(sent.map((p) => [p.to, p.title]).sort()).toEqual(
      [
        [`ExponentPushToken[${ids.kari}]`, "Påminnelse: Juleavslutning"],
        [`ExponentPushToken[${ids.ola}]`, "Reminder: Juleavslutning"],
      ].sort(),
    );
  });

  it("sends the deadline reminder only to members without an answer", async () => {
    const { t, ids, as, hubId, create, settle } = await setup();
    await as(ids.per).mutation(api.hubs.setNotifyLevel, { hubId, level: "important" });
    await create({
      startsAt: NOW + 10 * 24 * HOUR,
      endsAt: null,
      rsvpDeadline: NOW + 5 * 24 * HOUR,
    });
    await settle();
    sent = [];
    await advanceTo(t, NOW + 3 * 24 * HOUR);
    expect(sent.map((p) => [p.to, p.title]).sort()).toEqual(
      [
        [`ExponentPushToken[${ids.ola}]`, "Have you replied? Juleavslutning"],
        [`ExponentPushToken[${ids.per}]`, "Har du svart? Juleavslutning"],
      ].sort(),
    );
  });

  it("reschedules on edit, and stops when cancelled or turned off", async () => {
    const { t, ids, as, create, settle } = await setup();
    const eventId = await create();
    await settle();
    const edit = (extra = {}) =>
      as(ids.kari).mutation(api.events.update, {
        eventId,
        title: "Juleavslutning",
        startsAt: NOW + 72 * HOUR,
        endsAt: null,
        ...extra,
      });
    await edit();
    await settle();
    sent = [];
    await advanceTo(t, NOW + 24 * HOUR); // The old reminder time: nothing.
    expect(sent).toEqual([]);
    await advanceTo(t, NOW + 48 * HOUR); // 24 hours before the new start.
    expect(sent.map((p) => p.title)).toEqual(["Påminnelse: Juleavslutning"]);

    sent = [];
    await edit({ startsAt: NOW + 96 * HOUR, reminders: false });
    expect((await as(ids.kari).query(api.events.get, { eventId }))?.reminders).toBe(false);
    await edit({ startsAt: NOW + 120 * HOUR });
    await as(ids.kari).mutation(api.events.cancel, { eventId });
    await settle();
    sent = [];
    await advanceTo(t, NOW + 100 * HOUR);
    expect(sent).toEqual([]);
    const jobs = await t.run(async (ctx) => (await ctx.db.get(eventId))?.reminderJobs ?? null);
    expect(jobs).toBeNull();
  });
});
