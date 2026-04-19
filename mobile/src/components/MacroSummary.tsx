import { StyleSheet, Text, View } from 'react-native';
import { MacroCard } from './MacroCard';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export function MacroSummary({ calories, protein_g, fat_g, carbs_g }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>Total calories</Text>
      <Text style={styles.big}>{Math.round(calories)}</Text>
      <View style={styles.row}>
        <MacroCard label="Protein" value={`${Math.round(protein_g)}g`} />
        <MacroCard label="Fat" value={`${Math.round(fat_g)}g`} />
        <MacroCard label="Carbs" value={`${Math.round(carbs_g)}g`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  eyebrow: { ...typography.eyebrow, color: colors.mutedGreen },
  big: { ...typography.bigMetric, color: colors.deepGreen, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12, alignSelf: 'stretch' },
});
