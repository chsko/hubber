import { api } from "@hubber/backend/api";
import { formatLongDate, osloDateParts, osloToEpoch } from "@hubber/i18n";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Linking, Pressable, Share, Text, View } from "react-native";
import { EventRow } from "@/components/events/event-ui";
import { type Day, dayKey, MonthCalendar } from "@/components/events/month-calendar";
import { Screen } from "@/components/screen";
import { feedUrl } from "@/lib/calendar-feed";
import { useLocale } from "@/lib/i18n";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The agenda looks this far ahead. */
const AGENDA_DAYS = 60;

type Mode = "agenda" | "month";

const midnight = (d: Day) => osloToEpoch({ ...d, hour: 0, minute: 0 });

/**
 * Calendar (HUB-27): every event in your hubs, except those you said no to,
 * as an agenda or a month. Plus a subscription link for the phone's own
 * calendar app.
 */
export default function CalendarScreen() {
  const { t } = useTranslation();
  const [view, setView] = useState<Mode>("agenda");
  return (
    <Screen title={t("tabs.calendar")}>
      <View accessibilityRole="tablist" className="flex-row rounded-full bg-surface p-1">
        {(["agenda", "month"] as const).map((v) => {
          const selected = v === view;
          return (
            <Pressable
              key={v}
              testID={`calendar-${v}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setView(v)}
              className={`flex-1 items-center rounded-full py-2 ${selected ? "bg-primarySoft" : ""}`}
            >
              <Text
                className={`font-sans-semibold text-[14px] ${selected ? "text-primaryStrong" : "text-textMuted"}`}
              >
                {t(`calendar.${v}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {view === "agenda" ? <Agenda /> : <Month />}
      <Subscribe />
    </Screen>
  );
}

type CalendarEvent = FunctionReturnType<typeof api.calendar.range>[number];

function useRange(from: number, to: number) {
  return useQuery(api.calendar.range, { from, to });
}

/** Events grouped under a heading per day. */
function DayGroups({ events }: { events: CalendarEvent[] }) {
  const locale = useLocale();
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = dayKey(osloDateParts(e.startsAt));
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return (
    <View className="gap-4">
      {[...groups.entries()].map(([key, list]) => (
        <View key={key} className="gap-2">
          <Text className="font-sans-semibold text-[13px] capitalize text-textMuted">
            {formatLongDate(list[0]?.startsAt ?? 0, locale)}
          </Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {list.map((e, i) => (
              <EventRow key={e._id} event={e} subtitle={e.hubName} first={i === 0} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Agenda() {
  const { t } = useTranslation();
  // Rounded to the hour, so the query doesn't change on every render.
  const [from] = useState(() => Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const events = useRange(from, from + AGENDA_DAYS * DAY_MS);
  if (events === undefined) return <ActivityIndicator />;
  if (events.length === 0) {
    return (
      <Text className="font-sans text-[15px] leading-6 text-textMuted">{t("calendar.empty")}</Text>
    );
  }
  return <DayGroups events={events} />;
}

function Month() {
  const { t } = useTranslation();
  const today = osloDateParts(Date.now());
  const [month, setMonth] = useState({ year: today.year, month: today.month });
  const [selected, setSelected] = useState<Day | null>(today);
  const from = midnight({ ...month, day: 1 });
  const next =
    month.month === 12 ? { year: month.year + 1, month: 1 } : { ...month, month: month.month + 1 };
  const to = midnight({ ...next, day: 1 });
  const events = useRange(from, to);
  const marked = new Set((events ?? []).map((e) => dayKey(osloDateParts(e.startsAt))));
  const onDay = selected
    ? (events ?? []).filter((e) => dayKey(osloDateParts(e.startsAt)) === dayKey(selected))
    : [];

  return (
    <View className="gap-4">
      <View className="rounded-2xl border border-border bg-surface p-3">
        <MonthCalendar
          month={month}
          onMonthChange={(m) => {
            setMonth(m);
            setSelected(null);
          }}
          selected={selected}
          today={today}
          marked={marked}
          onSelect={setSelected}
        />
      </View>
      {events === undefined ? (
        <ActivityIndicator />
      ) : selected === null ? null : onDay.length === 0 ? (
        <Text className="font-sans text-[15px] text-textMuted">{t("calendar.nothingThatDay")}</Text>
      ) : (
        <DayGroups events={onDay} />
      )}
    </View>
  );
}

/** The secret webcal link: subscribe, share, make a new one or turn it off. */
function Subscribe() {
  const { t } = useTranslation();
  const token = useQuery(api.calendar.feed);
  const createFeed = useMutation(api.calendar.createFeed);
  const deleteFeed = useMutation(api.calendar.deleteFeed);

  async function subscribe() {
    const current = token ?? (await createFeed({}));
    await Linking.openURL(feedUrl(current, "webcal"));
  }

  function more() {
    if (!token) return;
    Alert.alert(t("calendar.feedTitle"), t("calendar.feedPrivate"), [
      { text: t("calendar.share"), onPress: () => void Share.share({ message: feedUrl(token) }) },
      {
        text: t("calendar.newLink"),
        onPress: () => void createFeed({ reset: true }),
      },
      {
        text: t("calendar.turnOff"),
        style: "destructive",
        onPress: () => void deleteFeed({}),
      },
      { text: t("common.close"), style: "cancel" },
    ]);
  }

  return (
    <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
      <Text className="font-sans-bold text-[16px] text-text">{t("calendar.feedTitle")}</Text>
      <Text className="font-sans text-[14px] leading-5 text-textMuted">
        {t("calendar.feedBody")}
      </Text>
      <View className="flex-row items-center gap-4 pt-1">
        <Pressable
          testID="calendar-subscribe"
          accessibilityRole="button"
          onPress={() => void subscribe()}
          className="rounded-full bg-primarySoft px-4 py-2.5 active:opacity-80"
        >
          <Text className="font-sans-bold text-[14px] text-primaryStrong">
            {t("calendar.subscribe")}
          </Text>
        </Pressable>
        {token ? (
          <Pressable accessibilityRole="button" onPress={more}>
            <Text className="font-sans-semibold text-[14px] text-primary">
              {t("calendar.manageLink")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
