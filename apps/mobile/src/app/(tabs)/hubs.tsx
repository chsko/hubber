import { api } from "@hubbr/backend/api";
import { colors } from "@hubbr/shared";
import { useQuery } from "convex/react";
import { Link } from "expo-router";
import { ChevronRight, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { RingEmptyState } from "@/components/empty-state";
import { HubIcon } from "@/components/hub-icon";
import { UnreadBadge } from "@/components/unread-badge";
import { Screen } from "@/components/screen";
import { useScheme } from "@/lib/use-scheme";

/** Your hubs, most recently active first, plus "Create hub" (HUB-14). */
export default function HubsScreen() {
  const { t } = useTranslation();
  const hubs = useQuery(api.hubs.mine);
  const c = colors[useScheme()];

  return (
    <Screen title={t("tabs.hubs")}>
      {hubs === undefined ? (
        <ActivityIndicator accessibilityLabel={t("common.loading")} />
      ) : hubs.length === 0 ? (
        <RingEmptyState title={t("hubs.emptyTitle")} body={t("hubs.emptyBody")}>
          <Link href="/hub/new" asChild>
            <Pressable
              testID="create-hub"
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 active:opacity-80"
            >
              <Plus color={c.bg} size={20} strokeWidth={2.4} />
              <Text className="font-sans-bold text-[16px] text-bg">{t("hubs.create")}</Text>
            </Pressable>
          </Link>
          <Link href="/hub/join" asChild>
            <Pressable
              testID="join-with-code"
              accessibilityRole="button"
              className="items-center py-3 active:opacity-70"
            >
              <Text className="font-sans-semibold text-[15px] text-primary">
                {t("hubs.joinWithCode")}
              </Text>
            </Pressable>
          </Link>
        </RingEmptyState>
      ) : (
        <>
          <Link href="/hub/new" asChild>
            <Pressable
              testID="create-hub"
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-2 rounded-xl bg-primarySoft px-4 py-3.5 active:opacity-80"
            >
              <Plus color={c.primaryStrong} size={20} strokeWidth={2.4} />
              <Text className="font-sans-bold text-[16px] text-primaryStrong">
                {t("hubs.create")}
              </Text>
            </Pressable>
          </Link>
          <Link href="/hub/join" asChild>
            <Pressable
              testID="join-with-code"
              accessibilityRole="button"
              className="-mt-3 items-center py-2"
            >
              <Text className="font-sans-semibold text-[15px] text-primary">
                {t("hubs.joinWithCode")}
              </Text>
            </Pressable>
          </Link>

          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {hubs.map((hub, i) => {
              const row = (
                <Pressable
                  testID={`hub-${hub._id}`}
                  accessibilityRole="button"
                  disabled={hub.status === "pending"}
                  className={`flex-row items-center gap-3 px-4 py-3 active:opacity-70 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <HubIcon emoji={hub.emoji} iconUrl={hub.iconUrl} size={44} />
                  <View className={`flex-1 ${hub.status === "pending" ? "opacity-60" : ""}`}>
                    <Text numberOfLines={1} className="font-sans-semibold text-[16px] text-text">
                      {hub.name}
                    </Text>
                    <Text className="font-sans text-[13px] text-textMuted">
                      {hub.status === "pending"
                        ? t("hubs.waitingForApproval")
                        : t("hubs.memberCount", { count: hub.memberCount })}
                    </Text>
                  </View>
                  {hub.unread > 0 ? <UnreadBadge count={hub.unread} /> : null}
                  {hub.status === "active" ? <ChevronRight color={c.textMuted} size={20} /> : null}
                </Pressable>
              );
              return hub.status === "pending" ? (
                <View key={hub._id}>{row}</View>
              ) : (
                <Link
                  key={hub._id}
                  href={{ pathname: "/hub/[hubId]", params: { hubId: hub._id } }}
                  asChild
                >
                  {row}
                </Link>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
