import { query } from "./_generated/server";
import { getUserId } from "./lib/auth";

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
    };
  },
});
