import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { formatTime } from "@hubber/i18n";
import { colors } from "@hubber/shared";
import { insertAtTop, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { SendHorizontal } from "lucide-react-native";
import { type ReactElement, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { useLocale } from "@/lib/i18n";
import { useScheme } from "@/lib/use-scheme";
import { dayLabel, osloDayKey } from "./day-label";

type Message = FunctionReturnType<typeof api.messages.list>["page"][number];

const PAGE_SIZE = 30;
const MAX_LENGTH = 4000;
/** Consecutive messages from one person within this gap share one name and avatar. */
const GROUP_GAP = 5 * 60 * 1000;

type Failed = { key: string; body: string };

/**
 * A conversation (HUB-18): live, newest at the bottom, older pages load as
 * you scroll up. Sending shows the message at once; if it fails it stays
 * with a "tap to retry".
 */
export function ChatView({
  conversationId,
  header,
}: {
  conversationId: Id<"conversations">;
  header?: ReactElement;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const c = colors[useScheme()];
  const me = useQuery(api.users.me);
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    { conversationId },
    { initialNumItems: PAGE_SIZE },
  );
  const send = useMutation(api.messages.send).withOptimisticUpdate((store, args) => {
    if (!me) return;
    insertAtTop({
      paginatedQuery: api.messages.list,
      argsToMatch: { conversationId: args.conversationId },
      localQueryStore: store,
      item: {
        _id: `optimistic-${Date.now()}` as Id<"messages">,
        _creationTime: Date.now(),
        body: args.body.trim(),
        deleted: false,
        editedAt: null,
        author: { _id: me._id, name: me.name, photoUrl: me.photoUrl },
        isMine: true,
      },
    });
  });
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState<Failed[]>([]);
  const now = Date.now();

  function submit(body: string, retryKey?: string) {
    if (body.trim().length === 0) return;
    if (retryKey) setFailed((f) => f.filter((x) => x.key !== retryKey));
    send({ conversationId, body }).catch(() =>
      setFailed((f) => [...f, { key: `${Date.now()}-${f.length}`, body }]),
    );
  }

  function renderItem({ item, index }: { item: Message; index: number }) {
    const older = results[index + 1];
    const newer = results[index - 1];
    const newDay =
      older === undefined || osloDayKey(older._creationTime) !== osloDayKey(item._creationTime);
    const startsGroup =
      newDay ||
      older.author._id !== item.author._id ||
      item._creationTime - older._creationTime > GROUP_GAP;
    const endsGroup =
      newer === undefined ||
      newer.author._id !== item.author._id ||
      newer._creationTime - item._creationTime > GROUP_GAP ||
      osloDayKey(newer._creationTime) !== osloDayKey(item._creationTime);
    // The list is inverted, so what renders "after" an item appears above it.
    return (
      <View>
        {newDay && (older !== undefined || status === "Exhausted") ? (
          <Text className="py-3 text-center font-sans-semibold text-[12px] text-textMuted">
            {dayLabel(item._creationTime, now, locale, t)}
          </Text>
        ) : null}
        <Bubble
          message={item}
          showAuthor={startsGroup && !item.isMine}
          showAvatar={endsGroup}
          locale={locale}
        />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        inverted
        data={results}
        keyExtractor={(m) => m._id}
        renderItem={renderItem}
        contentContainerClassName="px-4 py-3"
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (status === "CanLoadMore") loadMore(PAGE_SIZE);
        }}
        // Inverted: the header sits below the newest message, the footer above the oldest.
        ListHeaderComponent={
          failed.length > 0 ? (
            <View className="gap-1 pt-1">
              {failed.map((f) => (
                <Pressable
                  key={f.key}
                  accessibilityRole="button"
                  onPress={() => submit(f.body, f.key)}
                  className="max-w-[80%] self-end rounded-2xl border border-danger px-3.5 py-2 opacity-80"
                >
                  <Text className="font-sans text-[15px] text-text">{f.body}</Text>
                  <Text className="mt-0.5 font-sans-semibold text-[12px] text-danger">
                    {t("chat.notSent")}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        ListFooterComponent={
          status === "Exhausted" ? (
            <View className="pb-2">{header}</View>
          ) : status === "LoadingFirstPage" || status === "LoadingMore" ? (
            <ActivityIndicator className="py-4" />
          ) : null
        }
      />
      <View className="flex-row items-end gap-2 border-t border-border bg-surface px-3 py-2">
        <TextInput
          testID="chat-input"
          value={draft}
          onChangeText={setDraft}
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
          accessibilityLabel={t("chat.send")}
          disabled={draft.trim().length === 0}
          onPress={() => {
            submit(draft);
            setDraft("");
          }}
          className="h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-80 disabled:opacity-40"
        >
          <SendHorizontal color={c.surface} size={20} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

function Bubble({
  message,
  showAuthor,
  showAvatar,
  locale,
}: {
  message: Message;
  showAuthor: boolean;
  showAvatar: boolean;
  locale: "nb" | "en";
}) {
  const { t } = useTranslation();
  const mine = message.isMine;
  const pending = message._id.startsWith("optimistic-");
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
        <View
          className={`rounded-2xl px-3.5 py-2 ${mine ? "bg-primary" : "border border-border bg-surface"} ${pending ? "opacity-60" : ""}`}
        >
          <Text
            selectable
            className={`font-sans text-[16px] leading-[22px] ${mine ? "text-bg" : "text-text"} ${message.deleted ? "italic" : ""}`}
          >
            {message.deleted ? t("chat.deleted") : message.body}
          </Text>
          <Text
            className={`mt-0.5 self-end font-sans text-[11px] ${mine ? "text-bg opacity-80" : "text-textMuted"}`}
          >
            {formatTime(message._creationTime, locale)}
            {message.editedAt ? ` · ${t("chat.edited")}` : ""}
          </Text>
        </View>
      </View>
    </View>
  );
}
