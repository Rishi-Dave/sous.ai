import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface MicroBar {
  value: number;
  max: number;
}

interface Props {
  name: string;
  quantity?: string;
  caption?: string;
  last?: boolean;
  accent?: 'gold-asterisk';
  microBar?: MicroBar;
}

export function IngredientRow({ name, quantity, caption, last, accent, microBar }: Props) {
  return (
    <View style={[styles.root, !last && styles.border]}>
      <View style={styles.left}>
        <View style={styles.nameRow}>
          {accent === 'gold-asterisk' ? <GoldAsterisk /> : null}
          <Text style={styles.name}>{name}</Text>
        </View>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <View style={styles.rightCol}>
        {microBar ? <InlineMicroBar value={microBar.value} max={microBar.max} /> : null}
        {quantity ? <Text style={styles.quantity}>{quantity}</Text> : null}
      </View>
    </View>
  );
}

function GoldAsterisk() {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [opacity]);
  return (
    <Animated.Text style={[styles.asterisk, { opacity }]}>✽</Animated.Text>
  );
}

function InlineMicroBar({ value, max }: MicroBar) {
  const MAX_WIDTH = 60;
  const target = max > 0 ? Math.max(2, Math.min(MAX_WIDTH, (value / max) * MAX_WIDTH)) : 0;
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: target,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [target, width]);
  return <Animated.View style={[styles.microBar, { width }]} />;
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderGrey },
  left: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.body, color: colors.darkGrey },
  asterisk: { ...typography.caption, color: colors.metallicGold, fontSize: 12 },
  caption: { ...typography.caption, color: colors.mutedGreen, opacity: 0.75, marginTop: 2 },
  rightCol: { alignItems: 'flex-end', marginLeft: 12, gap: 4 },
  quantity: { ...typography.quantity, color: colors.mutedGreen },
  microBar: {
    height: 2,
    backgroundColor: colors.metallicGold,
  },
});
