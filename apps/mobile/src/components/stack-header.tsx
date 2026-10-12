import { colors } from "@hubber/shared";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/lib/use-scheme";

/** Header for screens pushed on top of the tabs: back button, title, optional action. */
export function StackHeader({ title, action }: { title?: string; action?: ReactNode }) {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  return (
    <View className="h-12 flex-row items-center gap-1 px-2">
      <Pressable
        testID="back"
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/hubs"))}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <ChevronLeft color={c.primary} size={28} strokeWidth={2.2} />
      </Pressable>
      <Text numberOfLines={1} className="flex-1 font-sans-bold text-[17px] text-text">
        {title}
      </Text>
      {action}
    </View>
  );
}
