import { colors } from "@hubber/shared";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useScheme } from "@/lib/use-scheme";

/** Five people around the amber centre. */
const ring = [
  [512, 244],
  [766.9, 429.2],
  [669.5, 728.8],
  [354.5, 728.8],
  [257.1, 429.2],
] as const;

/**
 * - `brand`: green people, amber hub (the logo).
 * - `onPrimary`: one colour, for watermarks on primary surfaces.
 * - `waiting`: only the first person filled in, for empty states.
 */
type Tone = "brand" | "onPrimary" | "waiting";

/** The Hubbr mark: a ring of people around a hub. Source: assets/brand/hubbr-mark.svg. */
export function LogoMark({ size = 56, tone = "brand" }: { size?: number; tone?: Tone }) {
  const c = colors[useScheme()];
  const centre = tone === "onPrimary" ? c.bg : c.accent;
  const person = (i: number) =>
    tone === "onPrimary" ? c.bg : tone === "waiting" && i > 0 ? c.border : c.primary;
  return (
    <Svg width={size} height={size} viewBox="152 152 720 720" accessibilityElementsHidden>
      <Circle cx={512} cy={512} r={118} fill={centre} />
      {ring.map(([cx, cy], i) => (
        <Circle key={`${cx},${cy}`} cx={cx} cy={cy} r={82} fill={person(i)} />
      ))}
    </Svg>
  );
}

/** Mark plus the name, for the top of Home. */
export function Wordmark() {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-2">
      <LogoMark size={26} />
      <Text className="font-sans-extrabold text-[20px] tracking-tight text-primary">
        {t("common.appName")}
      </Text>
    </View>
  );
}
