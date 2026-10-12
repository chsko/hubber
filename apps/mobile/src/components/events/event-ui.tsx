import { formatShortDate, formatTime, type Locale, osloDateParts } from "@hubber/i18n";
import { colors } from "@hubber/shared";
import { router } from "expo-router";
import { CalendarDays } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useLocale } from "@/lib/i18n";
import { useScheme } from "@/lib/use-scheme";

export type Rsvp = "yes" | "maybe" | "no";

const monthFormat = {
  nb: new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", month: "short" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", month: "short" }),
};

/** "søn. 13. des. · 17:00–19:00" */
export function formatWhen(startsAt: number, endsAt: number | null, locale: Locale): string {
  const start = `${formatShortDate(startsAt, locale)} · ${formatTime(startsAt, locale)}`;
  if (endsAt === null) return start;
  const sameDay = JSON.stringify(osloDateParts(startsAt)) === JSON.stringify(osloDateParts(endsAt));
  return sameDay
    ? `${start}–${formatTime(endsAt, locale)}`
    : `${start} – ${formatShortDate(endsAt, locale)} ${formatTime(endsAt, locale)}`;
}

/** The calendar-leaf date: month above, day number below. */
export function DateBlock({ at, dimmed = false }: { at: number; dimmed?: boolean }) {
  const locale = useLocale();
  return (
    <View
      className={`h-14 w-12 items-center justify-center rounded-xl ${dimmed ? "bg-border" : "bg-primarySoft"}`}
    >
      <Text className="font-sans-bold text-[11px] uppercase text-primaryStrong">
        {monthFormat[locale].format(at).replace(".", "")}
      </Text>
      <Text className="font-sans-extrabold text-[20px] leading-6 text-primaryStrong">
        {osloDateParts(at).day}
      </Text>
    </View>
  );
}

type RowEvent = {
  _id: string;
  title: string;
  startsAt: number;
  endsAt: number | null;
  place: string | null;
  cancelled: boolean;
  going: number;
  myRsvp: Rsvp | null;
};

/** One event in a list: date, title, time and place, and my answer. */
export function EventRow({
  event,
  subtitle,
  first,
}: {
  event: RowEvent;
  subtitle?: string | null;
  first: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <Pressable
      testID={`event-${event._id}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: event._id } })}
      className={`flex-row items-center gap-3 px-4 py-3 active:opacity-70 ${first ? "" : "border-t border-border"}`}
    >
      <DateBlock at={event.startsAt} dimmed={event.cancelled} />
      <View className="flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className={`font-sans-bold text-[16px] ${event.cancelled ? "text-textMuted line-through" : "text-text"}`}
        >
          {event.title}
        </Text>
        <Text numberOfLines={1} className="font-sans text-[13px] text-textMuted">
          {[formatWhen(event.startsAt, event.endsAt, locale), subtitle ?? event.place]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <Text className="font-sans-semibold text-[13px] text-primary">
          {event.cancelled
            ? t("events.cancelled")
            : event.myRsvp
              ? t(`events.my.${event.myRsvp}`)
              : t("events.goingCount", { count: event.going })}
        </Text>
      </View>
    </Pressable>
  );
}

/** The "New event" card in the hub chat. */
export function EventChatCard({
  event,
  onLongPress,
}: {
  event: { _id: string; title: string; startsAt: number; cancelled: boolean };
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const c = colors[useScheme()];
  return (
    <Pressable
      testID={`event-card-${event._id}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: event._id } })}
      onLongPress={onLongPress}
      delayLongPress={300}
      className="w-64 gap-2 rounded-2xl border border-border bg-surface p-3 active:opacity-80"
    >
      <View className="flex-row items-center gap-1.5">
        <CalendarDays color={c.primary} size={16} strokeWidth={2.2} />
        <Text className="font-sans-bold text-[12px] uppercase tracking-widest text-primary">
          {event.cancelled ? t("events.cancelled") : t("events.newEvent")}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <DateBlock at={event.startsAt} dimmed={event.cancelled} />
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={2} className="font-sans-bold text-[16px] text-text">
            {event.title}
          </Text>
          <Text className="font-sans text-[13px] text-textMuted">
            {formatWhen(event.startsAt, null, locale)}
          </Text>
        </View>
      </View>
      <Text className="font-sans-semibold text-[14px] text-primary">{t("events.answer")}</Text>
    </Pressable>
  );
}
