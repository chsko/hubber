import { colors } from "@hubber/shared";
import { MapPin } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import { type PickedPlace, searchAddresses } from "@/lib/geonorge";
import { useScheme } from "@/lib/use-scheme";

const MAX_PLACE_LENGTH = 200;
const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;

/**
 * Place: free text ("Hjemme hos Kari"), with address suggestions from
 * Geonorge while typing (HUB-28). Picking one keeps its coordinates.
 */
export function PlaceField({
  text,
  picked,
  onChange,
  inputClassName,
}: {
  text: string;
  picked: PickedPlace | null;
  onChange: (text: string, picked: PickedPlace | null) => void;
  inputClassName: string;
}) {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<PickedPlace[]>([]);
  const query = text.trim();

  useEffect(() => {
    if (!focused || picked !== null || query.length < MIN_QUERY) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchAddresses(query, controller.signal)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, focused, picked]);

  return (
    <View className="gap-1.5">
      <TextInput
        testID="event-place"
        value={text}
        onChangeText={(value) => onChange(value, null)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={t("events.placePlaceholder")}
        placeholderTextColor={c.textMuted}
        maxLength={MAX_PLACE_LENGTH}
        className={inputClassName}
      />
      {picked ? (
        <View className="flex-row items-center gap-1.5 px-1">
          <MapPin color={c.primary} size={14} strokeWidth={2.2} />
          <Text className="font-sans text-[13px] text-textMuted">{t("events.placeOnMap")}</Text>
        </View>
      ) : null}
      {suggestions.length > 0 ? (
        <View
          accessibilityRole="list"
          className="overflow-hidden rounded-xl border border-border bg-surface"
        >
          {suggestions.map((s, i) => (
            <Pressable
              key={`${s.text}-${i}`}
              testID={`place-suggestion-${i}`}
              accessibilityRole="button"
              onPress={() => {
                onChange(s.text, s);
                setSuggestions([]);
              }}
              className={`flex-row items-center gap-2.5 px-3.5 py-3 active:opacity-60 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <MapPin color={c.textMuted} size={16} strokeWidth={2} />
              <Text numberOfLines={1} className="flex-1 font-sans text-[15px] text-text">
                {s.text}
              </Text>
            </Pressable>
          ))}
          <Text className="px-3.5 pb-2 pt-1 font-sans text-[11px] text-textMuted">
            {t("events.addressSource")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
