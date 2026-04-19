import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Late-night cooking, chef.';
  if (hour < 12) return 'Good morning, chef.';
  if (hour < 17) return 'Good afternoon, chef.';
  if (hour < 22) return 'Good evening, chef.';
  return 'Up late, chef.';
}

export function TimeOfDayGreeting() {
  const message = useMemo(() => greetingForHour(new Date().getHours()), []);
  return <Text style={styles.text}>{message}</Text>;
}

const styles = StyleSheet.create({
  text: { ...typography.caption, color: colors.mutedGreen, textAlign: 'center' },
});
