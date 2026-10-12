import type { VippsUserinfo } from "./vipps";

/**
 * Fake Vipps profiles for the dev-only sign-in (HUB-9). The `sub`s are
 * prefixed so they can never collide with real Vipps subjects.
 */
export const DEV_PERSONAS = {
  kari: {
    sub: "dev-kari",
    name: "Kari Nordmann",
    email: "kari@example.no",
    phone_number: "4790000001",
    birthdate: "1986-03-14",
  },
  ola: {
    sub: "dev-ola",
    name: "Ola Hansen",
    email: "ola@example.no",
    phone_number: "4790000002",
    birthdate: "1979-11-02",
  },
  ingrid: {
    sub: "dev-ingrid",
    name: "Ingrid Berg",
    email: "ingrid@example.no",
    phone_number: "4790000003",
    birthdate: "1992-07-28",
  },
  // Under 18: exercises the age gate (HUB-11).
  nora: {
    sub: "dev-nora",
    name: "Nora Lie",
    email: "nora@example.no",
    phone_number: "4790000004",
    birthdate: "2010-05-09",
  },
} satisfies Record<string, VippsUserinfo>;

export type DevPersonaId = keyof typeof DEV_PERSONAS;

export function isDevPersonaId(id: unknown): id is DevPersonaId {
  return typeof id === "string" && Object.hasOwn(DEV_PERSONAS, id);
}

/**
 * The dev sign-in is off unless the deployment sets
 * `HUBBER_DEV_SIGN_IN=enabled`. Production never sets it, so it fails closed.
 */
export function devSignInEnabled(): boolean {
  return process.env.HUBBER_DEV_SIGN_IN === "enabled";
}
