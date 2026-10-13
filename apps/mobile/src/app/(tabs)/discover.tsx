import { api } from "@hubber/backend/api";
import { osloDateParts, osloToEpoch, osloWeekdayIndex } from "@hubber/i18n";
import { colors, kommuneName } from "@hubber/shared";
import { useMutation, useQuery } from "convex/react";
import { Link } from "expo-router";
import { ChevronDown, MapPin, Plus, Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { RingEmptyState } from "@/components/empty-state";
import { type Category, categories } from "@/components/events/categories";
import { EventRow } from "@/components/events/event-ui";
import { KommuneSheet } from "@/components/kommune-sheet";
import { Screen } from "@/components/screen";
import { useScheme } from "@/lib/use-scheme";

type When = "today" | "weekend" | "month";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Query times are rounded to this, so the live query isn't re-made on every render. */
const STEP_MS = 5 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 300;

/** Midnight in Oslo, `days` days after the Oslo date of `at`. */
function midnightAfter(at: number, days: number): number {
  const { year, month, day } = osloDateParts(at);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return osloToEpoch({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: 0,
    minute: 0,
  });
}

/** [from, to) for each date filter. The weekend runs from Friday 17:00 to Monday. */
function whenRange(when: When, now: number): { from: number; to: number } {
  if (when === "today") return { from: now, to: midnightAfter(now, 1) };
  if (when === "month") return { from: now, to: now + 30 * DAY_MS };
  const weekday = osloWeekdayIndex(now); // Monday = 0
  const friday = midnightAfter(now, 4 - weekday);
  const fridayEvening = osloToEpoch({ ...osloDateParts(friday), hour: 17, minute: 0 });
  return {
    from: Math.max(now, weekday <= 4 ? fridayEvening : now),
    to: midnightAfter(now, 7 - weekday),
  };
}

/**
 * Discover (HUB-30): public events by kommune, date and category, with a
 * title search. Ordered by start time; no ranking, no recommendations.
 */
export default function DiscoverScreen() {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const me = useQuery(api.users.me);
  const setKommune = useMutation(api.users.setKommune);
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [choosing, setChoosing] = useState(false);
  const [when, setWhen] = useState<When>("month");
  const [category, setCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const kommune = picked !== undefined ? picked : (me?.kommuneNr ?? null);
  const now = Math.floor(Date.now() / STEP_MS) * STEP_MS;
  const range = whenRange(when, now);
  const events = useQuery(
    api.events.discover,
    me === undefined
      ? "skip"
      : {
          kommuneNr: kommune,
          ...range,
          category,
          ...(search !== "" && { search }),
        },
  );

  function chooseKommune(nr: string | null) {
    setPicked(nr);
    setChoosing(false);
    void setKommune({ kommuneNr: nr });
  }

  const chip = (selected: boolean) =>
    `rounded-full px-3.5 py-2 ${selected ? "bg-primary" : "border border-border bg-surface"} active:opacity-70`;
  const chipText = (selected: boolean) =>
    `font-sans-semibold text-[14px] ${selected ? "text-bg" : "text-text"}`;

  return (
    <Screen title={t("tabs.discover")} subtitle={t("discover.subtitle")}>
      <View className="flex-row items-center gap-2">
        <Pressable
          testID="discover-kommune"
          accessibilityRole="button"
          accessibilityLabel={t("discover.pickKommune")}
          onPress={() => setChoosing(true)}
          className="flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-3 active:opacity-70"
        >
          <MapPin color={c.primary} size={18} strokeWidth={2.2} />
          <Text numberOfLines={1} className="flex-1 font-sans-semibold text-[16px] text-text">
            {kommuneName(kommune) ?? t("discover.allNorway")}
          </Text>
          <ChevronDown color={c.textMuted} size={18} />
        </Pressable>
        <Link href="/event/new" asChild>
          <Pressable
            testID="discover-new"
            accessibilityRole="button"
            accessibilityLabel={t("discover.create")}
            className="h-12 w-12 items-center justify-center rounded-xl bg-primarySoft active:opacity-80"
          >
            <Plus color={c.primaryStrong} size={22} strokeWidth={2.4} />
          </Pressable>
        </Link>
      </View>

      <View className="-mt-2 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3.5">
        <Search color={c.textMuted} size={18} />
        <TextInput
          testID="discover-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t("discover.search")}
          placeholderTextColor={c.textMuted}
          returnKeyType="search"
          className="flex-1 py-3 font-sans text-[16px] text-text"
        />
      </View>

      <View className="-mt-2 gap-2">
        <View accessibilityRole="radiogroup" className="flex-row gap-2">
          {(["today", "weekend", "month"] as const).map((w) => (
            <Pressable
              key={w}
              testID={`discover-${w}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: when === w }}
              onPress={() => setWhen(w)}
              className={chip(when === w)}
            >
              <Text className={chipText(when === w)}>{t(`discover.when.${w}`)}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
          className="-mx-5"
          contentContainerStyle={{ paddingHorizontal: 20 }}
        >
          {[null, ...categories].map((k) => (
            <Pressable
              key={k ?? "all"}
              testID={`discover-category-${k ?? "all"}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: category === k }}
              onPress={() => setCategory(k)}
              className={chip(category === k)}
            >
              <Text className={chipText(category === k)}>
                {k === null ? t("discover.allCategories") : t(`events.categories.${k}`)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {events === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} />
      ) : events.length === 0 ? (
        <RingEmptyState title={t("discover.empty")} body={t("discover.emptyBody")}>
          <Link href="/event/new" asChild>
            <Pressable
              testID="discover-create"
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 active:opacity-80"
            >
              <Plus color={c.bg} size={20} strokeWidth={2.4} />
              <Text className="font-sans-bold text-[16px] text-bg">{t("discover.create")}</Text>
            </Pressable>
          </Link>
        </RingEmptyState>
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          {events.map((e, i) => (
            <EventRow
              key={e._id}
              event={e}
              first={i === 0}
              subtitle={[
                e.place,
                kommune === null ? kommuneName(e.kommuneNr) : null,
                e.category ? t(`events.categories.${e.category}`) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </View>
      )}

      <KommuneSheet
        visible={choosing}
        selected={kommune}
        allowAll
        onClose={() => setChoosing(false)}
        onSelect={chooseKommune}
      />
    </Screen>
  );
}
