import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EDIT_WINDOW_MS, type Message, QUICK_REACTIONS } from "./types";

type Props = {
  message: Message | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/** Long-press sheet: quick reactions, then reply / edit / delete. */
export function MessageActions({ message, onClose, onReact, onReply, onEdit, onDelete }: Props) {
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
    <Modal visible={message !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t("common.cancel")}
        onPress={onClose}
        className="flex-1 justify-end bg-black/40"
      >
        <Pressable onPress={() => undefined}>
          <SafeAreaView edges={["bottom"]} className="gap-2 rounded-t-3xl bg-surface px-4 pt-4">
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
            <Action label={t("common.cancel")} muted onPress={onClose} />
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
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
