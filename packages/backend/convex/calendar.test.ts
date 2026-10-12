import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { toIcs } from "./lib/ics";
import schema from "./schema";
import { modules } from "./test.setup";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 10, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    kari: await ctx.db.insert("users", { name: "Kari" }),
    ola: await ctx.db.insert("users", { name: "Ola" }),
  }));
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(ids.kari).mutation(api.hubs.create, { name: "3B", template: "class" });
  const otherHub = await as(ids.ola).mutation(api.hubs.create, {
    name: "Familien",
    template: "family",
  });
  await t.run((ctx) =>
    ctx.db.insert("hubMembers", {
      hubId,
      userId: ids.ola,
      role: "member",
      status: "active",
      notifyLevel: "important",
    }),
  );
  const create = (title: string, startsAt: number, hub = hubId, by = ids.kari) =>
    as(by).mutation(api.events.create, { hubId: hub, title, startsAt, place: "Lia skole, Oslo" });
  return { t, ids, as, hubId, otherHub, create };
}

describe("calendar", () => {
  it("lists events in my hubs within the range, leaving out the ones I said no to", async () => {
    const { ids, as, otherHub, create } = await setup();
    const a = await create("Dugnad", NOW + 24 * HOUR);
    const b = await create("Juleavslutning", NOW + 30 * 24 * HOUR);
    const c = await create("Middag", NOW + 48 * HOUR, otherHub, ids.ola);
    const d = await create("Foreldremøte", NOW + 72 * HOUR);
    await as(ids.ola).mutation(api.events.rsvp, { eventId: d, status: "no" });
    const range = await as(ids.ola).query(api.calendar.range, {
      from: NOW,
      to: NOW + 7 * 24 * HOUR,
    });
    expect(range.map((e) => [e._id, e.hubName])).toEqual([
      [a, "3B"],
      [c, "Familien"],
    ]);
    // Kari isn't in Ola's family hub.
    const kari = await as(ids.kari).query(api.calendar.range, {
      from: NOW,
      to: NOW + 40 * 24 * HOUR,
    });
    expect(kari.map((e) => e._id)).toEqual([a, d, b]);
  });

  it("serves a secret subscription feed that can be reset or turned off", async () => {
    const { t, ids, as, create } = await setup();
    const eventId = await create("Dugnad, med kake; ta med!", NOW + 24 * HOUR);
    expect(await as(ids.ola).query(api.calendar.feed, {})).toBeNull();
    const token = await as(ids.ola).mutation(api.calendar.createFeed, {});
    expect(token).toMatch(/^[a-z0-9]{32}$/);
    expect(await as(ids.ola).mutation(api.calendar.createFeed, {})).toBe(token);

    const response = await t.fetch(`/calendar/${token}.ics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    const ics = await response.text();
    expect(ics).toContain(`UID:${eventId}@hubbr.no`);
    expect(ics).toContain("SUMMARY:Dugnad\\, med kake\\; ta med!");
    expect(ics).toContain("DTSTART:20261013T100000Z");
    expect(ics).toContain("LOCATION:Lia skole\\, Oslo");

    const single = await t.fetch(`/calendar/${token}/${eventId}.ics`);
    expect((await single.text()).match(/BEGIN:VEVENT/g)).toHaveLength(1);

    const newToken = await as(ids.ola).mutation(api.calendar.createFeed, { reset: true });
    expect(newToken).not.toBe(token);
    expect((await t.fetch(`/calendar/${token}.ics`)).status).toBe(404);
    expect((await t.fetch(`/calendar/${newToken}.ics`)).status).toBe(200);
    await as(ids.ola).mutation(api.calendar.deleteFeed, {});
    expect((await t.fetch(`/calendar/${newToken}.ics`)).status).toBe(404);
  });

  it("doesn't serve events from hubs the token's owner isn't in", async () => {
    const { t, ids, as, otherHub, create } = await setup();
    const family = await create("Middag", NOW + 24 * HOUR, otherHub, ids.ola);
    const token = await as(ids.kari).mutation(api.calendar.createFeed, {});
    expect((await t.fetch(`/calendar/${token}/${family}.ics`)).status).toBe(404);
    expect((await t.fetch("/calendar/nope.ics")).status).toBe(404);
  });
});

describe("toIcs", () => {
  it("folds long lines and marks cancelled events", () => {
    const ics = toIcs("Hubbr", [
      {
        id: "abc",
        title: "Æ".repeat(60),
        startsAt: NOW,
        endsAt: NOW + HOUR,
        place: null,
        description: "Linje 1\nLinje 2",
        url: "hubber://event/abc",
        cancelled: true,
        updatedAt: NOW,
      },
    ]);
    const lines = ics.split("\r\n");
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("DESCRIPTION:Linje 1\\nLinje 2");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
