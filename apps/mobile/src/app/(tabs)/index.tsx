import { api } from "@hubber/backend/api";
import { timeZone } from "@hubber/i18n";
import { useQuery } from "convex/react";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { HubIcon } from "@/components/hub-icon";
import { EventRow } from "@/components/events/event-ui";
import { Screen } from "@/components/screen";
import { UnreadBadge } from "@/components/unread-badge";

const osloHour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" });

function greetingKey(now: number) {
  const hour = Number(osloHour.format(now));
  if (hour >= 5 && hour < 10) return "home.goodMorning";
  if (hour >= 10 && hour < 17) return "home.goodDay";
  if (hour >= 17 && hour < 23) return "home.goodEvening";
  return "home.goodNight";
}

/**
 * Home (docs/DESIGN.md §4): next events (M4), hubs with unread messages and
 * requests waiting for approval. No feed.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const me = useQuery(api.users.me);
  const hubs = useQuery(api.hubs.mine);
  const next = useQuery(api.events.mine, { limit: 3 });
  const firstName = me?.name?.split(" ")[0] ?? "";
  const unread = hubs?.filter((h) => h.status === "active" && h.unread > 0) ?? [];
  const waiting = hubs?.filter((h) => h.status === "pending") ?? [];

  return (
    <Screen title={t(greetingKey(Date.now()), { name: firstName })} subtitle={t("common.appName")}>
      <Section title={t("home.nextUp")}>
        {next === undefined ? (
          <ActivityIndicator />
        ) : next.length === 0 ? (
          <Text className="font-sans text-[15px] leading-6 text-textMuted">
            {t("home.noEvents")}
          </Text>
        ) : (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {next.map((e, i) => (
              <EventRow key={e._id} event={e} subtitle={e.hubName} first={i === 0} />
            ))}
          </View>
        )}
      </Section>

      <Section title={t("home.unread")}>
        {hubs === undefined ? (
          <ActivityIndicator />
        ) : unread.length === 0 ? (
          <Text className="font-sans text-[15px] text-textMuted">{t("home.allRead")}</Text>
        ) : (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {unread.map((hub, i) => (
              <Link
                key={hub._id}
                href={{ pathname: "/hub/[hubId]", params: { hubId: hub._id } }}
                asChild
              >
                <Pressable
                  accessibilityRole="button"
                  className={`flex-row items-center gap-3 px-4 py-3 active:opacity-70 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <HubIcon emoji={hub.emoji} iconUrl={hub.iconUrl} size={36} />
                  <Text
                    numberOfLines={1}
                    className="flex-1 font-sans-semibold text-[16px] text-text"
                  >
                    {hub.name}
                  </Text>
                  <UnreadBadge count={hub.unread} />
                </Pressable>
              </Link>
            ))}
          </View>
        )}
      </Section>

      {waiting.length > 0 ? (
        <Section title={t("home.waiting")}>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {waiting.map((hub, i) => (
              <View
                key={hub._id}
                className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <HubIcon emoji={hub.emoji} iconUrl={hub.iconUrl} size={36} />
                <Text numberOfLines={1} className="flex-1 font-sans-semibold text-[16px] text-text">
                  {hub.name}
                </Text>
                <Text className="font-sans text-[13px] text-textMuted">
                  {t("hubs.waitingForApproval")}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
        {title}
      </Text>
      {children}
    </View>
  );
}
