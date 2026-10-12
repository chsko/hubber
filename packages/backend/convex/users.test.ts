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
    expect(me).toEqual({
      _id: userId,
      name: "Kari Nordmann",
      locale: "nb",
      photoId: null,
      photoUrl: null,
      verified: false,
      onboarded: false,
    });
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

async function signedIn(fields: { vippsSub?: string; onboardedAt?: number } = {}) {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "Kari Nordmann", vippsSub: "dev-kari", ...fields }),
  );
  return { t, userId, as: t.withIdentity({ subject: `${userId}|s` }) };
}

function storeImage(t: ReturnType<typeof convexTest>, bytes = 10) {
  return t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" })),
  );
}

describe("onboarding", () => {
  it("marks the user verified and not yet onboarded after sign-in", async () => {
    const { as } = await signedIn();
    expect(await as.query(api.users.me, {})).toMatchObject({ verified: true, onboarded: false });
  });

  it("completes onboarding with a language, once", async () => {
    const { t, as, userId } = await signedIn();
    await as.mutation(api.users.completeOnboarding, { locale: "en" });
    const first = await t.run((ctx) => ctx.db.get(userId));
    expect(first?.locale).toBe("en");
    expect(first?.onboardedAt).toBeTypeOf("number");
    expect(await as.query(api.users.me, {})).toMatchObject({ onboarded: true, locale: "en" });

    await as.mutation(api.users.completeOnboarding, { locale: "nb" });
    const second = await t.run((ctx) => ctx.db.get(userId));
    expect(second?.onboardedAt).toBe(first?.onboardedAt);
  });

  it("requires a signed-in user", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.completeOnboarding, { locale: "nb" })).rejects.toThrow(
      /UNAUTHENTICATED/,
    );
  });
});

describe("setLocale", () => {
  it("stores the app language", async () => {
    const { t, as, userId } = await signedIn();
    await as.mutation(api.users.setLocale, { locale: "en" });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.locale).toBe("en");
  });
});

describe("profile photo", () => {
  it("sets a photo and returns its URL", async () => {
    const { t, as } = await signedIn();
    const storageId = await storeImage(t);
    await as.mutation(api.users.setPhoto, { storageId });
    const me = await as.query(api.users.me, {});
    expect(me?.photoId).toBe(storageId);
    expect(me?.photoUrl).toEqual(expect.any(String));
  });

  it("deletes the old file when replaced or removed", async () => {
    const { t, as } = await signedIn();
    const first = await storeImage(t);
    const second = await storeImage(t);
    await as.mutation(api.users.setPhoto, { storageId: first });
    await as.mutation(api.users.setPhoto, { storageId: second });
    expect(await t.run((ctx) => ctx.db.system.get(first))).toBeNull();

    await as.mutation(api.users.setPhoto, { storageId: null });
    expect(await t.run((ctx) => ctx.db.system.get(second))).toBeNull();
    expect(await as.query(api.users.me, {})).toMatchObject({ photoId: null, photoUrl: null });
  });

  it("rejects images over 2 MB", async () => {
    const { t, as } = await signedIn();
    const storageId = await storeImage(t, 2 * 1024 * 1024 + 1);
    await expect(as.mutation(api.users.setPhoto, { storageId })).rejects.toThrow(/INVALID_IMAGE/);
  });
});
