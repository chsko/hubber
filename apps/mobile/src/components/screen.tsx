import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = { title: string; subtitle?: string; header?: ReactNode; children?: ReactNode };

/** Standard tab screen: safe area, scrollable body and a large title, with an optional row above it. */
export function Screen({ title, subtitle, header, children }: Props) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="gap-6 px-5 pb-10 pt-4">
        <View className="gap-1">
          {header}
          {subtitle ? <Text className="font-sans text-sm text-textMuted">{subtitle}</Text> : null}
          <Text accessibilityRole="header" className="font-sans-extrabold text-[28px] text-text">
            {title}
          </Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Placeholder card for features that arrive in later milestones. */
export function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-dashed border-border bg-surface p-4">
      <Text className="font-sans text-[15px] leading-6 text-textMuted">{children}</Text>
    </View>
  );
}
