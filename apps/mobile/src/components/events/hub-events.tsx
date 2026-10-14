import { api } from "@hubbr/backend/api";
import type { Id } from "@hubbr/backend/dataModel";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { EventRow } from "./event-ui";

/** The hub's Events segment (HUB-23): a "New event" button, then upcoming and past. */
export function HubEvents({ hubId }: { hubId: Id<"hubs"> }) {
  const { t } = useTranslation();
  const events = useQuery(api.events.forHub, { hubId });
  return (
    <View className="gap-5">
      <Pressable
        testID="new-event"
        accessibilityRole="button"
        onPress={() => router.push({ pathname: "/event/new", params: { hubId } })}
        className="items-center rounded-xl bg-primarySoft px-4 py-3.5 active:opacity-80"
      >
        <Text className="font-sans-bold text-[16px] text-primaryStrong">{t("events.new")}</Text>
      </Pressable>
      {events === undefined ? (
        <ActivityIndicator />
      ) : events.upcoming.length === 0 && events.past.length === 0 ? (
        <Text className="font-sans text-[15px] leading-6 text-textMuted">{t("events.none")}</Text>
      ) : (
        <>
          <List title={t("events.upcoming")} events={events.upcoming} />
          <List title={t("events.past")} events={events.past} />
        </>
      )}
    </View>
  );
}

function List({
  title,
  events,
}: {
  title: string;
  events: Parameters<typeof EventRow>[0]["event"][];
}) {
  if (events.length === 0) return null;
  return (
    <View className="gap-2">
      <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
        {title}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {events.map((e, i) => (
          <EventRow key={e._id} event={e} first={i === 0} />
        ))}
      </View>
    </View>
  );
}
