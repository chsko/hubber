import { colors } from "@hubber/shared";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StackHeader } from "@/components/stack-header";
import { parseInviteInput } from "@/lib/invite-link";
import { useScheme } from "@/lib/use-scheme";

/** Paste an invite link or type a code (until universal links open the app directly). */
export default function JoinWithCode() {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const [input, setInput] = useState("");
  const code = parseInviteInput(input);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StackHeader />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10" keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" className="font-sans-extrabold text-[28px] text-text">
          {t("join.withCodeTitle")}
        </Text>
        <Text className="font-sans text-[15px] leading-6 text-textMuted">
          {t("join.withCodeBody")}
        </Text>
        <TextInput
          testID="invite-code"
          value={input}
          onChangeText={setInput}
          placeholder="ABCDE-FGH23"
          placeholderTextColor={c.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          accessibilityLabel={t("join.codeLabel")}
          className="rounded-xl border border-border bg-surface px-4 py-3.5 font-sans-semibold text-[17px] text-text"
        />
        <Pressable
          testID="invite-code-continue"
          accessibilityRole="button"
          disabled={code === null}
          onPress={() => code && router.replace({ pathname: "/i/[code]", params: { code } })}
          className="items-center rounded-xl bg-primarySoft px-4 py-4 active:opacity-80 disabled:opacity-50"
        >
          <Text className="font-sans-bold text-[17px] text-primaryStrong">
            {t("join.continue")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
