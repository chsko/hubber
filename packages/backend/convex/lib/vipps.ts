/**
 * Vipps Login userinfo claims for the scopes we request (docs/PLAN.md §2):
 * `openid name phoneNumber email birthDate`.
 */
export interface VippsUserinfo {
  sub: string;
  name: string;
  email: string;
  /** MSISDN without "+", e.g. "4791234567". */
  phone_number: string;
  /** ISO date, e.g. "1985-04-17". */
  birthdate: string;
}

/**
 * Maps Vipps userinfo to the Convex Auth profile stored on `users`. Both the
 * dev sign-in (HUB-9) and the real Vipps provider (HUB-10) use this, so
 * switching providers doesn't change what ends up in the database.
 * Only the birth year is kept, not the full date.
 */
export function vippsProfile(info: VippsUserinfo) {
  return {
    id: info.sub,
    vippsSub: info.sub,
    name: info.name,
    email: info.email,
    phone: info.phone_number.startsWith("+") ? info.phone_number : `+${info.phone_number}`,
    birthYear: Number(info.birthdate.slice(0, 4)),
  };
}
