import type { ColorScheme } from "@hubbr/shared";
import { useColorScheme } from "react-native";

/** The system colour scheme, collapsed to "light" | "dark". */
export function useScheme(): ColorScheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}
