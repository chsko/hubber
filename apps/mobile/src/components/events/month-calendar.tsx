import { weekdayNames } from "@hubbr/i18n";
import { colors } from "@hubbr/shared";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useLocale } from "@/lib/i18n";
import { useScheme } from "@/lib/use-scheme";

/** A calendar day in Oslo. Months are 1-12. */
export type Day = { year: number; month: number; day: number };

export const dayKey = (d: Day) =>
  `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

const monthTitle = {
  nb: new Intl.DateTimeFormat("nb-NO", { timeZone: "UTC", month: "long", year: "numeric" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }),
};

/**
 * The weeks of a month, Monday first, with null for days outside it. Always
 * six weeks, so the grid keeps its height when switching months.
 */
function weeks(year: number, month: number): (Day | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (Day | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => ({ year, month, day: i + 1 })),
  ];
  while (cells.length < 6 * 7) cells.push(null);
  return Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/**
 * A month grid (Monday first, Norwegian style). Shows `month`, highlights
 * `selected` and `today`, and dots the days in `marked`.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  today,
  marked,
  minDay,
  onSelect,
}: {
  month: { year: number; month: number };
  onMonthChange: (month: { year: number; month: number }) => void;
  selected: Day | null;
  today: Day;
  marked?: ReadonlySet<string>;
  minDay?: Day;
  onSelect: (day: Day) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const c = colors[useScheme()];
  const shift = (delta: number) => {
    const index = month.year * 12 + (month.month - 1) + delta;
    onMonthChange({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  };
  const title = monthTitle[locale].format(Date.UTC(month.year, month.month - 1, 1));
  const min = minDay ? dayKey(minDay) : null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.previousMonth")}
          onPress={() => shift(-1)}
          className="h-11 w-11 items-center justify-center active:opacity-60"
        >
          <ChevronLeft color={c.primary} size={22} />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="font-sans-bold text-[16px] capitalize text-text"
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.nextMonth")}
          onPress={() => shift(1)}
          className="h-11 w-11 items-center justify-center active:opacity-60"
        >
          <ChevronRight color={c.primary} size={22} />
        </Pressable>
      </View>
      <View className="flex-row">
        {weekdayNames(locale).map((name) => (
          <Text
            key={name}
            className="flex-1 text-center font-sans-semibold text-[12px] text-textMuted"
          >
            {name.replace(".", "")}
          </Text>
        ))}
      </View>
      {weeks(month.year, month.month).map((week, w) => (
        <View key={w} className="flex-row">
          {week.map((d, i) => {
            if (d === null) return <View key={i} className="h-11 flex-1" />;
            const key = dayKey(d);
            const isSelected = selected !== null && dayKey(selected) === key;
            const isToday = dayKey(today) === key;
            const disabled = min !== null && key < min;
            return (
              <Pressable
                key={i}
                testID={`day-${key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled }}
                disabled={disabled}
                onPress={() => onSelect(d)}
                className="h-11 flex-1 items-center justify-center"
              >
                <View
                  className={`h-9 w-9 items-center justify-center rounded-full ${isSelected ? "bg-primary" : isToday ? "border border-primary" : ""}`}
                >
                  <Text
                    className={`font-sans-semibold text-[15px] ${isSelected ? "text-bg" : disabled ? "text-border" : "text-text"}`}
                  >
                    {d.day}
                  </Text>
                </View>
                {marked?.has(key) && !isSelected ? (
                  <View className="absolute bottom-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
