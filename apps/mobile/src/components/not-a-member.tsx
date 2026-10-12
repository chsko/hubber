import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StackHeader } from "@/components/stack-header";

/** Shown when you leave, are removed, or open a hub you're not in. */
export function NotAMember() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StackHeader />
      <View className="flex-1 justify-center gap-2 px-6 pb-16">
        <Text className="text-center font-sans-extrabold text-[22px] text-text">
          {t("hub.notMemberTitle")}
        </Text>
        <Text className="text-center font-sans text-[15px] leading-6 text-textMuted">
          {t("hub.notMemberBody")}
        </Text>
      </View>
    </SafeAreaView>
  );
}
