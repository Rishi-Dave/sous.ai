import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { RuleOff } from './RuleOff';

interface Props {
  eyebrow: string;
  right?: ReactNode;
  onBack?: () => void;
}

export function EditorialHeader({ eyebrow, right, onBack }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.left}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Go back">
              <ChevronLeft size={18} color={colors.deepGreen} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
        <View style={styles.right}>{right ?? null}</View>
      </View>
      <RuleOff color="deepGreenOnCream" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 22,
  },
  left: { width: 40, alignItems: 'flex-start' },
  right: { width: 40, alignItems: 'flex-end' },
  eyebrow: { ...typography.eyebrow, color: colors.deepGreen, flex: 1, textAlign: 'center' },
});
