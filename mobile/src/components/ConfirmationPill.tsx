import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  label: string;
  icon?: ReactNode;
}

// Fade + translateY(12 → 0) entry animation, delayed 800ms after mount.
// Built-in Animated (docs/ui.md §7 — reanimated not required).
export function ConfirmationPill({ label, icon }: Props) {
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

  const resolvedIcon = icon === undefined ? <Check size={12} color={colors.deepGreen} /> : icon;

  return (
    <Animated.View style={[styles.root, { opacity, transform: [{ translateY }] }]}>
      {resolvedIcon ? <View style={styles.icon}>{resolvedIcon}</View> : null}
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.metallicGold,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: { alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.caption, color: colors.deepGreen, fontWeight: '500' },
});
