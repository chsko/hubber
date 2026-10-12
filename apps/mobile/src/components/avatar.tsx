import { Image, Text, View } from "react-native";

type Props = { name: string | null; photoUrl: string | null; size?: number };

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** Round profile photo, or the person's initials when they have none. */
export function Avatar({ name, photoUrl, size = 48 }: Props) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={style} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={style} className="items-center justify-center bg-primarySoft">
      <Text
        style={{ fontSize: size * 0.38 }}
        className="font-sans-bold text-primaryStrong"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {initials(name)}
      </Text>
    </View>
  );
}
