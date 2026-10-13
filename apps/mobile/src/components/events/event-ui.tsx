import { formatShortDate, formatTime, type Locale, osloDateParts } from "@hubber/i18n";
import { colors } from "@hubber/shared";
import { router } from "expo-router";
import { CalendarDays } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { LogoMark } from "@/components/logo";
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
export function DateBlock({
  at,
  dimmed = false,
  accent = false,
}: {
  at: number;
  dimmed?: boolean;
  /** Amber leaf, for the hero card on a primary background. */
  accent?: boolean;
}) {
  const locale = useLocale();
  const bg = dimmed ? "bg-border" : accent ? "bg-accent" : "bg-primarySoft";
  // Amber is light in both themes, so its text stays dark.
  const fg = accent ? "text-[#1D2321]" : "text-primaryStrong";
  return (
    <View className={`h-14 w-12 items-center justify-center rounded-xl ${bg}`}>
      <Text className={`font-sans-bold text-[11px] uppercase ${fg}`}>
        {monthFormat[locale].format(at).replace(".", "")}
      </Text>
      <Text className={`font-sans-extrabold text-[20px] leading-6 ${fg}`}>
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

type HeroEvent = RowEvent & { hubName: string | null };

const isSameOsloDay = (a: number, b: number) =>
  JSON.stringify(osloDateParts(a)) === JSON.stringify(osloDateParts(b));

/** "today" or "tomorrow" in Oslo, else null. */
function relativeDay(at: number): "today" | "tomorrow" | null {
  const now = Date.now();
  if (isSameOsloDay(at, now)) return "today";
  if (isSameOsloDay(at, now + 24 * 60 * 60 * 1000)) return "tomorrow";
  return null;
}

/** The next event on Home: a primary card with the ring as a watermark. */
export function NextEventHero({ event }: { event: HeroEvent }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const day = relativeDay(event.startsAt);
  return (
    <Pressable
      testID={`next-event-${event._id}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: event._id } })}
      className="gap-3 overflow-hidden rounded-3xl bg-primary p-4 active:opacity-90"
    >
      <View
        className="absolute -bottom-12 -right-10"
        style={{ opacity: 0.15 }}
        pointerEvents="none"
      >
        <LogoMark size={170} tone="onPrimary" />
      </View>
      <Text
        className="font-sans-bold text-[11px] uppercase tracking-widest text-bg"
        style={{ opacity: 0.8 }}
      >
        {day ? `${t("home.nextUp")} · ${t(`home.${day}`)}` : t("home.nextUp")}
      </Text>
      <View className="flex-row items-center gap-3">
        <DateBlock at={event.startsAt} accent />
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={2} className="font-sans-extrabold text-[19px] leading-6 text-bg">
            {event.title}
          </Text>
          <Text
            numberOfLines={1}
            className="font-sans text-[13px] text-bg"
            style={{ opacity: 0.85 }}
          >
            {[formatWhen(event.startsAt, event.endsAt, locale), event.place]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text numberOfLines={1} className="flex-1 font-sans-semibold text-[13px] text-bg">
          {[event.hubName, t("events.goingCount", { count: event.going })]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {event.myRsvp ? (
          <View className="rounded-full bg-accentSoft px-3 py-1">
            <Text className="font-sans-bold text-[12px] text-onAccentSoft">
              {t(`events.my.${event.myRsvp}`)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
