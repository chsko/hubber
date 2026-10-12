import { colors } from "@hubber/shared";
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

/** The Hubbr mark: a ring of people around a hub. Source: assets/brand/hubbr-mark.svg. */
export function LogoMark({ size = 56 }: { size?: number }) {
  const c = colors[useScheme()];
  return (
    <Svg width={size} height={size} viewBox="152 152 720 720" accessibilityElementsHidden>
      <Circle cx={512} cy={512} r={118} fill={c.accent} />
      {ring.map(([cx, cy]) => (
        <Circle key={`${cx},${cy}`} cx={cx} cy={cy} r={82} fill={c.primary} />
      ))}
    </Svg>
  );
}
