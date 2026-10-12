import { api } from "@hubber/backend/api";
import type { Id } from "@hubber/backend/dataModel";
import { colors } from "@hubber/shared";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { StackHeader } from "@/components/stack-header";
import { formatCode, inviteUrl } from "@/lib/invite-link";
import { formatDate } from "@hubber/i18n";
import { useLocale } from "@/lib/i18n";
import { useScheme } from "@/lib/use-scheme";

type Invite = { code: string; expiresAt: number | null };
const expiryChoices = [1, 7, 30, null] as const;

/**
 * Invite sheet (HUB-15): share the link, show a QR code, or open the SMS
 * composer with a prefilled text. Contacts are never read or uploaded.
 * Admins can require approval, make a new link with another expiry, or
 * stop all links.
 */
export default function InviteScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const c = colors[useScheme()];
  const { hubId } = useLocalSearchParams<{ hubId: Id<"hubs"> }>();
  const hub = useQuery(api.hubs.get, { hubId });
  const getCurrent = useMutation(api.invites.current);
  const renew = useMutation(api.invites.renew);
  const revokeAll = useMutation(api.invites.revokeAll);
  const setJoinApproval = useMutation(api.hubs.setJoinApproval);
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);

  useEffect(() => {
    void getCurrent({ hubId }).then(setInvite);
  }, [getCurrent, hubId]);

  if (hub === undefined || invite === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const isAdmin = hub.myRole !== "member";
  const message = invite
    ? t("invite.message", {
        name: hub.name,
        url: inviteUrl(invite.code),
        code: formatCode(invite.code),
      })
    : "";

  function sendSms() {
    const separator = Platform.OS === "ios" ? "&" : "?";
    void Linking.openURL(`sms:${separator}body=${encodeURIComponent(message)}`);
  }

  function chooseExpiry() {
    Alert.alert(t("invite.newLinkTitle"), t("invite.newLinkBody"), [
      ...expiryChoices.map((days) => ({
        text: days === null ? t("invite.never") : t("invite.days", { count: days }),
        onPress: () => void renew({ hubId, expiresInDays: days }).then(setInvite),
      })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }

  function stopLinks() {
    Alert.alert(t("invite.stopTitle"), t("invite.stopBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("invite.stop"),
        style: "destructive",
        onPress: () => void revokeAll({ hubId }).then(() => setInvite(null)),
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StackHeader title={t("invite.title", { name: hub.name })} />
      <ScrollView contentContainerClassName="gap-5 px-5 pb-10">
        {invite ? (
          <>
            <View className="items-center gap-3 rounded-2xl border border-border bg-surface p-5">
              <View className="rounded-xl bg-white p-3">
                <QRCode
                  value={inviteUrl(invite.code)}
                  size={200}
                  color="#1D2321"
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text selectable className="font-sans-bold text-[22px] tracking-widest text-text">
                {formatCode(invite.code)}
              </Text>
              <Text className="text-center font-sans text-[13px] text-textMuted">
                {invite.expiresAt
                  ? t("invite.expires", { date: formatDate(invite.expiresAt, locale) })
                  : t("invite.noExpiry")}
                {hub.joinApproval ? ` · ${t("invite.approvalOn")}` : ""}
              </Text>
            </View>

            <View className="gap-3">
              <ActionButton
                testID="invite-share"
                label={t("invite.share")}
                onPress={() => void Share.share({ message })}
              />
              <ActionButton testID="invite-sms" label={t("invite.sms")} onPress={sendSms} />
              <Text className="text-center font-sans text-[12px] leading-5 text-textMuted">
                {t("invite.privacy")}
              </Text>
            </View>
          </>
        ) : (
          <View className="gap-3 rounded-2xl border border-dashed border-border bg-surface p-5">
            <Text className="font-sans text-[15px] leading-6 text-textMuted">
              {t("invite.none")}
            </Text>
            <ActionButton
              label={t("invite.create")}
              onPress={() => void getCurrent({ hubId }).then(setInvite)}
            />
          </View>
        )}

        {isAdmin ? (
          <View className="rounded-2xl border border-border bg-surface">
            <Text className="px-4 pt-4 font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
              {t("invite.adminSettings")}
            </Text>
            <View className="flex-row items-center gap-3 px-4 py-3">
              <View className="flex-1">
                <Text className="font-sans-medium text-[15px] text-text">
                  {t("invite.requireApproval")}
                </Text>
                <Text className="font-sans text-[13px] leading-5 text-textMuted">
                  {t("invite.requireApprovalHint")}
                </Text>
              </View>
              <Switch
                testID="require-approval"
                value={hub.joinApproval}
                onValueChange={(joinApproval) => void setJoinApproval({ hubId, joinApproval })}
                trackColor={{ true: c.primary, false: c.border }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={chooseExpiry}
              className="border-t border-border px-4 py-3 active:opacity-60"
            >
              <Text className="font-sans-semibold text-[15px] text-primary">
                {t("invite.newLink")}
              </Text>
            </Pressable>
            {invite ? (
              <Pressable
                accessibilityRole="button"
                onPress={stopLinks}
                className="border-t border-border px-4 py-3 active:opacity-60"
              >
                <Text className="font-sans-semibold text-[15px] text-danger">
                  {t("invite.stopTitle")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton(props: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      onPress={props.onPress}
      className="items-center rounded-xl bg-primarySoft px-4 py-3.5 active:opacity-80"
    >
      <Text className="font-sans-bold text-[16px] text-primaryStrong">{props.label}</Text>
    </Pressable>
  );
}
