import { api } from "@hubber/backend/api";
import { colors } from "@hubber/shared";
import { useQuery } from "convex/react";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const hubs = useQuery(api.hubs.mine);
  const unread = hubs?.reduce((sum, h) => sum + h.unread, 0) ?? 0;
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
      <Tabs.Screen name="index" options={tab(t("tabs.home"), House)} />
      <Tabs.Screen
        name="hubs"
        options={{
          ...tab(t("tabs.hubs"), UsersRound),
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, color: "#1D2321", fontSize: 11 },
        }}
      />
      <Tabs.Screen name="calendar" options={tab(t("tabs.calendar"), CalendarDays)} />
      <Tabs.Screen name="discover" options={tab(t("tabs.discover"), Compass)} />
      <Tabs.Screen name="profile" options={tab(t("tabs.profile"), CircleUserRound)} />
    </Tabs>
  );
}
