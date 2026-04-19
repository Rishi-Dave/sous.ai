import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

// Fade + translateY(12 → 0) entry animation, delayed 800ms after mount.
// Built-in Animated (docs/ui.md §7 — reanimated not required).
export function ConfirmationPill({ label }: { label: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }, 800);
    return () => clearTimeout(t);
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.root, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.metallicGold,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  label: { ...typography.caption, color: colors.deepGreen, fontWeight: '500' },
});
