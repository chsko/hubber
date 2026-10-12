import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * Step 1 of an image upload (profile photo, hub icon): a short-lived URL the
 * app POSTs the file to. Step 2 is the mutation that attaches the storage id.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
