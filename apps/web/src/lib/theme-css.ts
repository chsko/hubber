import { colors, type ColorScheme, type ColorToken } from "@hubbr/shared";

const declarations = (scheme: ColorScheme) =>
  (Object.keys(colors[scheme]) as ColorToken[])
    .map((token) => `--hb-${token}:${colors[scheme][token]};`)
    .join("");

/**
 * Colour tokens from @hubbr/shared as CSS variables, switched by the OS colour
 * scheme in CSS only (no flash before hydration). globals.css maps them into
 * Tailwind's theme.
 */
export const themeCss =
  `:root{color-scheme:light dark;${declarations("light")}}` +
  `@media (prefers-color-scheme: dark){:root{${declarations("dark")}}}`;
