import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export function MacroTable({ protein_g, fat_g, carbs_g }: Props) {
  return (
    <View style={styles.row}>
      <Column label="Protein" value={protein_g} />
      <Divider />
      <Column label="Fat" value={fat_g} />
      <Divider />
      <Column label="Carbs" value={carbs_g} />
    </View>
  );
}

function Column({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.col}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>
        {Math.round(value)}
        <Text style={styles.unit}> g</Text>
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  col: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8 },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.borderGrey,
    marginVertical: 6,
  },
  label: { ...typography.eyebrowTight, color: colors.mutedGreen },
  value: { ...typography.macroValue, color: colors.deepGreen },
  unit: { ...typography.caption, color: colors.mutedGreen },
});
