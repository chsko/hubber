import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Public invite links (HUB-15). In a native build with universal links
 * (HUB-32) they open the app; otherwise hubbr.no/i/<code> shows the code and
 * an "open in app" button (`hubber://i/<code>`), and the link or code can be
 * pasted under "Join with code".
 */
export function inviteUrl(code: string): string {
  return `https://hubbr.no/i/${code}`;
}

/** "ABCDEFGH23" → "ABCDE-FGH23", easier to read aloud and type. */
export function formatCode(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

/** The code from a pasted link or a loosely typed code, or null if it can't be one. */
export function parseInviteInput(input: string): string | null {
  const code = (input.trim().split("/").pop() ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return code.length === 10 ? code : null;
}

const STORAGE_KEY = "hubber.pendingInvite";

/**
 * An invite opened before signing in, so the app can resume it after sign-in
 * and onboarding (docs/DESIGN.md §5.1 step 5).
 */
export async function savePendingInvite(code: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, code).catch(() => undefined);
}

/** Returns the saved invite code, if any, and forgets it. */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(STORAGE_KEY);
    if (code !== null) await AsyncStorage.removeItem(STORAGE_KEY);
    return code;
  } catch {
    return null;
  }
}

/** Whether an invite is waiting to be resumed after onboarding. */
export async function hasPendingInvite(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEY).catch(() => null)) !== null;
}
