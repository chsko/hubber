import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { EDIT_WINDOW_MS, type Message, QUICK_REACTIONS } from "./types";
import { BottomSheet } from "@/components/bottom-sheet";

type Props = {
  message: Message | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onBlock: () => void;
};

/** Long-press sheet: quick reactions, then reply / edit / delete, or report / block. */
export function MessageActions({
  message,
  onClose,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onBlock,
}: Props) {
  const { t } = useTranslation();
  const canEdit =
    message !== null &&
    message.isMine &&
    message.event === null &&
    Date.now() - message._creationTime < EDIT_WINDOW_MS;

  function run(action: () => void) {
    onClose();
    action();
  }

  return (
    <BottomSheet visible={message !== null} onClose={onClose} className="gap-2">
      {message ? (
        <Text numberOfLines={2} className="px-1 pb-1 font-sans text-[14px] text-textMuted">
          {message.body || t("chat.photoQuote")}
        </Text>
      ) : null}
      <View className="flex-row justify-between rounded-2xl bg-bg px-2 py-2">
        {QUICK_REACTIONS.map((emoji) => {
          const mine = message?.reactions.some((r) => r.emoji === emoji && r.mine) ?? false;
          return (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={emoji}
              accessibilityState={{ selected: mine }}
              onPress={() => run(() => onReact(emoji))}
              className={`h-11 w-11 items-center justify-center rounded-full ${mine ? "bg-primarySoft" : ""}`}
            >
              <Text className="text-[24px]">{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
      <Action label={t("chat.reply")} onPress={() => run(onReply)} />
      {canEdit ? <Action label={t("chat.edit")} onPress={() => run(onEdit)} /> : null}
      {message?.canDelete ? (
        <Action label={t("chat.delete")} danger onPress={() => run(onDelete)} />
      ) : null}
      {message && !message.isMine && !message.deleted ? (
        <>
          <Action label={t("report.message")} onPress={() => run(onReport)} />
          <Action
            label={t("block.blockName", { name: message.author.name ?? t("profile.noName") })}
            danger
            onPress={() => run(onBlock)}
          />
        </>
      ) : null}
      <Action label={t("common.cancel")} muted onPress={onClose} />
    </BottomSheet>
  );
}

function Action({
  label,
  onPress,
  danger,
  muted,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-xl px-2 py-3 active:bg-bg"
    >
      <Text
        className={`font-sans-semibold text-[16px] ${danger ? "text-danger" : muted ? "text-textMuted" : "text-text"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
