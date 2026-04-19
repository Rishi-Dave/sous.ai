import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { RuleOff } from './RuleOff';

interface Props {
  title: string;
  count?: number;
}

export function SectionHeading({ title, count }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {typeof count === 'number' ? (
          <Text style={styles.count}>{count.toString().padStart(2, '0')}</Text>
        ) : null}
      </View>
      <RuleOff color="deepGreenOnCream" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: { ...typography.eyebrow, color: colors.deepGreen },
  count: { ...typography.byline, color: colors.mutedGreen },
});
