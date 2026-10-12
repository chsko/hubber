import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { colors } from "@hubber/shared";
import { useMutation } from "convex/react";
import { Bell, BellOff, Check } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScheme } from "@/lib/use-scheme";

type Level = "all" | "important" | "muted";
const levels = ["all", "important", "muted"] as const satisfies readonly Level[];

/** Bell in the hub header (HUB-22): how much this hub may notify you. */
export function NotifyLevelButton({ hubId, level }: { hubId: Id<"hubs">; level: Level }) {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const setLevel = useMutation(api.hubs.setNotifyLevel);
  const [open, setOpen] = useState(false);
  const Icon = level === "muted" ? BellOff : Bell;

  return (
    <>
      <Pressable
        testID="notify-level"
        accessibilityRole="button"
        accessibilityLabel={t("hub.notify.label", { level: t(`hub.notify.${level}`) })}
        onPress={() => setOpen(true)}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Icon color={level === "muted" ? c.textMuted : c.primary} size={22} strokeWidth={2.2} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel={t("common.cancel")}
          onPress={() => setOpen(false)}
          className="flex-1 justify-end bg-black/40"
        >
          <Pressable onPress={() => undefined}>
            <SafeAreaView edges={["bottom"]} className="gap-1 rounded-t-3xl bg-surface px-4 pt-5">
              <Text className="px-1 pb-2 font-sans-bold text-[17px] text-text">
                {t("hub.notify.title")}
              </Text>
              <View accessibilityRole="radiogroup">
                {levels.map((l) => {
                  const selected = l === level;
                  return (
                    <Pressable
                      key={l}
                      testID={`notify-${l}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        setOpen(false);
                        if (!selected) void setLevel({ hubId, level: l });
                      }}
                      className="flex-row items-center gap-3 rounded-2xl px-1 py-3 active:opacity-60"
                    >
                      <View className="flex-1 gap-0.5">
                        <Text className="font-sans-semibold text-[15px] text-text">
                          {t(`hub.notify.${l}`)}
                        </Text>
                        <Text className="font-sans text-[13px] text-textMuted">
                          {t(`hub.notify.${l}Body`)}
                        </Text>
                      </View>
                      {selected ? <Check color={c.primary} size={20} strokeWidth={2.4} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
