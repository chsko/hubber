import { api } from "@hubbr/backend/api";
import type { Id } from "@hubbr/backend/dataModel";
import { colors } from "@hubbr/shared";
import { useMutation } from "convex/react";
import { Bell, BellOff, Check } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useScheme } from "@/lib/use-scheme";
import { BottomSheet } from "@/components/bottom-sheet";

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
      <BottomSheet visible={open} onClose={() => setOpen(false)} className="gap-1">
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
      </BottomSheet>
    </>
  );
}
