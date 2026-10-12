import { convexAuth } from "@convex-dev/auth/server";
import { DevSignIn } from "./lib/devSignIn";

// Vipps (HUB-10) joins `providers` once credentials exist (HUB-8).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [DevSignIn],
});
