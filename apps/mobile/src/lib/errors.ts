import { ConvexError } from "convex/values";

/** The `code` of a `ConvexError({ code })` thrown by the backend, if any. */
export function convexErrorCode(error: unknown): string | null {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "object" && data !== null && "code" in data) {
      return typeof data.code === "string" ? data.code : null;
    }
  }
  return null;
}
