import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";

const VIPPS_ORANGE = "#FF5B24";

/**
 * "Fortsett med Vipps". Placeholder styling in Vipps orange until the
 * official button assets are added with real Vipps Login (HUB-10).
 */
export function VippsButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID="continue-with-vipps"
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{ backgroundColor: VIPPS_ORANGE }}
      className="items-center rounded-xl px-4 py-4 active:opacity-80 disabled:opacity-50"
    >
      <Text className="font-sans-bold text-[17px] text-white">
        {t("welcome.continueWithVipps")}
      </Text>
    </Pressable>
  );
}
