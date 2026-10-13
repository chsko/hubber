import { appId, appPaths, appleTeamId } from "@/lib/app-links";

// iOS fetches this (through Apple's CDN) when the app is installed. It must be
// JSON at exactly this path, with no redirect.
export function GET() {
  const teamId = appleTeamId();
  const details = teamId
    ? [{ appIDs: [`${teamId}.${appId}`], components: appPaths.map((p) => ({ "/": p })) }]
    : [];
  return Response.json({ applinks: { details } });
}
