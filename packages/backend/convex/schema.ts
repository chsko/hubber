import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Data model — see docs/PLAN.md §3.
 *
 * `authTables` are Convex Auth's sessions/accounts/tokens. `users` overrides
 * its default and keeps the optional `name`/`email`/`phone`/`image` fields and
 * `email`/`phone` indexes Convex Auth relies on.
 */

export const hubTemplate = v.union(
  v.literal("class"),
  v.literal("kindergarten"),
  v.literal("family"),
  v.literal("friends"),
  v.literal("other"),
);

export const hubRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));

/** Categories for public events in Discover (HUB-29). */
export const eventCategory = v.union(
  v.literal("social"),
  v.literal("outdoors"),
  v.literal("sports"),
  v.literal("culture"),
  v.literal("food"),
  v.literal("kids"),
  v.literal("learning"),
  v.literal("volunteering"),
  v.literal("other"),
);

export const notifyLevel = v.union(v.literal("all"), v.literal("important"), v.literal("muted"));

export const rsvpStatus = v.union(v.literal("yes"), v.literal("maybe"), v.literal("no"));

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    image: v.optional(v.string()),
    vippsSub: v.optional(v.string()),
    birthYear: v.optional(v.number()),
    photoId: v.optional(v.id("_storage")),
    locale: v.optional(v.union(v.literal("nb"), v.literal("en"))),
    kommuneNr: v.optional(v.string()),
    /** Set when the user finishes onboarding (HUB-12). */
    onboardedAt: v.optional(v.number()),
    /** Quiet hours 22–07 (Oslo): pushes arrive silently. On unless set to false (HUB-22). */
    quietHours: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_vippsSub", ["vippsSub"]),

  hubs: defineTable({
    name: v.string(),
    template: hubTemplate,
    /** Emoji icon, defaulting to the template's; a photo (`iconId`) takes precedence. */
    emoji: v.optional(v.string()),
    iconId: v.optional(v.id("_storage")),
    ownerId: v.id("users"),
    joinApproval: v.boolean(),
    /** Bumped on new messages, events and members; the Hubs tab sorts by it. */
    lastActivityAt: v.optional(v.number()),
  }),

  hubMembers: defineTable({
    hubId: v.id("hubs"),
    userId: v.id("users"),
    role: hubRole,
    status: v.union(v.literal("active"), v.literal("pending")),
    notifyLevel,
  })
    .index("by_hub", ["hubId"])
    .index("by_user", ["userId"])
    .index("by_hub_user", ["hubId", "userId"]),

  invites: defineTable({
    hubId: v.id("hubs"),
    code: v.string(),
    createdBy: v.id("users"),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    uses: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_hub", ["hubId"]),

  /** Fixed-window counters for `lib/rateLimit.ts`, e.g. invite redemption per user. */
  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  conversations: defineTable({
    kind: v.union(v.literal("hub"), v.literal("event"), v.literal("dm")),
    hubId: v.optional(v.id("hubs")),
    eventId: v.optional(v.id("events")),
    lastMessageAt: v.optional(v.number()),
  })
    .index("by_hub", ["hubId"])
    .index("by_event", ["eventId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    authorId: v.id("users"),
    body: v.string(),
    imageIds: v.array(v.id("_storage")),
    replyToId: v.optional(v.id("messages")),
    mentions: v.array(v.id("users")),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    /** A "New event" card posted in the hub chat (HUB-23); the body is empty. */
    eventId: v.optional(v.id("events")),
  }).index("by_conversation", ["conversationId"]),

  reactions: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user", ["messageId", "userId"])
    .index("by_user", ["userId"]),

  readStates: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    lastReadAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_conversation_user", ["conversationId", "userId"]),

  events: defineTable({
    hubId: v.optional(v.id("hubs")),
    visibility: v.union(v.literal("hub"), v.literal("public")),
    title: v.string(),
    description: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    place: v.optional(
      v.object({
        text: v.string(),
        lat: v.optional(v.number()),
        lon: v.optional(v.number()),
      }),
    ),
    // Top-level so Discover can index on it (M5).
    kommuneNr: v.optional(v.string()),
    /** Public events only. */
    category: v.optional(eventCategory),
    coverId: v.optional(v.id("_storage")),
    capacity: v.optional(v.number()),
    rsvpDeadline: v.optional(v.number()),
    createdBy: v.id("users"),
    cancelledAt: v.optional(v.number()),
    /** The host turned reminders off (HUB-26); on by default. */
    remindersOff: v.optional(v.boolean()),
    /** Scheduled reminder pushes, replaced whenever the event changes. */
    reminderJobs: v.optional(v.array(v.id("_scheduled_functions"))),
  })
    .index("by_hub_start", ["hubId", "startsAt"])
    .index("by_creator", ["createdBy"])
    .index("by_visibility_kommune_start", ["visibility", "kommuneNr", "startsAt"])
    .index("by_visibility_start", ["visibility", "startsAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["visibility", "kommuneNr", "category"],
    }),

  rsvps: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    status: rsvpStatus,
    guests: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_user", ["userId"])
    .index("by_event_user", ["eventId", "userId"]),

  /** Secret calendar subscription links (HUB-27); resetting replaces the token. */
  calendarFeeds: defineTable({
    userId: v.id("users"),
    token: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  notifications: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    refId: v.string(),
    deliveredAt: v.optional(v.number()),
    bundledAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_kind_ref", ["userId", "kind", "refId"]),

  reports: defineTable({
    reporterId: v.id("users"),
    targetType: v.union(
      v.literal("message"),
      v.literal("event"),
      v.literal("user"),
      v.literal("hub"),
    ),
    targetId: v.string(),
    /** The hub the reported content lives in, so its admins can be shown it later. */
    hubId: v.optional(v.id("hubs")),
    reason: v.union(
      v.literal("spam"),
      v.literal("harassment"),
      v.literal("inappropriate"),
      v.literal("child_safety"),
      v.literal("other"),
    ),
    details: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved"), v.literal("dismissed")),
    handledAt: v.optional(v.number()),
    note: v.optional(v.string()),
  }).index("by_status", ["status"]),

  blocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
  })
    .index("by_blocker", ["blockerId"])
    .index("by_blocked", ["blockedId"])
    .index("by_pair", ["blockerId", "blockedId"]),
});
