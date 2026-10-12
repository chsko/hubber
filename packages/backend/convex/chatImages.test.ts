import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const [kari, per] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { name: "Kari" }),
    await ctx.db.insert("users", { name: "Per" }),
  ]);
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|s` });
  const hubId = await as(kari).mutation(api.hubs.create, { name: "3B", template: "friends" });
  const conversationId = (await as(kari).query(api.messages.hubConversation, { hubId }))!;
  const photo = (bytes = 100) =>
    t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" })));
  return { t, conversationId, kari, per, as, photo };
}

describe("photo messages", () => {
  it("sends photos with or without text, and lists the count", async () => {
    const { conversationId, kari, as, photo } = await setup();
    const imageIds = [await photo(), await photo()];
    await as(kari).mutation(api.messages.send, { conversationId, body: "", imageIds });
    await as(kari).mutation(api.messages.send, {
      conversationId,
      body: "Bilder!",
      imageIds: [await photo()],
    });
    const { page } = await as(kari).query(api.messages.list, {
      conversationId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.map((m) => [m.body, m.imageCount])).toEqual([
      ["Bilder!", 1],
      ["", 2],
    ]);
  });

  it("still needs text when there are no photos, and allows at most 6", async () => {
    const { conversationId, kari, as, photo } = await setup();
    await expect(
      as(kari).mutation(api.messages.send, { conversationId, body: " ", imageIds: [] }),
    ).rejects.toThrow(/INVALID_MESSAGE/);
    const seven = await Promise.all(Array.from({ length: 7 }, () => photo()));
    await expect(
      as(kari).mutation(api.messages.send, { conversationId, body: "", imageIds: seven }),
    ).rejects.toThrow(/TOO_MANY_IMAGES/);
    await expect(
      as(kari).mutation(api.messages.send, {
        conversationId,
        body: "",
        imageIds: [await photo(3 * 1024 * 1024)],
      }),
    ).rejects.toThrow(/INVALID_IMAGE/);
  });

  it("serves photos to members only over /chat-image", async () => {
    const { conversationId, kari, per, as, photo } = await setup();
    const messageId = await as(kari).mutation(api.messages.send, {
      conversationId,
      body: "",
      imageIds: [await photo(42)],
    });
    const ok = await as(kari).fetch(`/chat-image?message=${messageId}&i=0`);
    expect(ok.status).toBe(200);
    expect((await ok.arrayBuffer()).byteLength).toBe(42);
    expect(ok.headers.get("Cache-Control")).toContain("private");

    expect((await as(per).fetch(`/chat-image?message=${messageId}&i=0`)).status).toBe(404);
    expect((await as(kari).fetch(`/chat-image?message=${messageId}&i=1`)).status).toBe(404);
    expect((await as(kari).fetch(`/chat-image?message=nonsense&i=0`)).status).toBe(404);
  });

  it("deletes the files when the message is deleted", async () => {
    const { t, conversationId, kari, as, photo } = await setup();
    const imageId = await photo();
    const messageId = await as(kari).mutation(api.messages.send, {
      conversationId,
      body: "",
      imageIds: [imageId],
    });
    await as(kari).mutation(api.messages.remove, { messageId });
    expect(await t.run((ctx) => ctx.db.system.get(imageId))).toBeNull();
    expect((await as(kari).fetch(`/chat-image?message=${messageId}&i=0`)).status).toBe(404);
  });
});
