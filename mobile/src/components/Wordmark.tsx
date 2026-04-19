import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  variant?: 'hero' | 'compact';
}

export function Wordmark({ variant = 'hero' }: Props) {
  const isHero = variant === 'hero';
  return (
    <View style={styles.wrap}>
      <Text style={[isHero ? styles.hero : styles.compact, styles.line]}>Sous</Text>
      <Text style={[isHero ? styles.hero : styles.compact, styles.line, styles.second]}>
        Chef
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start' },
  hero: { ...typography.hero, color: colors.deepGreen },
  compact: { ...typography.wordmark, color: colors.deepGreen },
  line: { lineHeight: 64 },
  second: { marginLeft: 28 },
});
