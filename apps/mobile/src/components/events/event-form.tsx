import type { Id } from "@hubber/backend/dataModel";
import {
  formatCompactDate,
  formatCompactDateWithWeekday,
  osloDateParts,
  osloTimeParts,
  osloToEpoch,
} from "@hubber/i18n";
import { colors, kommuneName } from "@hubber/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KommuneSheet } from "@/components/kommune-sheet";
import { StackHeader } from "@/components/stack-header";
import { convexErrorCode } from "@/lib/errors";
import { useLocale } from "@/lib/i18n";
import type { PickedPlace } from "@/lib/geonorge";
import { pickCoverImage, useUploadImage } from "@/lib/image-upload";
import { useScheme } from "@/lib/use-scheme";
import { type Category, categories } from "./categories";
import { type Day, MonthCalendar } from "./month-calendar";
import { PlaceField } from "./place-field";
import { BottomSheet } from "@/components/bottom-sheet";

/** Kept in step with packages/backend/convex/events.ts. */
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4000;

export type EventInput = {
  title: string;
  startsAt: number;
  endsAt: number | null;
  place: string | PickedPlace | null;
  description: string | null;
  coverId: Id<"_storage"> | null;
  capacity: number | null;
  rsvpDeadline: number | null;
  reminders: boolean;
  /** Public events (HUB-29): a category, and the kommune when the place has none. */
  category: Category | null;
  kommuneNr: string | null;
};

export type Visibility = "hub" | "public";

/** What an existing event starts the form with. */
export type EventInitial = Omit<EventInput, "place"> & {
  visibility: Visibility;
  place: string | null;
  placeGeo: { lat: number; lon: number; kommuneNr: string } | null;
  coverUrl: string | null;
};

type Time = { hour: number; minute: number };

/** Reads "17", "1730", "17:30" or "17.30" as a 24-hour time. */
export function parseTime(text: string): Time | null {
  const match = /^\s*(\d{1,2})(?:[:.]?(\d{2}))?\s*$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const timeText = (time: Time) => `${pad(time.hour)}:${pad(time.minute)}`;
const at = (day: Day, time: Time) => osloToEpoch({ ...day, ...time });
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Create or edit an event (HUB-23). Dates and times are Norwegian time,
 * 24-hour clock. In a hub, a new event can be made public (HUB-29); from
 * Discover it's always public. Visibility can't change afterwards.
 */
export function EventForm({
  title: screenTitle,
  submitLabel,
  initial,
  visibility: fixedVisibility,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial: EventInitial | null;
  /** Set when there's no choice: editing, or a new event without a hub. */
  visibility?: Visibility;
  onSubmit: (input: EventInput, visibility: Visibility) => Promise<void>;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const c = colors[useScheme()];
  const upload = useUploadImage();
  const now = Date.now();
  const today = osloDateParts(now);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [day, setDay] = useState<Day | null>(initial ? osloDateParts(initial.startsAt) : null);
  const [start, setStart] = useState(initial ? timeText(osloTimeParts(initial.startsAt)) : "18:00");
  const [end, setEnd] = useState(initial?.endsAt ? timeText(osloTimeParts(initial.endsAt)) : "");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [pickedPlace, setPickedPlace] = useState<PickedPlace | null>(
    initial?.place && initial.placeGeo ? { text: initial.place, ...initial.placeGeo } : null,
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [deadline, setDeadline] = useState<Day | null>(
    initial?.rsvpDeadline ? osloDateParts(initial.rsvpDeadline) : null,
  );
  const [cover, setCover] = useState<{ uri: string; local: boolean } | null>(
    initial?.coverUrl ? { uri: initial.coverUrl, local: false } : null,
  );
  const [reminders, setReminders] = useState(initial?.reminders ?? true);
  const [visibility, setVisibility] = useState<Visibility>(
    fixedVisibility ?? initial?.visibility ?? "hub",
  );
  const [category, setCategory] = useState<Category | null>(initial?.category ?? null);
  const [kommuneNr, setKommuneNr] = useState<string | null>(
    initial && initial.placeGeo === null ? initial.kommuneNr : null,
  );
  const [pickingKommune, setPickingKommune] = useState(false);
  const [picking, setPicking] = useState<"date" | "deadline" | null>(null);
  const [saving, setSaving] = useState(false);

  const startTime = parseTime(start);
  const endTime = end.trim() === "" ? null : parseTime(end);
  const capacityNumber = capacity.trim() === "" ? null : Number(capacity);
  const startsAt = day && startTime ? at(day, startTime) : null;
  let endsAt: number | null = null;
  if (startsAt !== null && day && endTime) {
    endsAt = at(day, endTime);
    // An end before the start means after midnight.
    if (endsAt <= startsAt) endsAt += DAY_MS;
  }
  const deadlineAt = deadline ? at(deadline, { hour: 23, minute: 59 }) : null;

  const problems = {
    start: start.trim() !== "" && startTime === null,
    end: end.trim() !== "" && endTime === null,
    capacity:
      capacityNumber !== null &&
      (!Number.isInteger(capacityNumber) || capacityNumber < 1 || capacityNumber > 1000),
    deadline: deadlineAt !== null && startsAt !== null && deadlineAt > startsAt,
  };
  const isPublic = visibility === "public";
  const placeKommune = pickedPlace?.kommuneNr ?? null;
  const valid =
    title.trim().length > 0 &&
    (!isPublic || (category !== null && (placeKommune ?? kommuneNr) !== null)) &&
    startsAt !== null &&
    !Object.values(problems).some(Boolean) &&
    (initial !== null || startsAt > now - 60 * 60 * 1000);

  async function pickCover() {
    try {
      const uri = await pickCoverImage();
      if (uri !== null) setCover({ uri, local: true });
    } catch {
      Alert.alert(t("profile.photoFailed"));
    }
  }

  async function submit() {
    if (!valid || startsAt === null) return;
    setSaving(true);
    try {
      let coverId: Id<"_storage"> | null = initial?.coverId ?? null;
      if (cover === null) coverId = null;
      else if (cover.local) coverId = await upload(cover.uri);
      await onSubmit(
        {
          title: title.trim(),
          startsAt,
          endsAt,
          place: pickedPlace ?? (place.trim() || null),
          description: description.trim() || null,
          coverId,
          capacity: capacityNumber,
          rsvpDeadline: deadlineAt !== null && deadline ? Math.min(deadlineAt, startsAt) : null,
          reminders,
          category: isPublic ? category : null,
          kommuneNr: isPublic && placeKommune === null ? kommuneNr : null,
        },
        visibility,
      );
    } catch (error) {
      Alert.alert(
        convexErrorCode(error) === "RATE_LIMITED" ? t("events.tooMany") : t("events.saveFailed"),
      );
      setSaving(false);
    }
  }

  const input =
    "rounded-xl border border-border bg-surface px-4 py-3.5 font-sans text-[16px] text-text";

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <StackHeader title={screenTitle} />
        <ScrollView
          contentContainerClassName="gap-5 px-5 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            testID="event-cover"
            accessibilityRole="button"
            accessibilityLabel={cover ? t("events.changeCover") : t("events.addCover")}
            onPress={() => void pickCover()}
            className="overflow-hidden rounded-2xl border border-dashed border-border bg-surface active:opacity-80"
            style={{ aspectRatio: 16 / 9 }}
          >
            {cover ? (
              <Image
                source={{ uri: cover.uri }}
                style={{ width: "100%", height: "100%" }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <Text className="font-sans-semibold text-[15px] text-primary">
                  {t("events.addCover")}
                </Text>
              </View>
            )}
          </Pressable>
          {cover ? (
            <Pressable accessibilityRole="button" onPress={() => setCover(null)}>
              <Text className="-mt-3 font-sans-semibold text-[14px] text-textMuted">
                {t("events.removeCover")}
              </Text>
            </Pressable>
          ) : null}

          <Field label={t("events.titleLabel")}>
            <TextInput
              testID="event-title"
              value={title}
              onChangeText={setTitle}
              placeholder={t("events.titlePlaceholder")}
              placeholderTextColor={c.textMuted}
              maxLength={MAX_TITLE_LENGTH}
              autoFocus={initial === null}
              className={`${input} font-sans-semibold text-[17px]`}
            />
          </Field>

          <Field label={t("events.date")}>
            <Pressable
              testID="event-date"
              accessibilityRole="button"
              onPress={() => setPicking("date")}
              className={input}
            >
              <Text className={`font-sans text-[16px] ${day ? "text-text" : "text-textMuted"}`}>
                {day
                  ? formatCompactDateWithWeekday(at(day, { hour: 12, minute: 0 }), locale)
                  : t("events.pickDate")}
              </Text>
            </Pressable>
          </Field>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label={t("events.start")} error={problems.start ? t("events.badTime") : null}>
                <TextInput
                  testID="event-start"
                  value={start}
                  onChangeText={setStart}
                  onBlur={() => startTime && setStart(timeText(startTime))}
                  placeholder="18:00"
                  placeholderTextColor={c.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  className={input}
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label={t("events.end")} error={problems.end ? t("events.badTime") : null}>
                <TextInput
                  testID="event-end"
                  value={end}
                  onChangeText={setEnd}
                  onBlur={() => endTime && setEnd(timeText(endTime))}
                  placeholder={t("events.optional")}
                  placeholderTextColor={c.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  className={input}
                />
              </Field>
            </View>
          </View>

          <Field label={t("events.place")}>
            <PlaceField
              text={place}
              picked={pickedPlace}
              onChange={(text, picked) => {
                setPlace(text);
                setPickedPlace(picked);
              }}
              inputClassName={input}
            />
          </Field>

          {fixedVisibility === undefined ? (
            <Field label={t("events.visibility")}>
              <View accessibilityRole="radiogroup" className="flex-row gap-2">
                {(["hub", "public"] as const).map((v) => (
                  <Pressable
                    key={v}
                    testID={`visibility-${v}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: visibility === v }}
                    onPress={() => setVisibility(v)}
                    className={`flex-1 items-center rounded-full py-3 ${visibility === v ? "bg-primary" : "border border-border bg-surface"} active:opacity-70`}
                  >
                    <Text
                      className={`font-sans-bold text-[15px] ${visibility === v ? "text-bg" : "text-text"}`}
                    >
                      {v === "hub" ? t("events.visibilityHub") : t("events.visibilityPublic")}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text className="font-sans text-[13px] leading-5 text-textMuted">
                {isPublic ? t("events.publicBody") : t("events.hubBody")}
              </Text>
            </Field>
          ) : null}

          {isPublic ? (
            <>
              <Field label={t("events.category")}>
                <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                  {categories.map((k) => (
                    <Pressable
                      key={k}
                      testID={`category-${k}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: category === k }}
                      onPress={() => setCategory(k)}
                      className={`rounded-full px-3.5 py-2 ${category === k ? "bg-primary" : "border border-border bg-surface"} active:opacity-70`}
                    >
                      <Text
                        className={`font-sans-semibold text-[14px] ${category === k ? "text-bg" : "text-text"}`}
                      >
                        {t(`events.categories.${k}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field label={t("events.kommune")}>
                {placeKommune !== null ? (
                  <Text className="font-sans text-[16px] text-text">
                    {kommuneName(placeKommune) ?? placeKommune}
                  </Text>
                ) : (
                  <Pressable
                    testID="event-kommune"
                    accessibilityRole="button"
                    onPress={() => setPickingKommune(true)}
                    className={input}
                  >
                    <Text
                      className={`font-sans text-[16px] ${kommuneNr ? "text-text" : "text-textMuted"}`}
                    >
                      {kommuneName(kommuneNr) ?? t("events.pickKommune")}
                    </Text>
                  </Pressable>
                )}
              </Field>
            </>
          ) : null}

          <Field label={t("events.description")}>
            <TextInput
              testID="event-description"
              value={description}
              onChangeText={setDescription}
              placeholder={t("events.descriptionPlaceholder")}
              placeholderTextColor={c.textMuted}
              maxLength={MAX_DESCRIPTION_LENGTH}
              multiline
              textAlignVertical="top"
              className={`${input} min-h-28`}
            />
          </Field>

          <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
            {t("events.rsvpSettings")}
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label={t("events.deadline")}
                error={problems.deadline ? t("events.deadlineAfterStart") : null}
              >
                <Pressable
                  testID="event-deadline"
                  accessibilityRole="button"
                  onPress={() => setPicking("deadline")}
                  className={input}
                >
                  <Text
                    numberOfLines={1}
                    className={`font-sans text-[16px] ${deadline ? "text-text" : "text-textMuted"}`}
                  >
                    {deadline
                      ? formatCompactDate(at(deadline, { hour: 12, minute: 0 }), locale)
                      : t("events.optional")}
                  </Text>
                </Pressable>
              </Field>
            </View>
            <View className="flex-1">
              <Field
                label={t("events.capacity")}
                error={problems.capacity ? t("events.badCapacity") : null}
              >
                <TextInput
                  testID="event-capacity"
                  value={capacity}
                  onChangeText={setCapacity}
                  placeholder={t("events.optional")}
                  placeholderTextColor={c.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  className={input}
                />
              </Field>
            </View>
          </View>

          <View className="flex-row items-center gap-3">
            <View className="flex-1 gap-0.5">
              <Text className="font-sans-semibold text-[15px] text-text">
                {t("events.reminders")}
              </Text>
              <Text className="font-sans text-[13px] leading-5 text-textMuted">
                {t("events.remindersBody")}
              </Text>
            </View>
            <Switch
              testID="event-reminders"
              accessibilityLabel={t("events.reminders")}
              value={reminders}
              onValueChange={setReminders}
            />
          </View>

          <Pressable
            testID="event-submit"
            accessibilityRole="button"
            disabled={!valid || saving}
            onPress={() => void submit()}
            className="items-center rounded-xl bg-primarySoft px-4 py-4 active:opacity-80 disabled:opacity-50"
          >
            {saving ? (
              <ActivityIndicator />
            ) : (
              <Text className="font-sans-bold text-[17px] text-primaryStrong">{submitLabel}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <KommuneSheet
        visible={pickingKommune}
        selected={kommuneNr}
        onClose={() => setPickingKommune(false)}
        onSelect={(nr) => {
          setKommuneNr(nr);
          setPickingKommune(false);
        }}
      />
      <DayPicker
        key={picking ?? "closed"}
        visible={picking !== null}
        title={picking === "deadline" ? t("events.deadline") : t("events.date")}
        selected={picking === "deadline" ? deadline : day}
        today={today}
        minDay={initial === null ? today : undefined}
        onClear={picking === "deadline" && deadline ? () => setDeadline(null) : undefined}
        onClose={() => setPicking(null)}
        onSelect={(d) => {
          if (picking === "deadline") setDeadline(d);
          else setDay(d);
          setPicking(null);
        }}
      />
    </SafeAreaView>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="font-sans-semibold text-[14px] text-textMuted">{label}</Text>
      {children}
      {error ? <Text className="font-sans text-[13px] text-danger">{error}</Text> : null}
    </View>
  );
}

/** A month calendar in a bottom sheet. */
function DayPicker({
  visible,
  title,
  selected,
  today,
  minDay,
  onClear,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  selected: Day | null;
  today: Day;
  minDay: Day | undefined;
  onClear: (() => void) | undefined;
  onClose: () => void;
  onSelect: (day: Day) => void;
}) {
  const { t } = useTranslation();
  const [month, setMonth] = useState({
    year: (selected ?? today).year,
    month: (selected ?? today).month,
  });
  return (
    <BottomSheet visible={visible} onClose={onClose} className="gap-3">
      <View className="flex-row items-center justify-between px-1">
        <Text className="font-sans-bold text-[17px] text-text">{title}</Text>
        {onClear ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClear();
              onClose();
            }}
          >
            <Text className="font-sans-semibold text-[15px] text-primary">{t("events.clear")}</Text>
          </Pressable>
        ) : null}
      </View>
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        today={today}
        {...(minDay !== undefined && { minDay })}
        onSelect={onSelect}
      />
    </BottomSheet>
  );
}
