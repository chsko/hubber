import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserId, requireUser } from "./lib/auth";

const locale = v.union(v.literal("nb"), v.literal("en"));

/** Profile photos are resized on the phone; anything bigger is rejected. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** The signed-in user's own profile, or null when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || user.deletedAt !== undefined) return null;
    return {
      _id: user._id,
      name: user.name ?? null,
      locale: user.locale ?? null,
      photoId: user.photoId ?? null,
      photoUrl: user.photoId ? await ctx.storage.getUrl(user.photoId) : null,
      /** Signed in with Vipps (or its dev stand-in), so the name is the verified Vipps name. */
      verified: user.vippsSub !== undefined,
      onboarded: user.onboardedAt !== undefined,
    };
  },
});

/** Finishes onboarding (HUB-12): the name comes from Vipps, so only the language is asked. */
export const completeOnboarding = mutation({
  args: { locale },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      locale: args.locale,
      onboardedAt: user.onboardedAt ?? Date.now(),
    });
  },
});

/**
 * The app language, kept on the user so the server can write notifications
 * in it. The phone stays the source of truth: it syncs its active language here.
 */
export const setLocale = mutation({
  args: { locale },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.locale !== args.locale) await ctx.db.patch(user._id, { locale: args.locale });
  },
});

/** Step 1 of a photo upload: a short-lived URL the app POSTs the image to. */
export const generatePhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 2: sets (or with null, removes) the profile photo and deletes the old file. */
export const setPhoto = mutation({
  args: { storageId: v.union(v.id("_storage"), v.null()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.storageId !== null) {
      const file = await ctx.db.system.get(args.storageId);
      if (file === null) throw new ConvexError({ code: "NOT_FOUND" });
      const notImage = file.contentType !== undefined && !file.contentType.startsWith("image/");
      if (notImage || file.size > MAX_PHOTO_BYTES) {
        throw new ConvexError({ code: "INVALID_PHOTO" });
      }
    }
    if (user.photoId !== undefined && user.photoId !== args.storageId) {
      await ctx.storage.delete(user.photoId);
    }
    await ctx.db.patch(user._id, { photoId: args.storageId ?? undefined });
  },
});
