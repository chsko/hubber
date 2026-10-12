import { Image, Text, View } from "react-native";

type Props = { emoji: string; iconUrl: string | null; size?: number };

/** A hub's icon: its photo, or its emoji on a soft tile. */
export function HubIcon({ emoji, iconUrl, size = 48 }: Props) {
  const style = { width: size, height: size, borderRadius: size * 0.25 };
  if (iconUrl) {
    return <Image source={{ uri: iconUrl }} style={style} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={style} className="items-center justify-center bg-accentSoft">
      <Text style={{ fontSize: size * 0.5 }} accessibilityElementsHidden>
        {emoji}
      </Text>
    </View>
  );
}
