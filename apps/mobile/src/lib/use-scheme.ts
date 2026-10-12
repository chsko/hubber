import type { ColorScheme } from "@hubber/shared";
import { useColorScheme } from "react-native";

/** The system colour scheme, collapsed to "light" | "dark". */
export function useScheme(): ColorScheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}
