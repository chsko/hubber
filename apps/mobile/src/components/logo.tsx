import { colors } from "@hubber/shared";
import Svg, { Circle, Path } from "react-native-svg";
import { useScheme } from "@/lib/use-scheme";

/** The Hubbr mark: a lowercase h with the amber dot. Source: assets/brand/hubbr-mark.svg. */
export function LogoMark({ size = 56 }: { size?: number }) {
  const c = colors[useScheme()];
  return (
    <Svg width={size} height={size} viewBox="182 182 660 660" accessibilityElementsHidden>
      <Path
        d="M352 254V778M352 604C352 490 424 434 512 434C600 434 652 490 652 584V778"
        fill="none"
        stroke={c.primary}
        strokeWidth={128}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={652} cy={266} r={84} fill={c.accent} />
    </Svg>
  );
}
