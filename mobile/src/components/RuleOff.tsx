import { View, StyleSheet, type ViewStyle, type DimensionValue } from 'react-native';
import { colors, type ColorToken } from '../theme/colors';

interface Props {
  color?: ColorToken;
  width?: DimensionValue;
  inset?: number;
  style?: ViewStyle;
}

export function RuleOff({ color = 'borderGrey', width = '100%', inset = 0, style }: Props) {
  return (
    <View
      style={[
        styles.rule,
        { backgroundColor: colors[color], width, marginHorizontal: inset },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  rule: { height: StyleSheet.hairlineWidth },
});
