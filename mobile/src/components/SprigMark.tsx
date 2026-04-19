import Svg, { Path } from 'react-native-svg';
import { colors, type ColorToken } from '../theme/colors';

interface Props {
  size?: number;
  color?: ColorToken;
}

export function SprigMark({ size = 32, color = 'deepGreen' }: Props) {
  const stroke = colors[color];
  return (
    <Svg width={size} height={size * 1.5} viewBox="0 0 32 48" fill="none">
      <Path
        d="M16 46 C16 34, 16 22, 16 4"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
      />
      <Path
        d="M16 28 C10 26, 6 22, 5 16"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M16 20 C22 18, 26 14, 27 8"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M16 12 C12 10, 9 6, 9 2"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
