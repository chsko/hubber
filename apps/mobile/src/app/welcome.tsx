import { api } from "@hubber/backend/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DevSignIn } from "@/components/dev-sign-in";
import { LogoMark } from "@/components/logo";
import { VippsButton } from "@/components/vipps-button";

const points = ["welcome.point1", "welcome.point2", "welcome.point3"] as const;

/** Landing screen for signed-out users: the pitch and one button (HUB-12). */
export default function Welcome() {
  const { t } = useTranslation();
  const personas = useQuery(api.devSignIn.personas);
  const [showDev, setShowDev] = useState(false);

  function onContinue() {
    // Until Vipps Login exists (HUB-10), the button opens the dev personas.
    if (personas !== undefined && personas.length > 0) setShowDev(true);
    else Alert.alert(t("welcome.vippsSoonTitle"), t("welcome.vippsSoonBody"));
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="flex-grow justify-between gap-8 px-6 pb-8 pt-16">
        <View className="gap-6">
          <View className="gap-2">
            <LogoMark size={64} />
            <Text accessibilityRole="header" className="font-sans-extrabold text-[40px] text-text">
              {t("common.appName")}
            </Text>
            <Text className="font-sans-semibold text-[20px] leading-7 text-text">
              {t("welcome.tagline")}
            </Text>
          </View>
          <View className="gap-3">
            {points.map((key) => (
              <View key={key} className="flex-row gap-3">
                <Text className="font-sans-bold text-[16px] text-primary">✓</Text>
                <Text className="flex-1 font-sans text-[16px] leading-6 text-textMuted">
                  {t(key)}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View className="gap-4">
          {showDev ? <DevSignIn /> : <VippsButton onPress={onContinue} />}
          <Text className="text-center font-sans text-xs leading-5 text-textMuted">
            {t("welcome.adultsOnly")}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
