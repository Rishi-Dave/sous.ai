import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';

interface Props {
  size?: number;
}

export function EmptyIllustration({ size = 96 }: Props) {
  const height = size * 0.75;
  return (
    <Svg width={size} height={height} viewBox="0 0 96 72" fill="none">
      <Path
        d="M6 30 C6 52, 22 66, 48 66 C74 66, 90 52, 90 30"
        stroke={colors.borderGrey}
        strokeWidth={1.25}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M2 30 L94 30"
        stroke={colors.borderGrey}
        strokeWidth={1.25}
        strokeLinecap="round"
      />
      <Path
        d="M36 14 C36 10, 38 6, 42 4"
        stroke={colors.mutedGreen}
        strokeWidth={1}
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
      <Path
        d="M48 16 C48 10, 52 4, 56 2"
        stroke={colors.mutedGreen}
        strokeWidth={1}
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
      <Path
        d="M60 14 C60 10, 62 6, 66 4"
        stroke={colors.mutedGreen}
        strokeWidth={1}
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
    </Svg>
  );
}
