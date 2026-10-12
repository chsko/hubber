import { ConvexError } from "convex/values";

/** Hubber is for adults only (docs/DESIGN.md: under-18s are out of scope). */
export const MINIMUM_AGE = 18;

const osloDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Age in whole years on today's calendar date in Oslo, from an ISO birthdate
 * ("1985-04-17"). You turn N on your birthday; a 29 February birthday counts
 * from 1 March in non-leap years.
 */
export function ageInOslo(birthdate: string, now: Date | number = Date.now()): number {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate);
  if (birth === null) throw new ConvexError({ code: "INVALID_BIRTHDATE" });
  // "en-CA" formats as YYYY-MM-DD.
  const [year, month, day] = osloDate.format(now).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [by, bm, bd] = [Number(birth[1]), Number(birth[2]), Number(birth[3])];
  const hadBirthday = month > bm || (month === bm && day >= bd);
  return year - by - (hadBirthday ? 0 : 1);
}

/**
 * The 18+ gate (HUB-11). Runs before an account is created or updated, so an
 * under-18 sign-in stores nothing. Throws `UNDER_18`.
 */
export function assertAdult(birthdate: string, now?: Date | number): void {
  if (ageInOslo(birthdate, now) < MINIMUM_AGE) {
    throw new ConvexError({ code: "UNDER_18" });
  }
}
