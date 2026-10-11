/// <reference types="vite/client" />
// Convex function modules for convex-test (pnpm symlinks break its default lookup).
// Vite 8's glob has no extglob support, so list includes and excludes explicitly.
export const modules = import.meta.glob([
  "./**/*.{ts,js}",
  "!./**/*.d.ts",
  "!./**/*.test.ts",
  "!./test.setup.ts",
]);
