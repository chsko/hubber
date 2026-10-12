import { api } from "@hubber/backend/api";
import { colors } from "@hubber/shared";
import { useMutation } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HubIcon } from "@/components/hub-icon";
import { StackHeader } from "@/components/stack-header";
import { pickSquareImage, useUploadImage } from "@/lib/image-upload";
import { useScheme } from "@/lib/use-scheme";

type Template = "class" | "kindergarten" | "family" | "friends" | "other";

/** Kept in step with HUB_TEMPLATES in packages/backend/convex/lib/hubTemplates.ts. */
const templates: { id: Template; emoji: string }[] = [
  { id: "class", emoji: "🎒" },
  { id: "kindergarten", emoji: "🧸" },
  { id: "family", emoji: "🏡" },
  { id: "friends", emoji: "🎉" },
  { id: "other", emoji: "💬" },
];

const emojiChoices = ["🎒", "🧸", "🏡", "🎉", "💬", "⚽", "🎵", "🏕️", "🍕", "📚", "🐶", "❤️"];

const MAX_NAME_LENGTH = 60;

/** Create hub (HUB-14): pick a template, then name and icon. */
export default function NewHub() {
  const { t } = useTranslation();
  const c = colors[useScheme()];
  const createHub = useMutation(api.hubs.create);
  const upload = useUploadImage();
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pickPhoto() {
    try {
      const uri = await pickSquareImage();
      if (uri !== null) setPhotoUri(uri);
    } catch {
      Alert.alert(t("profile.photoFailed"));
    }
  }

  async function create() {
    if (template === null) return;
    setSaving(true);
    try {
      const hubId = await createHub({
        name,
        template,
        ...(emoji !== null && { emoji }),
        ...(photoUri !== null && { iconId: await upload(photoUri) }),
      });
      router.replace({ pathname: "/hub/[hubId]", params: { hubId } });
    } catch {
      Alert.alert(t("newHub.failed"));
      setSaving(false);
    }
  }

  if (template === null) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <StackHeader />
        <ScrollView contentContainerClassName="gap-4 px-5 pb-10">
          <Text accessibilityRole="header" className="font-sans-extrabold text-[28px] text-text">
            {t("newHub.pickTemplate")}
          </Text>
          {templates.map((tpl) => (
            <Pressable
              key={tpl.id}
              testID={`template-${tpl.id}`}
              accessibilityRole="button"
              onPress={() => {
                setTemplate(tpl.id);
                setEmoji(null);
              }}
              className="flex-row items-center gap-4 rounded-2xl border border-border bg-surface p-4 active:opacity-70"
            >
              <HubIcon emoji={tpl.emoji} iconUrl={null} size={48} />
              <View className="flex-1 gap-0.5">
                <Text className="font-sans-bold text-[17px] text-text">
                  {t(`hubTemplates.${tpl.id}.name`)}
                </Text>
                <Text className="font-sans text-[14px] leading-5 text-textMuted">
                  {t(`hubTemplates.${tpl.id}.description`)}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const templateEmoji = templates.find((tpl) => tpl.id === template)?.emoji ?? "💬";
  const shownEmoji = emoji ?? templateEmoji;
  const canCreate = name.trim().length > 0 && !saving;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <StackHeader />
        <ScrollView
          contentContainerClassName="gap-6 px-5 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-1">
            <Text accessibilityRole="header" className="font-sans-extrabold text-[28px] text-text">
              {t("newHub.nameTitle")}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setTemplate(null)}>
              <Text className="font-sans text-[15px] text-textMuted">
                {t(`hubTemplates.${template}.name`)} ·{" "}
                <Text className="font-sans-semibold text-primary">
                  {t("newHub.changeTemplate")}
                </Text>
              </Text>
            </Pressable>
          </View>

          <View className="items-center gap-3">
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: 88, height: 88, borderRadius: 22 }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <HubIcon emoji={shownEmoji} iconUrl={null} size={88} />
            )}
          </View>

          <TextInput
            testID="hub-name"
            value={name}
            onChangeText={setName}
            placeholder={t(`hubTemplates.${template}.namePlaceholder`)}
            placeholderTextColor={c.textMuted}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            returnKeyType="done"
            accessibilityLabel={t("newHub.nameLabel")}
            className="rounded-xl border border-border bg-surface px-4 py-3.5 font-sans-semibold text-[17px] text-text"
          />

          <View className="gap-3">
            <Text className="font-sans-semibold text-xs uppercase tracking-widest text-textMuted">
              {t("newHub.icon")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {emojiChoices.map((e) => {
                const selected = photoUri === null && e === shownEmoji;
                return (
                  <Pressable
                    key={e}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      setEmoji(e);
                      setPhotoUri(null);
                    }}
                    className={`h-12 w-12 items-center justify-center rounded-xl border ${selected ? "border-primary bg-primarySoft" : "border-border bg-surface"}`}
                  >
                    <Text className="text-[24px]">{e}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable accessibilityRole="button" onPress={() => void pickPhoto()}>
              <Text className="font-sans-semibold text-[15px] text-primary">
                {photoUri ? t("newHub.changePhoto") : t("newHub.usePhoto")}
              </Text>
            </Pressable>
          </View>

          <Pressable
            testID="create-hub-submit"
            accessibilityRole="button"
            disabled={!canCreate}
            onPress={() => void create()}
            className="items-center rounded-xl bg-primarySoft px-4 py-4 active:opacity-80 disabled:opacity-50"
          >
            {saving ? (
              <ActivityIndicator />
            ) : (
              <Text className="font-sans-bold text-[17px] text-primaryStrong">
                {t("newHub.create")}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
