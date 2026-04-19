import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

export function HeaderStrip({ eyebrow, title, subtitle }: Props) {
  return (
    <View style={styles.root}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.deepGreen,
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 20,
  },
  eyebrow: { ...typography.eyebrow, color: colors.cream, opacity: 0.7, marginBottom: 2 },
  title: { ...typography.pageTitle, color: colors.cream },
  subtitle: { ...typography.body, color: colors.cream, opacity: 0.75, marginTop: 2 },
});
