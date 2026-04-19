import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  label: string;
  durationMs?: number;
  onUndo: () => void;
}

export function UndoToast({ label, durationMs = 2000, onUndo }: Props) {
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
        setVisible(false),
      );
    }, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.root, { opacity }]}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onUndo} accessibilityLabel="Undo" hitSlop={8}>
        <Text style={styles.undo}>Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    backgroundColor: colors.deepGreen,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { color: colors.cream, fontSize: 14, fontWeight: '400' },
  undo: { color: colors.metallicGold, fontSize: 14, fontWeight: '500' },
});
