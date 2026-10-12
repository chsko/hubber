import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Images are resized on the phone; anything bigger is rejected. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Throws `NOT_FOUND` or `INVALID_IMAGE` unless `storageId` is an uploaded image of sane size. */
export async function requireImage(ctx: MutationCtx, storageId: Id<"_storage">): Promise<void> {
  const file = await ctx.db.system.get(storageId);
  if (file === null) throw new ConvexError({ code: "NOT_FOUND" });
  const notImage = file.contentType !== undefined && !file.contentType.startsWith("image/");
  if (notImage || file.size > MAX_IMAGE_BYTES) {
    throw new ConvexError({ code: "INVALID_IMAGE" });
  }
}
