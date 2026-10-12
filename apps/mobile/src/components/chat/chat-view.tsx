import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { insertAtTop, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { type ReactElement, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { useLocale } from "@/lib/i18n";
import { Bubble } from "./bubble";
import { Composer, type Person } from "./composer";
import { dayLabel, osloDayKey } from "./day-label";
import { MessageActions } from "./message-actions";
import type { Message } from "./types";

const PAGE_SIZE = 30;
/** Consecutive messages from one person within this gap share one name and avatar. */
const GROUP_GAP = 5 * 60 * 1000;
const MAX_SUGGESTIONS = 5;

type Failed = { key: string; body: string };
type Mode = { kind: "reply" | "edit"; message: Message } | null;

/** The "@abc" being typed at the end of the draft, if any. */
function mentionQuery(draft: string): string | null {
  const match = /(?:^|\s)@([\p{L}\p{M}-]*)$/u.exec(draft);
  return match ? (match[1] ?? "") : null;
}

/**
 * A conversation (HUB-18, HUB-19): live, newest at the bottom, older pages
 * load as you scroll up. Long-press a message to react, reply, edit or
 * delete; type @ to mention someone. Sends show at once and stay with
 * "tap to retry" if they fail.
 */
export function ChatView({
  conversationId,
  hubId,
  header,
}: {
  conversationId: Id<"conversations">;
  hubId: Id<"hubs">;
  header?: ReactElement;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const me = useQuery(api.users.me);
  const members = useQuery(api.hubs.members, { hubId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    { conversationId },
    { initialNumItems: PAGE_SIZE },
  );
  const send = useMutation(api.messages.send).withOptimisticUpdate((store, args) => {
    if (!me) return;
    const quoted = args.replyToId ? results.find((m) => m._id === args.replyToId) : undefined;
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
        canDelete: false,
        reactions: [],
        replyTo: quoted
          ? { _id: quoted._id, authorName: quoted.author.name, body: quoted.body, deleted: false }
          : null,
        mentions: [],
        mentionsMe: false,
      },
    });
  });
  const edit = useMutation(api.messages.edit);
  const remove = useMutation(api.messages.remove);
  const toggleReaction = useMutation(api.messages.toggleReaction);
  const markRead = useMutation(api.readStates.markRead);
  const seenBy = useQuery(api.readStates.seenBy, { conversationId });

  // Reading happens while the chat is on screen: mark read on open and on each new message.
  const newestId = results[0]?._id;
  useEffect(() => {
    if (newestId === undefined || !newestId.startsWith("optimistic-")) {
      markRead({ conversationId }).catch(() => undefined);
    }
  }, [conversationId, newestId, markRead]);

  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>(null);
  const [picked, setPicked] = useState<Person[]>([]);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const now = Date.now();

  const query = mentionQuery(draft);
  const suggestions =
    query === null || members === undefined
      ? []
      : members
          .filter((m) => !m.isMe && m.name !== null)
          .filter((m) =>
            (m.name ?? "")
              .toLocaleLowerCase("nb")
              .split(/\s+/)
              .some((word) => word.startsWith(query.toLocaleLowerCase("nb"))),
          )
          .slice(0, MAX_SUGGESTIONS);

  function pickSuggestion(person: Person) {
    setDraft((d) => d.replace(/@[\p{L}\p{M}-]*$/u, `@${person.name} `));
    setPicked((p) => (p.some((x) => x.userId === person.userId) ? p : [...p, person]));
  }

  function reset() {
    setDraft("");
    setMode(null);
    setPicked([]);
  }

  function submit() {
    const body = draft;
    if (body.trim().length === 0) return;
    if (mode?.kind === "edit") {
      const messageId = mode.message._id;
      reset();
      edit({ messageId, body }).catch(() => Alert.alert(t("chat.editFailed")));
      return;
    }
    const mentions = picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.userId);
    const replyToId = mode?.kind === "reply" ? mode.message._id : undefined;
    reset();
    send({ conversationId, body, mentions, ...(replyToId && { replyToId }) }).catch(() =>
      setFailed((f) => [...f, { key: `${Date.now()}-${f.length}`, body }]),
    );
  }

  function retry(item: Failed) {
    setFailed((f) => f.filter((x) => x.key !== item.key));
    send({ conversationId, body: item.body }).catch(() =>
      setFailed((f) => [...f, { key: `${Date.now()}-${f.length}`, body: item.body }]),
    );
  }

  function confirmDelete(message: Message) {
    Alert.alert(t("chat.deleteTitle"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("chat.delete"),
        style: "destructive",
        onPress: () => void remove({ messageId: message._id }),
      },
    ]);
  }

  function renderItem({ item, index }: { item: Message; index: number }) {
    const older = results[index + 1];
    const newer = results[index - 1];
    const day = osloDayKey(item._creationTime);
    const newDay = older === undefined || osloDayKey(older._creationTime) !== day;
    const startsGroup =
      newDay ||
      older.author._id !== item.author._id ||
      item._creationTime - older._creationTime > GROUP_GAP;
    const endsGroup =
      newer === undefined ||
      newer.author._id !== item.author._id ||
      newer._creationTime - item._creationTime > GROUP_GAP ||
      osloDayKey(newer._creationTime) !== day;
    // The list is inverted, so what renders before an item appears above it.
    return (
      <View>
        {newDay && (older !== undefined || status === "Exhausted") ? (
          <Text className="py-3 text-center font-sans-semibold text-[12px] text-textMuted">
            {dayLabel(item._creationTime, now, locale, t)}
          </Text>
        ) : null}
        <Bubble
          message={item}
          showAuthor={(startsGroup || item.replyTo !== null) && !item.isMine}
          showAvatar={endsGroup}
          locale={locale}
          onLongPress={() => setActionsFor(item)}
          onToggleReaction={(emoji) => void toggleReaction({ messageId: item._id, emoji })}
        />
        {index === 0 && seenBy?.messageId === item._id && seenBy.count > 0 ? (
          <Text
            className={`mt-1 font-sans text-[11px] text-textMuted ${item.isMine ? "self-end" : "ml-10"}`}
          >
            {t("chat.seenBy", { count: seenBy.count })}
          </Text>
        ) : null}
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
                  onPress={() => retry(f)}
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
      <Composer
        draft={draft}
        onChangeDraft={setDraft}
        onSubmit={submit}
        editing={mode?.kind === "edit"}
        context={
          mode === null
            ? null
            : {
                label:
                  mode.kind === "edit"
                    ? t("chat.editing")
                    : t("chat.replyingTo", {
                        name: mode.message.author.name ?? t("chat.deletedUser"),
                      }),
                preview: mode.message.body,
              }
        }
        onCancelContext={reset}
        suggestions={suggestions}
        onPickSuggestion={pickSuggestion}
      />
      <MessageActions
        message={actionsFor}
        onClose={() => setActionsFor(null)}
        onReact={(emoji) => {
          if (actionsFor) void toggleReaction({ messageId: actionsFor._id, emoji });
        }}
        onReply={() => actionsFor && setMode({ kind: "reply", message: actionsFor })}
        onEdit={() => {
          if (!actionsFor) return;
          setMode({ kind: "edit", message: actionsFor });
          setDraft(actionsFor.body);
        }}
        onDelete={() => actionsFor && confirmDelete(actionsFor)}
      />
    </View>
  );
}
