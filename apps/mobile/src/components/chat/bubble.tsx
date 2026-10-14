import { formatTime, type Locale } from "@hubbr/i18n";
import { useTranslation } from "react-i18next";
import { Image, Pressable, Text, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { EventChatCard } from "@/components/events/event-ui";
import { useChatImageSource } from "@/lib/chat-image";
import type { Message } from "./types";

type Props = {
  message: Message;
  showAuthor: boolean;
  showAvatar: boolean;
  locale: Locale;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
  onOpenPhoto: (index: number) => void;
};

/** Splits text so "@Name" for each mentioned person can be highlighted. */
function withMentions(body: string, names: string[]): { text: string; mention: boolean }[] {
  if (names.length === 0) return [{ text: body, mention: false }];
  const escaped = names.map((n) => `@${n}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return body
    .split(new RegExp(`(${escaped.join("|")})`, "g"))
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, mention: escaped.some((e) => new RegExp(`^${e}$`).test(part)) }));
}

/** One chat message: optional quote, text with mentions, time, reactions. */
export function Bubble({
  message,
  showAuthor,
  showAvatar,
  locale,
  onLongPress,
  onToggleReaction,
  onOpenPhoto,
}: Props) {
  const { t } = useTranslation();
  const photoSource = useChatImageSource();
  const mine = message.isMine;
  const pending = message._id.startsWith("optimistic-");
  const mentionNames = message.mentions.flatMap((m) => (m.name ? [m.name] : []));
  const highlight = message.mentionsMe && !mine;

  if (message.event) {
    return (
      <View className={`gap-0.5 ${showAuthor ? "mt-3" : "mt-0.5"} ${mine ? "items-end" : "pl-10"}`}>
        {showAuthor && !mine ? (
          <Text className="ml-1 font-sans-semibold text-[12px] text-textMuted">
            {message.author.name ?? t("chat.deletedUser")}
          </Text>
        ) : null}
        <EventChatCard event={message.event} onLongPress={onLongPress} />
      </View>
    );
  }

  return (
    <View
      className={`flex-row items-end gap-2 ${showAuthor ? "mt-3" : "mt-0.5"} ${mine ? "justify-end" : ""}`}
    >
      {!mine ? (
        <View className="w-8">
          {showAvatar ? (
            <Avatar name={message.author.name} photoUrl={message.author.photoUrl} size={32} />
          ) : null}
        </View>
      ) : null}
      <View className={`max-w-[78%] gap-0.5 ${mine ? "items-end" : "items-start"}`}>
        {showAuthor ? (
          <Text className="ml-1 font-sans-semibold text-[12px] text-textMuted">
            {message.author.name ?? t("chat.deletedUser")}
          </Text>
        ) : null}
        <Pressable
          testID={`message-${message._id}`}
          onLongPress={message.deleted || pending ? undefined : onLongPress}
          delayLongPress={300}
          accessibilityHint={t("chat.longPressHint")}
          className={`rounded-2xl px-3.5 py-2 ${mine ? "bg-primary" : highlight ? "border border-accent bg-accentSoft" : "border border-border bg-surface"} ${pending ? "opacity-60" : ""}`}
        >
          {message.replyTo ? (
            <View
              className={`mb-1 rounded-lg border-l-2 px-2 py-1 ${mine ? "border-bg bg-primaryStrong" : "border-primary bg-bg"}`}
            >
              <Text
                className={`font-sans-semibold text-[12px] ${mine ? "text-bg" : "text-primary"}`}
              >
                {message.replyTo.authorName ?? t("chat.deletedUser")}
              </Text>
              <Text
                numberOfLines={2}
                className={`font-sans text-[13px] ${mine ? "text-bg opacity-90" : "text-textMuted"}`}
              >
                {message.replyTo.deleted
                  ? t("chat.deleted")
                  : message.replyTo.body || (message.replyTo.hasImages ? t("chat.photoQuote") : "")}
              </Text>
            </View>
          ) : null}
          {message.imageCount > 0 ? (
            <View className={`flex-row flex-wrap gap-1 ${message.body ? "mb-1" : ""}`}>
              {Array.from({ length: message.imageCount }, (_, i) => {
                const size = message.imageCount === 1 ? 220 : 108;
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={t("chat.photo", { n: i + 1, count: message.imageCount })}
                    onPress={() => onOpenPhoto(i)}
                    onLongPress={pending ? undefined : onLongPress}
                  >
                    <Image
                      source={photoSource(message._id, i)}
                      style={{ width: size, height: size, borderRadius: 12 }}
                      className="bg-border"
                      accessibilityIgnoresInvertColors
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {message.body || message.deleted ? (
            <Text
              selectable
              className={`font-sans text-[16px] leading-[22px] ${mine ? "text-bg" : "text-text"} ${message.deleted ? "italic opacity-70" : ""}`}
            >
              {message.deleted
                ? t("chat.deleted")
                : withMentions(message.body, mentionNames).map((part, i) =>
                    part.mention ? (
                      <Text key={i} className="font-sans-bold">
                        {part.text}
                      </Text>
                    ) : (
                      part.text
                    ),
                  )}
            </Text>
          ) : null}
          <Text
            className={`mt-0.5 self-end font-sans text-[11px] ${mine ? "text-bg opacity-80" : "text-textMuted"}`}
          >
            {formatTime(message._creationTime, locale)}
            {message.editedAt ? ` · ${t("chat.edited")}` : ""}
          </Text>
        </Pressable>
        {message.reactions.length > 0 ? (
          <View className={`-mt-1 flex-row flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
            {message.reactions.map((r) => (
              <Pressable
                key={r.emoji}
                accessibilityRole="button"
                accessibilityLabel={t("chat.reactionLabel", { emoji: r.emoji, count: r.count })}
                accessibilityState={{ selected: r.mine }}
                onPress={() => onToggleReaction(r.emoji)}
                className={`flex-row items-center gap-1 rounded-full border px-2 py-0.5 ${r.mine ? "border-primary bg-primarySoft" : "border-border bg-surface"}`}
              >
                <Text className="text-[13px]">{r.emoji}</Text>
                <Text className="font-sans-semibold text-[12px] text-text">{r.count}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
