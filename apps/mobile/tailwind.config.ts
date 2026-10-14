import type { Config } from "tailwindcss";
import { colors, type ColorToken } from "@hubbr/shared";

// nativewind/preset ships broken type declarations ("is not a module").
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativewindPreset = require("nativewind/preset") as Partial<Config>;

// Every colour token becomes a Tailwind colour backed by a CSS variable, so
// light/dark switching happens in one place (src/components/theme-root.tsx).
const themeColors = Object.fromEntries(
  (Object.keys(colors.light) as ColorToken[]).map((token) => [token, `var(--color-${token})`]),
);

export default {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [nativewindPreset],
  theme: {
    extend: {
      colors: themeColors,
      fontFamily: {
        sans: ["Figtree_400Regular"],
        "sans-medium": ["Figtree_500Medium"],
        "sans-semibold": ["Figtree_600SemiBold"],
        "sans-bold": ["Figtree_700Bold"],
        "sans-extrabold": ["Figtree_800ExtraBold"],
      },
    },
  },
} satisfies Config;
