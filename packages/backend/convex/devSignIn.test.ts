import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { vippsProfile } from "./lib/vipps";
import schema from "./schema";
import { modules } from "./test.setup";

// Convex Auth signs session JWTs with JWT_PRIVATE_KEY; give it a throwaway key.
let jwtPrivateKey: string;
beforeAll(async () => {
  const { privateKey } = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  const base64 = btoa(String.fromCharCode(...pkcs8));
  jwtPrivateKey = `-----BEGIN PRIVATE KEY----- ${base64} -----END PRIVATE KEY-----`;
});

function setup(devSignIn: "enabled" | undefined) {
  vi.stubEnv("JWT_PRIVATE_KEY", jwtPrivateKey);
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  vi.stubEnv("HUBBER_DEV_SIGN_IN", devSignIn);
  return convexTest(schema, modules);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("vippsProfile", () => {
  it("maps Vipps userinfo to the stored profile, keeping only the birth year", () => {
    expect(
      vippsProfile({
        sub: "abc",
        name: "Kari Nordmann",
        email: "kari@example.no",
        phone_number: "4791234567",
        birthdate: "1985-04-17",
      }),
    ).toEqual({
      id: "abc",
      vippsSub: "abc",
      name: "Kari Nordmann",
      email: "kari@example.no",
      phone: "+4791234567",
      birthYear: 1985,
    });
  });
});

describe("dev sign-in", () => {
  it("is disabled unless HUBBER_DEV_SIGN_IN=enabled", async () => {
    const t = setup(undefined);
    expect(await t.query(api.devSignIn.personas, {})).toEqual([]);
    await expect(
      t.action(api.auth.signIn, { provider: "dev", params: { persona: "kari" } }),
    ).rejects.toThrow(/DEV_SIGN_IN_DISABLED/);
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
  });

  it("lists personas, including one under 18", async () => {
    const t = setup("enabled");
    const personas = await t.query(api.devSignIn.personas, {});
    expect(personas.map((p) => p.id)).toEqual(["kari", "ola", "ingrid", "nora"]);
    expect(personas.some((p) => new Date().getFullYear() - p.birthYear < 18)).toBe(true);
  });

  it("signs in as a persona with a Vipps-shaped profile", async () => {
    const t = setup("enabled");
    const result = await t.action(api.auth.signIn, {
      provider: "dev",
      params: { persona: "kari" },
    });
    expect(result.tokens?.token).toEqual(expect.any(String));

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      vippsSub: "dev-kari",
      name: "Kari Nordmann",
      email: "kari@example.no",
      phone: "+4790000001",
      birthYear: 1986,
    });
  });

  it("reuses the same user on the next sign-in", async () => {
    const t = setup("enabled");
    const args = { provider: "dev", params: { persona: "ola" } };
    await t.action(api.auth.signIn, args);
    await t.action(api.auth.signIn, args);
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
  });

  it("rejects under-18 personas and stores nothing", async () => {
    const t = setup("enabled");
    await expect(
      t.action(api.auth.signIn, { provider: "dev", params: { persona: "nora" } }),
    ).rejects.toThrow(/UNDER_18/);
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("authAccounts").collect())).toEqual([]);
  });

  it("rejects unknown personas", async () => {
    const t = setup("enabled");
    await expect(
      t.action(api.auth.signIn, { provider: "dev", params: { persona: "toString" } }),
    ).rejects.toThrow(/UNKNOWN_PERSONA/);
  });
});
