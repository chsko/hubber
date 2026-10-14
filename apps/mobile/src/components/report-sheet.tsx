import { api } from "@hubbr/backend/api";
import type { Id } from "@hubbr/backend/dataModel";
import { colors } from "@hubbr/shared";
import { useMutation } from "convex/react";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { useScheme } from "@/lib/use-scheme";

export type ReportTarget = {
  type: "message" | "event" | "user" | "hub";
  id: string;
};

const reasons = ["spam", "harassment", "inappropriate", "child_safety", "other"] as const;
type Reason = (typeof reasons)[number];

/** Report a message, event, person or hub (HUB-33): a reason, optional details, send. */
export function ReportSheet({
  target,
  onClose,
}: {
  target: ReportTarget | null;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={target !== null} onClose={onClose} className="gap-3">
      {target ? (
        <ReportForm key={`${target.type}:${target.id}`} target={target} onClose={onClose} />
      ) : null}
    </BottomSheet>
  );
}

function ReportForm({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const report = useMutation(api.moderation.report);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (reason === null) return;
    setSending(true);
    try {
      const result = await report({
        targetType: target.type,
        targetId: target.id,
        reason,
        ...(details.trim() && { details: details.trim() }),
      });
      onClose();
      Alert.alert(
        result.ok ? t("report.thanksTitle") : t("report.limited"),
        result.ok ? t("report.thanksBody") : undefined,
      );
    } catch {
      setSending(false);
      Alert.alert(t("report.failed"));
    }
  }

  return (
    <>
      <View className="gap-1 px-1">
        <Text className="font-sans-bold text-[17px] text-text">
          {t(`report.title.${target.type}`)}
        </Text>
        <Text className="font-sans text-[14px] leading-5 text-textMuted">{t("report.body")}</Text>
      </View>
      <View accessibilityRole="radiogroup">
        {reasons.map((r) => (
          <Pressable
            key={r}
            testID={`report-${r}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === r }}
            onPress={() => setReason(r)}
            className="flex-row items-center justify-between rounded-xl px-1 py-3 active:bg-bg"
          >
            <Text className="font-sans-semibold text-[16px] text-text">
              {t(`report.reason.${r}`)}
            </Text>
            {reason === r ? <Check color={c.primary} size={20} strokeWidth={2.4} /> : null}
          </Pressable>
        ))}
      </View>
      <TextInput
        testID="report-details"
        value={details}
        onChangeText={setDetails}
        placeholder={t("report.detailsPlaceholder")}
        placeholderTextColor={c.textMuted}
        maxLength={1000}
        multiline
        className="min-h-16 rounded-xl border border-border bg-bg px-3.5 py-3 font-sans text-[15px] text-text"
      />
      <Pressable
        testID="report-send"
        accessibilityRole="button"
        disabled={reason === null || sending}
        onPress={() => void send()}
        className="items-center rounded-xl bg-primarySoft px-4 py-3.5 active:opacity-80 disabled:opacity-50"
      >
        {sending ? (
          <ActivityIndicator />
        ) : (
          <Text className="font-sans-bold text-[16px] text-primaryStrong">{t("report.send")}</Text>
        )}
      </Pressable>
    </>
  );
}

/** Asks before blocking someone, then blocks. */
export function useConfirmBlock() {
  const { t } = useTranslation();
  const block = useMutation(api.moderation.block);
  return (userId: Id<"users">, name: string | null) =>
    Alert.alert(t("block.title", { name: name ?? t("profile.noName") }), t("block.body"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("block.block"),
        style: "destructive",
        onPress: () => void block({ userId }),
      },
    ]);
}
