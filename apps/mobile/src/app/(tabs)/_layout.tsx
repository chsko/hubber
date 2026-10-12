import { colors } from "@hubber/shared";
import { Tabs } from "expo-router";
import { CalendarDays, CircleUserRound, Compass, House, UsersRound } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScheme } from "@/lib/use-scheme";

const tab = (title: string, Icon: LucideIcon) => ({
  title,
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon color={color} size={24} strokeWidth={focused ? 2.2 : 2} />
  ),
});

export default function TabLayout() {
  const c = colors[useScheme()];
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        // Room for Figtree descenders; keeps the home-indicator inset on iOS.
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          height: 60 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: "Figtree_600SemiBold", fontSize: 11, lineHeight: 16 },
      }}
    >
      <Tabs.Screen name="index" options={tab("Hjem", House)} />
      <Tabs.Screen name="hubs" options={tab("Hubber", UsersRound)} />
      <Tabs.Screen name="calendar" options={tab("Kalender", CalendarDays)} />
      <Tabs.Screen name="discover" options={tab("Oppdag", Compass)} />
      <Tabs.Screen name="profile" options={tab("Profil", CircleUserRound)} />
    </Tabs>
  );
}
