import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { assertAdult } from "./age";
import { DEV_PERSONAS, devSignInEnabled, isDevPersonaId } from "./devPersonas";
import { vippsProfile } from "./vipps";

/**
 * Dev-only stand-in for Vipps Login (HUB-9): `signIn("dev", { persona })`
 * signs in as one of `DEV_PERSONAS`, with the same profile the Vipps
 * provider will produce. Throws unless `devSignInEnabled()`.
 */
export const DevSignIn = ConvexCredentials({
  id: "dev",
  authorize: async (params, ctx) => {
    if (!devSignInEnabled()) {
      throw new ConvexError({ code: "DEV_SIGN_IN_DISABLED" });
    }
    if (!isDevPersonaId(params.persona)) {
      throw new ConvexError({ code: "UNKNOWN_PERSONA" });
    }
    const info = DEV_PERSONAS[params.persona];
    // Before createAccount, so an under-18 sign-in stores nothing (HUB-11).
    assertAdult(info.birthdate);
    const { id, ...profile } = vippsProfile(info);
    const { user } = await createAccount(ctx, {
      provider: "dev",
      account: { id },
      profile,
    });
    return { userId: user._id };
  },
});
