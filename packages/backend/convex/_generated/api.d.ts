/* eslint-disable */
/**
 * Generated utilities. Hand-written stand-in until the first `npx convex dev`
 * (HUB-2, needs CONVEX_DEPLOY_KEY) regenerates this file from the schema.
 */
import type * as lib_auth from "../lib/auth.js";
import type * as users from "../users.js";

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{
  "lib/auth": typeof lib_auth;
  users: typeof users;
}>;

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
