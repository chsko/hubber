import { colors, type ColorToken } from "@hubbr/shared";
import { vars } from "nativewind";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useScheme } from "@/lib/use-scheme";

const toVars = (scheme: "light" | "dark") =>
  vars(
    Object.fromEntries(
      (Object.keys(colors[scheme]) as ColorToken[]).map((t) => [`--color-${t}`, colors[scheme][t]]),
    ),
  );

const themeVars = { light: toVars("light"), dark: toVars("dark") };

/** Provides the colour tokens as CSS variables for the current system scheme. */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const scheme = useScheme();
  return (
    <View style={themeVars[scheme]} className="flex-1 bg-bg">
      {children}
    </View>
  );
}
