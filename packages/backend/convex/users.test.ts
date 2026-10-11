import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("users.me", () => {
  it("returns null when signed out", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  it("returns the signed-in user's profile", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Kari Nordmann", phone: "+4790000000", locale: "nb" }),
    );
    const me = await t.withIdentity({ subject: `${userId}|session1` }).query(api.users.me, {});
    expect(me).toEqual({ _id: userId, name: "Kari Nordmann", locale: "nb", photoId: null });
  });

  it("does not expose phone or email", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Kari", phone: "+4790000000", email: "kari@example.no" }),
    );
    const me = await t.withIdentity({ subject: `${userId}|s` }).query(api.users.me, {});
    expect(me).not.toHaveProperty("phone");
    expect(me).not.toHaveProperty("email");
  });

  it("returns null for a deleted user", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Gone", deletedAt: Date.now() }),
    );
    expect(await t.withIdentity({ subject: `${userId}|s` }).query(api.users.me, {})).toBeNull();
  });

  it("returns null for a malformed subject", async () => {
    const t = convexTest(schema, modules);
    expect(await t.withIdentity({ subject: "not-an-id" }).query(api.users.me, {})).toBeNull();
  });
});
