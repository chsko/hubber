import { api } from "@hubber/backend/api";
import { useQuery } from "convex/react";
import { ActivityIndicator, Text, View } from "react-native";
import { ComingSoon, Screen } from "@/components/screen";

export default function ProfileScreen() {
  // Live query against Convex: proves the client is wired up.
  const me = useQuery(api.users.me);

  return (
    <Screen title="Profil">
      <View className="gap-1 rounded-2xl border border-border bg-surface p-4">
        <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
          Konto
        </Text>
        {me === undefined ? (
          <ActivityIndicator accessibilityLabel="Laster" />
        ) : (
          <Text testID="profile-status" className="font-sans-bold text-[17px] text-text">
            {me === null ? "Ikke logget inn" : (me.name ?? "Uten navn")}
          </Text>
        )}
      </View>
      <ComingSoon>Innlogging med Vipps kommer i M1.</ComingSoon>
    </Screen>
  );
}
