/**
 * Design tokens shared by the mobile app and the public web site.
 * Source of truth: docs/DESIGN.md §7 and the design canvas.
 */

const light = {
  bg: "#FAF8F5",
  surface: "#FFFFFF",
  text: "#1D2321",
  textMuted: "#5F6B66",
  primary: "#2F5D50",
  primaryStrong: "#1F4238",
  primarySoft: "#E3ECE8",
  accent: "#E8A33D",
  accentSoft: "#FBEBD0",
  onAccentSoft: "#6B4A12",
  danger: "#C2410C",
  border: "#E6E1DA",
} as const;

export type ColorToken = keyof typeof light;
export type ColorScheme = "light" | "dark";

const dark: Record<ColorToken, string> = {
  bg: "#121413",
  surface: "#1C1F1E",
  text: "#ECEDEA",
  textMuted: "#9AA5A0",
  primary: "#7FB8A6",
  primaryStrong: "#A5D0C2",
  primarySoft: "#22332D",
  accent: "#F0B95E",
  accentSoft: "#3A2E18",
  onAccentSoft: "#F6D49A",
  danger: "#F28B5B",
  border: "#2A2F2D",
};

export const colors: Record<ColorScheme, Record<ColorToken, string>> = { light, dark };
