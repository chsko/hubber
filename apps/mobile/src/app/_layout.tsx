import "../global.css";

import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { colors } from "@hubber/shared";
import { ConvexProvider } from "convex/react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ThemeRoot } from "@/components/theme-root";
import { convex } from "@/lib/convex";
import { loadLanguagePreference } from "@/lib/i18n";
import { useScheme } from "@/lib/use-scheme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useScheme();
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });

  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    void loadLanguagePreference().finally(() => setLanguageReady(true));
  }, []);

  const ready = (fontsLoaded || fontError !== null) && languageReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const c = colors[scheme];
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.bg,
      card: c.surface,
      text: c.text,
      border: c.border,
    },
  };

  return (
    <ConvexProvider client={convex}>
      <ThemeProvider value={navTheme}>
        <ThemeRoot>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeRoot>
      </ThemeProvider>
    </ConvexProvider>
  );
}
