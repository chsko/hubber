import { api } from "@hubbr/backend/api";
import type { Id } from "@hubbr/backend/dataModel";
import { insertAtTop, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { type ReactElement, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { useLocale } from "@/lib/i18n";
import { pickChatImages, takeChatPhoto, useUploadImage } from "@/lib/image-upload";
import { Bubble } from "./bubble";
import { Composer, type Person } from "./composer";
import { dayLabel, osloDayKey } from "./day-label";
import { ImageViewer } from "./image-viewer";
import { MessageActions } from "./message-actions";
import { type ReportTarget, ReportSheet, useConfirmBlock } from "@/components/report-sheet";
import type { Message } from "./types";

const PAGE_SIZE = 30;
/** Consecutive messages from one person within this gap share one name and avatar. */
const GROUP_GAP = 5 * 60 * 1000;
const MAX_SUGGESTIONS = 5;

type Failed = { key: string; body: string; images: string[] };
const MAX_IMAGES = 6;
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
  header,
}: {
  conversationId: Id<"conversations">;
  header?: ReactElement;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const me = useQuery(api.users.me);
  const members = useQuery(api.messages.people, { conversationId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    { conversationId },
    { initialNumItems: PAGE_SIZE },
  );
  const send = useMutation(api.messages.send).withOptimisticUpdate((store, args) => {
    // Photo messages appear once uploaded; text shows up at once.
    if (!me || (args.imageIds?.length ?? 0) > 0) return;
    const quoted = args.replyToId ? results.find((m) => m._id === args.replyToId) : undefined;
    insertAtTop({
      paginatedQuery: api.messages.list,
      argsToMatch: { conversationId: args.conversationId },
      localQueryStore: store,
      item: {
        _id: `optimistic-${Date.now()}` as Id<"messages">,
        _creationTime: Date.now(),
        body: args.body.trim(),
        imageCount: 0,
        deleted: false,
        editedAt: null,
        author: { _id: me._id, name: me.name, photoUrl: me.photoUrl },
        isMine: true,
        canDelete: false,
        reactions: [],
        replyTo: quoted
          ? {
              _id: quoted._id,
              authorName: quoted.author.name,
              body: quoted.body,
              hasImages: quoted.imageCount > 0,
              deleted: false,
            }
          : null,
        mentions: [],
        mentionsMe: false,
        event: null,
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
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const confirmBlock = useConfirmBlock();
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<{ messageId: string; count: number; start: number } | null>(
    null,
  );
  const upload = useUploadImage();
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
    setImages([]);
  }

  function addImages() {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const add = (uris: string[]) =>
      setImages((current) => [...current, ...uris].slice(0, MAX_IMAGES));
    Alert.alert(t("chat.addPhotos"), undefined, [
      { text: t("chat.fromLibrary"), onPress: () => void pickChatImages(room).then(add) },
      {
        text: t("chat.takePhoto"),
        onPress: () => void takeChatPhoto().then((uri) => uri && add([uri])),
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  /** Uploads any photos, then sends. Failures land in the "tap to retry" list. */
  async function deliver(
    body: string,
    imageUris: string[],
    extra: { mentions?: Id<"users">[]; replyToId?: Id<"messages"> },
  ) {
    try {
      if (imageUris.length > 0) setUploading(true);
      const imageIds = await Promise.all(imageUris.map(upload));
      await send({ conversationId, body, ...extra, ...(imageIds.length > 0 && { imageIds }) });
    } catch {
      setFailed((f) => [...f, { key: `${Date.now()}-${f.length}`, body, images: imageUris }]);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    const body = draft;
    if (body.trim().length === 0 && images.length === 0) return;
    if (mode?.kind === "edit") {
      const messageId = mode.message._id;
      reset();
      edit({ messageId, body }).catch(() => Alert.alert(t("chat.editFailed")));
      return;
    }
    const mentions = picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.userId);
    const replyToId = mode?.kind === "reply" ? mode.message._id : undefined;
    const imageUris = images;
    reset();
    void deliver(body, imageUris, { mentions, ...(replyToId && { replyToId }) });
  }

  function retry(item: Failed) {
    setFailed((f) => f.filter((x) => x.key !== item.key));
    void deliver(item.body, item.images, {});
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
          onOpenPhoto={(start) => setViewer({ messageId: item._id, count: item.imageCount, start })}
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
                  <Text className="font-sans text-[15px] text-text">
                    {f.body || t("chat.photos", { count: f.images.length })}
                  </Text>
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
                preview: mode.message.body || t("chat.photoQuote"),
              }
        }
        onCancelContext={reset}
        suggestions={suggestions}
        onPickSuggestion={pickSuggestion}
        images={images}
        onAddImages={addImages}
        onRemoveImage={(uri) => setImages((current) => current.filter((u) => u !== uri))}
        busy={uploading}
      />
      <ImageViewer photos={viewer} onClose={() => setViewer(null)} />
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
        onReport={() => actionsFor && setReportTarget({ type: "message", id: actionsFor._id })}
        onBlock={() => actionsFor && confirmBlock(actionsFor.author._id, actionsFor.author.name)}
      />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
}
