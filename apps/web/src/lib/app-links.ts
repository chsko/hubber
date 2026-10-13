/**
 * Link association for universal links (iOS) and app links (Android), HUB-32.
 * hubbr.no/i/* opens the installed app instead of this site.
 *
 * Both values come from the deploy's environment so they can be set when the
 * accounts exist, without a code change:
 * - APPLE_TEAM_ID: the 10-character Team ID from developer.apple.com/account
 * - ANDROID_CERT_SHA256: SHA-256 fingerprints of the app signing certificates
 *   (`eas credentials`, later also Play Console's app signing key), comma separated
 */
export const appId = "no.hubbr.app";

/** Paths the app handles (Expo Router routes in apps/mobile/src/app). */
export const appPaths = ["/i/*"];

export function appleTeamId(): string | undefined {
  return process.env.APPLE_TEAM_ID?.trim() || undefined;
}

export function androidCertFingerprints(): string[] {
  return (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
