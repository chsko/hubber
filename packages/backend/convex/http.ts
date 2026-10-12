import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * Chat photos (HUB-20): `GET /chat-image?message=<id>&i=<n>` with the
 * session token as a Bearer header. Only members of the hub get the file;
 * everyone else gets 404, so it doesn't reveal that the photo exists.
 */
http.route({
  path: "/chat-image",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const messageId = url.searchParams.get("message");
    const index = Number(url.searchParams.get("i") ?? "0");
    const notFound = new Response(null, { status: 404 });
    if (messageId === null || !Number.isInteger(index) || index < 0) return notFound;
    const normalized = await ctx.runQuery(internal.messages.normalizeMessageId, { id: messageId });
    if (normalized === null) return notFound;
    const storageId = await ctx.runQuery(internal.messages.imageForViewer, {
      messageId: normalized,
      index,
    });
    const blob = storageId === null ? null : await ctx.storage.get(storageId);
    if (blob === null) return notFound;
    return new Response(blob, {
      headers: {
        "Content-Type": blob.type || "image/jpeg",
        // Photos never change; only the device that fetched it may cache it.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  }),
});

export default http;
