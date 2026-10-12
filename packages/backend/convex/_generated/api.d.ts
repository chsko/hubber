/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as devSignIn from "../devSignIn.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as hubs from "../hubs.js";
import type * as lib_age from "../lib/age.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_devPersonas from "../lib/devPersonas.js";
import type * as lib_devSignIn from "../lib/devSignIn.js";
import type * as lib_hubTemplates from "../lib/hubTemplates.js";
import type * as lib_images from "../lib/images.js";
import type * as lib_vipps from "../lib/vipps.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  devSignIn: typeof devSignIn;
  files: typeof files;
  http: typeof http;
  hubs: typeof hubs;
  "lib/age": typeof lib_age;
  "lib/auth": typeof lib_auth;
  "lib/devPersonas": typeof lib_devPersonas;
  "lib/devSignIn": typeof lib_devSignIn;
  "lib/hubTemplates": typeof lib_hubTemplates;
  "lib/images": typeof lib_images;
  "lib/vipps": typeof lib_vipps;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
