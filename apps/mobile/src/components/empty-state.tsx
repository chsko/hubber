import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { LogoMark } from "@/components/logo";

/** Empty state with the ring as illustration: you, waiting for your people. */
export function RingEmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <View className="items-center gap-3 px-2 py-6">
      <LogoMark size={112} tone="waiting" />
      <Text className="text-center font-sans-extrabold text-[22px] text-text">{title}</Text>
      <Text className="max-w-[320px] text-center font-sans text-[15px] leading-6 text-textMuted">
        {body}
      </Text>
      {children ? <View className="mt-2 w-full gap-1">{children}</View> : null}
    </View>
  );
}
