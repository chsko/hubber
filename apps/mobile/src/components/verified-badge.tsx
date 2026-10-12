import { colors } from "@hubber/shared";
import { BadgeCheck } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useScheme } from "@/lib/use-scheme";

/** "Verifisert med Vipps": the name is the person's real name from Vipps. */
export function VerifiedBadge() {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  return (
    <View className="flex-row items-center gap-1 self-start rounded-full bg-primarySoft px-2.5 py-1">
      <BadgeCheck color={c.primaryStrong} size={14} strokeWidth={2.4} />
      <Text className="font-sans-semibold text-xs text-primaryStrong">{t("profile.verified")}</Text>
    </View>
  );
}
