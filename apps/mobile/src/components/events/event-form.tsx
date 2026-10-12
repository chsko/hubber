import type { Id } from "@hubber/backend/dataModel";
import { formatLongDate, osloDateParts, osloTimeParts, osloToEpoch } from "@hubber/i18n";
import { colors } from "@hubber/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StackHeader } from "@/components/stack-header";
import { useLocale } from "@/lib/i18n";
import { pickCoverImage, useUploadImage } from "@/lib/image-upload";
import { useScheme } from "@/lib/use-scheme";
import { type Day, MonthCalendar } from "./month-calendar";

/** Kept in step with packages/backend/convex/events.ts. */
const MAX_TITLE_LENGTH = 120;
const MAX_PLACE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 4000;

export type EventInput = {
  title: string;
  startsAt: number;
  endsAt: number | null;
  place: string | null;
  description: string | null;
  coverId: Id<"_storage"> | null;
  capacity: number | null;
  rsvpDeadline: number | null;
};

/** What an existing event starts the form with. */
export type EventInitial = EventInput & { coverUrl: string | null };

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

/** Create or edit an event (HUB-23). Dates and times are Norwegian time, 24-hour clock. */
export function EventForm({
  title: screenTitle,
  submitLabel,
  initial,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial: EventInitial | null;
  onSubmit: (input: EventInput) => Promise<void>;
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
  const [description, setDescription] = useState(initial?.description ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [deadline, setDeadline] = useState<Day | null>(
    initial?.rsvpDeadline ? osloDateParts(initial.rsvpDeadline) : null,
  );
  const [cover, setCover] = useState<{ uri: string; local: boolean } | null>(
    initial?.coverUrl ? { uri: initial.coverUrl, local: false } : null,
  );
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
  const valid =
    title.trim().length > 0 &&
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
      await onSubmit({
        title: title.trim(),
        startsAt,
        endsAt,
        place: place.trim() || null,
        description: description.trim() || null,
        coverId,
        capacity: capacityNumber,
        rsvpDeadline: deadlineAt !== null && deadline ? Math.min(deadlineAt, startsAt) : null,
      });
    } catch {
      Alert.alert(t("events.saveFailed"));
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
                  ? formatLongDate(at(day, { hour: 12, minute: 0 }), locale)
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
            <TextInput
              testID="event-place"
              value={place}
              onChangeText={setPlace}
              placeholder={t("events.placePlaceholder")}
              placeholderTextColor={c.textMuted}
              maxLength={MAX_PLACE_LENGTH}
              className={input}
            />
          </Field>

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
                      ? `${pad(deadline.day)}.${pad(deadline.month)}.`
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t("common.cancel")}
        onPress={onClose}
        className="flex-1 justify-end bg-black/40"
      >
        <Pressable onPress={() => undefined}>
          <SafeAreaView edges={["bottom"]} className="gap-3 rounded-t-3xl bg-surface px-4 pt-5">
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
                  <Text className="font-sans-semibold text-[15px] text-primary">
                    {t("events.clear")}
                  </Text>
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
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
