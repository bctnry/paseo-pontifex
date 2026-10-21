import Svg, { Path } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";

interface PaseoLogoProps {
  size?: number;
  color?: string;
}

export function PaseoLogo({ size = 64, color }: PaseoLogoProps) {
  const { theme } = useUnistyles();
  const fill = color ?? theme.colors.foreground;

  return (
    <Svg width={size} height={size} viewBox="0 0 291.45 312.27" fill="none">
      <Path
        d="m229 0a62.454 62.454 0 0 1 62.453 62.453v83.271h-41.635v-83.271a20.818 20.818 0 0 0-20.818-20.818 20.818 20.818 0 0 0-20.818 20.818h-41.635a62.454 62.454 0 0 1 62.453-62.453zm-20.818 62.455 2e-3 249.81h-83.271l-41.637-41.635v-83.271l-83.271-83.271v-41.635zm-41.635 41.635h-83.271v24.391l17.244 17.244h41.637v41.637h-17.244v66.025l17.244 17.246h24.391z"
        fill={fill}
      />
    </Svg>
  );
}
