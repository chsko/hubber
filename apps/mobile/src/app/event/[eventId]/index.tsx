import { api } from "@hubbr/backend/api";
import type { Id } from "@hubbr/backend/dataModel";
import { formatCompactDate } from "@hubbr/i18n";
import { colors, kommuneName } from "@hubbr/shared";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { router, useLocalSearchParams } from "expo-router";
import {
  BadgeCheck,
  CalendarPlus,
  Globe,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
} from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/avatar";
import { formatWhen, type Rsvp } from "@/components/events/event-ui";
import { NotAMember } from "@/components/not-a-member";
import { ReportSheet } from "@/components/report-sheet";
import { StackHeader } from "@/components/stack-header";
import { UnreadBadge } from "@/components/unread-badge";
import { useAddToCalendar } from "@/lib/calendar-feed";
import { convexErrorCode } from "@/lib/errors";
import { useLocale } from "@/lib/i18n";
import { useScheme } from "@/lib/use-scheme";

const MAX_GUESTS = 10;
const MAX_NOTE_LENGTH = 200;

function openInMaps(place: string, geo: { lat: number; lon: number } | null) {
  const q = encodeURIComponent(place);
  const at = geo ? `${geo.lat},${geo.lon}` : null;
  const url =
    Platform.OS === "ios"
      ? `https://maps.apple.com/?q=${q}${at ? `&ll=${at}` : ""}`
      : Platform.OS === "android"
        ? `geo:${at ?? "0,0"}?q=${at ? `${at}(${q})` : q}`
        : `https://www.google.com/maps/search/?api=1&query=${at ?? q}`;
  void Linking.openURL(url);
}

/**
 * Event screen (docs/DESIGN.md §4): cover, title, time, place, host, RSVP,
 * who's coming, description and the event's chat.
 */
export default function EventScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const c = colors[useScheme()];
  const { eventId } = useLocalSearchParams<{ eventId: Id<"events"> }>();
  const event = useQuery(api.events.get, { eventId });
  const cancel = useMutation(api.events.cancel);
  const addToCalendar = useAddToCalendar();
  const me = useQuery(api.users.me);
  const [reporting, setReporting] = useState(false);

  if (event === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator accessibilityLabel={t("common.loading")} />
      </SafeAreaView>
    );
  }
  if (event === null) return <NotAMember />;

  function manage() {
    Alert.alert(event?.title ?? "", undefined, [
      {
        text: t("events.edit"),
        onPress: () => router.push({ pathname: "/event/[eventId]/edit", params: { eventId } }),
      },
      {
        text: t("events.cancelEvent"),
        style: "destructive",
        onPress: () =>
          Alert.alert(t("events.cancelTitle"), t("events.cancelBody"), [
            { text: t("common.back"), style: "cancel" },
            {
              text: t("events.cancelEvent"),
              style: "destructive",
              onPress: () => void cancel({ eventId }),
            },
          ]),
      },
      { text: t("common.close"), style: "cancel" },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StackHeader
        title={event.hub?.name ?? t("events.public")}
        action={
          event.canManage && !event.cancelled && !event.past ? (
            <Pressable
              testID="manage-event"
              accessibilityRole="button"
              onPress={manage}
              className="mr-2 rounded-full bg-primarySoft px-4 py-2 active:opacity-80"
            >
              <Text className="font-sans-bold text-[14px] text-primaryStrong">
                {t("events.edit")}
              </Text>
            </Pressable>
          ) : null
        }
      />
      <ScrollView contentContainerClassName="gap-5 px-5 pb-12">
        {event.coverUrl ? (
          <Image
            source={{ uri: event.coverUrl }}
            style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16 }}
            accessibilityIgnoresInvertColors
          />
        ) : null}

        <View className="gap-1.5">
          {event.visibility === "public" ? (
            <View className="flex-row items-center gap-1.5">
              <Globe color={c.textMuted} size={14} strokeWidth={2.2} />
              <Text className="font-sans-semibold text-[13px] text-textMuted">
                {[
                  t("events.public"),
                  event.category ? t(`events.categories.${event.category}`) : null,
                  kommuneName(event.kommuneNr),
                  event.hub && !event.inHub ? t("events.onBehalf", { name: event.hub.name }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          ) : null}
          {event.cancelled ? (
            <View className="self-start rounded-full bg-accentSoft px-3 py-1">
              <Text className="font-sans-bold text-[13px] text-onAccentSoft">
                {t("events.cancelled")}
              </Text>
            </View>
          ) : null}
          <Text
            accessibilityRole="header"
            className={`font-sans-extrabold text-[26px] leading-8 ${event.cancelled ? "text-textMuted line-through" : "text-text"}`}
          >
            {event.title}
          </Text>
          <Text className="font-sans-semibold text-[16px] text-text">
            {formatWhen(event.startsAt, event.endsAt, locale)}
          </Text>
          {event.place ? (
            <Pressable
              accessibilityRole="link"
              accessibilityHint={t("events.openInMaps")}
              onPress={() => openInMaps(event.place ?? "", event.placeGeo)}
              className="flex-row items-center gap-1.5 active:opacity-60"
            >
              <MapPin color={c.primary} size={16} strokeWidth={2.2} />
              <Text className="flex-1 font-sans-semibold text-[15px] text-primary">
                {event.place}
              </Text>
            </Pressable>
          ) : null}
          <View className="flex-row items-center gap-1.5">
            <Text className="font-sans text-[15px] text-textMuted">
              {t("events.host", { name: event.host.name ?? t("chat.deletedUser") })}
            </Text>
            {event.host.verified ? (
              <BadgeCheck
                color={c.primary}
                size={16}
                strokeWidth={2.4}
                accessibilityLabel={t("profile.verified")}
              />
            ) : null}
          </View>
        </View>

        <RsvpPanel event={event} />

        {event.description ? (
          <Text className="font-sans text-[16px] leading-6 text-text">{event.description}</Text>
        ) : null}

        {event.conversationId ? (
          <Pressable
            testID="event-chat"
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/event/[eventId]/chat", params: { eventId } })}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 active:opacity-70"
          >
            <MessageCircle color={c.primary} size={20} strokeWidth={2.2} />
            <Text className="flex-1 font-sans-semibold text-[16px] text-text">
              {t("events.chat")}
            </Text>
            <UnreadBadge count={event.chatUnread} />
          </Pressable>
        ) : null}

        {event.conversationId === null && !event.cancelled && !event.past ? (
          <Text className="font-sans text-[14px] leading-5 text-textMuted">
            {t("events.joinToChat")}
          </Text>
        ) : null}

        {!event.cancelled && !event.past ? (
          <Pressable
            testID="add-to-calendar"
            accessibilityRole="button"
            onPress={() =>
              void addToCalendar(eventId).catch(() => Alert.alert(t("events.saveFailed")))
            }
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 active:opacity-70"
          >
            <CalendarPlus color={c.primary} size={20} strokeWidth={2.2} />
            <Text className="flex-1 font-sans-semibold text-[16px] text-text">
              {t("events.addToCalendar")}
            </Text>
          </Pressable>
        ) : null}

        <Attendees eventId={eventId} />

        {event.host._id !== me?._id ? (
          <Pressable
            testID="report-event"
            accessibilityRole="button"
            onPress={() => setReporting(true)}
            className="items-center py-2 active:opacity-60"
          >
            <Text className="font-sans-semibold text-[14px] text-textMuted">
              {t("report.event")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <ReportSheet
        target={reporting ? { type: "event", id: eventId } : null}
        onClose={() => setReporting(false)}
      />
    </SafeAreaView>
  );
}

type EventView = NonNullable<FunctionReturnType<typeof api.events.get>>;

/** Going / Maybe / No, plus guests and a note when going (HUB-24). */
function RsvpPanel({ event }: { event: EventView }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const c = colors[useScheme()];
  const rsvp = useMutation(api.events.rsvp);
  const [note, setNote] = useState(event.my?.note ?? "");
  const status = event.my?.status ?? null;
  const guests = event.my?.guests ?? 0;

  async function answer(next: Rsvp, extra: { guests?: number; note?: string | null } = {}) {
    try {
      await rsvp({ eventId: event._id, status: next, ...extra });
    } catch (error) {
      const code = convexErrorCode(error);
      Alert.alert(
        code === "EVENT_FULL"
          ? t("events.full")
          : code === "RSVP_CLOSED"
            ? t("events.rsvpClosed")
            : t("events.saveFailed"),
      );
    }
  }

  const options: Rsvp[] = ["yes", "maybe", "no"];
  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      {event.rsvpClosed ? (
        <Text className="font-sans-semibold text-[15px] text-textMuted">
          {event.my ? t(`events.my.${event.my.status}`) : t("events.rsvpClosed")}
        </Text>
      ) : (
        <View accessibilityRole="radiogroup" className="flex-row gap-2">
          {options.map((o) => {
            const selected = status === o;
            const disabled = o === "yes" && event.full && status !== "yes";
            return (
              <Pressable
                key={o}
                testID={`rsvp-${o}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                onPress={() => void answer(o)}
                className={`flex-1 items-center rounded-full py-3 ${selected ? "bg-primary" : "border border-border bg-bg"} ${disabled ? "opacity-40" : "active:opacity-70"}`}
              >
                <Text
                  className={`font-sans-bold text-[15px] ${selected ? "text-bg" : "text-text"}`}
                >
                  {t(`events.rsvp.${o}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text className="font-sans text-[14px] text-textMuted">
        {[
          t("events.goingCount", { count: event.counts.yes }),
          t("events.maybeCount", { count: event.counts.maybe }),
          event.capacity !== null ? t("events.capacityOf", { count: event.capacity }) : null,
          event.rsvpDeadline !== null && !event.rsvpClosed
            ? t("events.answerBy", { date: formatCompactDate(event.rsvpDeadline, locale) })
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>

      {status === "yes" && !event.rsvpClosed ? (
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-[15px] text-text">{t("events.guests")}</Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("events.fewerGuests")}
              disabled={guests === 0}
              onPress={() => void answer("yes", { guests: guests - 1 })}
              className="h-11 w-11 items-center justify-center rounded-full border border-border disabled:opacity-40"
            >
              <Minus color={c.text} size={18} />
            </Pressable>
            <Text className="w-6 text-center font-sans-bold text-[17px] text-text">{guests}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("events.moreGuests")}
              disabled={guests >= MAX_GUESTS}
              onPress={() => void answer("yes", { guests: guests + 1 })}
              className="h-11 w-11 items-center justify-center rounded-full border border-border disabled:opacity-40"
            >
              <Plus color={c.text} size={18} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {status !== null && !event.rsvpClosed ? (
        <TextInput
          testID="rsvp-note"
          value={note}
          onChangeText={setNote}
          onEndEditing={() => {
            if (note.trim() !== (event.my?.note ?? ""))
              void answer(status, { note: note.trim() || null });
          }}
          placeholder={t("events.notePlaceholder")}
          placeholderTextColor={c.textMuted}
          maxLength={MAX_NOTE_LENGTH}
          returnKeyType="done"
          className="rounded-xl border border-border bg-bg px-3.5 py-3 font-sans text-[15px] text-text"
        />
      ) : null}
    </View>
  );
}

/** Who's coming, by answer; "No reply" last. */
function Attendees({ eventId }: { eventId: Id<"events"> }) {
  const { t } = useTranslation();
  const list = useQuery(api.events.attendees, { eventId });
  if (!list) return null;
  const sections = [
    { key: "yes", people: list.yes },
    { key: "maybe", people: list.maybe },
    { key: "no", people: list.no },
    { key: "noReply", people: list.noReply },
  ] as const;
  return (
    <View className="gap-4">
      {sections.map(({ key, people }) =>
        people.length === 0 ? null : (
          <View key={key} className="gap-2">
            <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
              {t(`events.list.${key}`, { count: people.length })}
            </Text>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              {people.map((p, i) => (
                <View
                  key={p._id}
                  className={`flex-row items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <Avatar name={p.name} photoUrl={p.photoUrl} size={32} />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="font-sans-semibold text-[15px] text-text">
                      {p.name ?? t("chat.deletedUser")}
                      {p.isMe ? ` (${t("members.you")})` : ""}
                      {"guests" in p && p.guests > 0 ? ` +${p.guests}` : ""}
                    </Text>
                    {"note" in p && p.note ? (
                      <Text numberOfLines={2} className="font-sans text-[13px] text-textMuted">
                        {p.note}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ),
      )}
    </View>
  );
}
