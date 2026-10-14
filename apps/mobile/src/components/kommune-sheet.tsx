import { colors, kommuner } from "@hubbr/shared";
import { Check, Search } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { useScheme } from "@/lib/use-scheme";

const fold = (text: string) =>
  text.toLocaleLowerCase("nb").normalize("NFKD").replace(/\p{M}/gu, "");

/**
 * Pick one of Norway's kommuner by typing its name (HUB-29/30). With
 * `allowAll`, the first row is "All of Norway" and picks null.
 */
export function KommuneSheet({
  visible,
  selected,
  allowAll = false,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selected: string | null;
  allowAll?: boolean;
  onClose: () => void;
  onSelect: (kommuneNr: string | null) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} className="gap-3">
      {visible ? <KommuneList selected={selected} allowAll={allowAll} onSelect={onSelect} /> : null}
    </BottomSheet>
  );
}

function KommuneList({
  selected,
  allowAll,
  onSelect,
}: {
  selected: string | null;
  allowAll: boolean;
  onSelect: (kommuneNr: string | null) => void;
}) {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const matches = kommuner
    .filter((k) => q === "" || fold(k.name).includes(q) || (k.alt && fold(k.alt).includes(q)))
    .sort((a, b) => {
      // Names that start with what's typed come first.
      const rank = (name: string) => (q !== "" && fold(name).startsWith(q) ? 0 : 1);
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "nb");
    });
  const rows: { nr: string | null; name: string }[] = [
    ...(allowAll && q === "" ? [{ nr: null, name: t("discover.allNorway") }] : []),
    ...matches,
  ];

  return (
    <>
      <View className="flex-row items-center gap-2 rounded-xl border border-border bg-bg px-3.5">
        <Search color={c.textMuted} size={18} />
        <TextInput
          testID="kommune-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t("discover.searchKommune")}
          placeholderTextColor={c.textMuted}
          autoCorrect={false}
          autoFocus
          className="flex-1 py-3 font-sans text-[16px] text-text"
        />
      </View>
      <FlatList
        style={{ height: 360 }}
        data={rows}
        keyExtractor={(k) => k.nr ?? "all"}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text className="px-1 py-4 font-sans text-[15px] text-textMuted">
            {t("discover.noKommune")}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`kommune-${item.nr ?? "all"}`}
            accessibilityRole="button"
            accessibilityState={{ selected: item.nr === selected }}
            onPress={() => onSelect(item.nr)}
            className="flex-row items-center justify-between rounded-xl px-1 py-3 active:bg-bg"
          >
            <Text className="font-sans-semibold text-[16px] text-text">{item.name}</Text>
            {item.nr === selected ? <Check color={c.primary} size={20} strokeWidth={2.4} /> : null}
          </Pressable>
        )}
      />
    </>
  );
}
