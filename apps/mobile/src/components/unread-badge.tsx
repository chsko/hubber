import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

/** Unread count pill; the server stops counting at 100, shown as "99+". */
export function UnreadBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t("chat.unread", { count })}
      className="min-w-[22px] items-center rounded-full bg-accent px-1.5 py-0.5"
    >
      <Text className="font-sans-bold text-[12px] text-text">{count > 99 ? "99+" : count}</Text>
    </View>
  );
}
