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
import type * as calendar from "../calendar.js";
import type * as devSignIn from "../devSignIn.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as hubs from "../hubs.js";
import type * as invites from "../invites.js";
import type * as lib_age from "../lib/age.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_blocks from "../lib/blocks.js";
import type * as lib_conversations from "../lib/conversations.js";
import type * as lib_devPersonas from "../lib/devPersonas.js";
import type * as lib_devSignIn from "../lib/devSignIn.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_hubTemplates from "../lib/hubTemplates.js";
import type * as lib_ics from "../lib/ics.js";
import type * as lib_images from "../lib/images.js";
import type * as lib_pushText from "../lib/pushText.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_unread from "../lib/unread.js";
import type * as lib_vipps from "../lib/vipps.js";
import type * as messages from "../messages.js";
import type * as moderation from "../moderation.js";
import type * as push from "../push.js";
import type * as readStates from "../readStates.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  calendar: typeof calendar;
  devSignIn: typeof devSignIn;
  events: typeof events;
  files: typeof files;
  http: typeof http;
  hubs: typeof hubs;
  invites: typeof invites;
  "lib/age": typeof lib_age;
  "lib/auth": typeof lib_auth;
  "lib/blocks": typeof lib_blocks;
  "lib/conversations": typeof lib_conversations;
  "lib/devPersonas": typeof lib_devPersonas;
  "lib/devSignIn": typeof lib_devSignIn;
  "lib/events": typeof lib_events;
  "lib/hubTemplates": typeof lib_hubTemplates;
  "lib/ics": typeof lib_ics;
  "lib/images": typeof lib_images;
  "lib/pushText": typeof lib_pushText;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/unread": typeof lib_unread;
  "lib/vipps": typeof lib_vipps;
  messages: typeof messages;
  moderation: typeof moderation;
  push: typeof push;
  readStates: typeof readStates;
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
