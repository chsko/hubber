import type { Id } from "@hubber/backend/dataModel";
import { colors } from "@hubber/shared";
import { Check, SendHorizontal, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { useScheme } from "@/lib/use-scheme";

const MAX_LENGTH = 4000;

export type Person = { userId: Id<"users">; name: string | null; photoUrl: string | null };

type Props = {
  draft: string;
  onChangeDraft: (text: string) => void;
  onSubmit: () => void;
  /** Shown above the input: "Replying to Kari" or "Editing message", with cancel. */
  context: { label: string; preview: string } | null;
  onCancelContext: () => void;
  editing: boolean;
  /** Members matching the "@…" being typed, if any. */
  suggestions: Person[];
  onPickSuggestion: (person: Person) => void;
};

/** Message input with reply/edit context and @mention suggestions (HUB-19). */
export function Composer(props: Props) {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const canSend = props.draft.trim().length > 0;
  return (
    <View className="border-t border-border bg-surface">
      {props.suggestions.length > 0 ? (
        <View className="border-b border-border">
          {props.suggestions.map((p) => (
            <Pressable
              key={p.userId}
              accessibilityRole="button"
              onPress={() => props.onPickSuggestion(p)}
              className="flex-row items-center gap-3 px-4 py-2 active:bg-bg"
            >
              <Avatar name={p.name} photoUrl={p.photoUrl} size={28} />
              <Text className="font-sans-semibold text-[15px] text-text">{p.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {props.context ? (
        <View className="flex-row items-center gap-2 px-4 pt-2">
          <View className="flex-1 border-l-2 border-primary pl-2">
            <Text className="font-sans-semibold text-[12px] text-primary">
              {props.context.label}
            </Text>
            <Text numberOfLines={1} className="font-sans text-[13px] text-textMuted">
              {props.context.preview}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={props.onCancelContext}
            className="h-9 w-9 items-center justify-center"
          >
            <X color={c.textMuted} size={18} />
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row items-end gap-2 px-3 py-2">
        <TextInput
          testID="chat-input"
          value={props.draft}
          onChangeText={props.onChangeDraft}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={c.textMuted}
          multiline
          maxLength={MAX_LENGTH}
          accessibilityLabel={t("chat.placeholder")}
          className="max-h-32 flex-1 rounded-2xl bg-bg px-4 py-2.5 font-sans text-[16px] text-text"
        />
        <Pressable
          testID="chat-send"
          accessibilityRole="button"
          accessibilityLabel={props.editing ? t("chat.save") : t("chat.send")}
          disabled={!canSend}
          onPress={props.onSubmit}
          className="h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-80 disabled:opacity-40"
        >
          {props.editing ? (
            <Check color={c.surface} size={20} strokeWidth={2.6} />
          ) : (
            <SendHorizontal color={c.surface} size={20} strokeWidth={2.4} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
