import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Match the Convex runtime as closely as possible.
    environment: "edge-runtime",
  },
});
