import { query } from "./_generated/server";
import { DEV_PERSONAS, devSignInEnabled } from "./lib/devPersonas";

/** Personas for the dev sign-in screen; empty when dev sign-in is disabled. */
export const personas = query({
  args: {},
  handler: () => {
    if (!devSignInEnabled()) return [];
    return Object.entries(DEV_PERSONAS).map(([id, p]) => ({
      id,
      name: p.name,
      birthYear: Number(p.birthdate.slice(0, 4)),
    }));
  },
});
