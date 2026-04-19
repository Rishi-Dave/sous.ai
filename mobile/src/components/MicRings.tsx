import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  active: boolean;
  baseSize?: number;
}

interface RingSpec {
  size: number;
  delay: number;
  opacityFrom: number;
}

const RINGS: RingSpec[] = [
  { size: 96, delay: 0, opacityFrom: 0.85 },
  { size: 124, delay: 400, opacityFrom: 0.55 },
  { size: 156, delay: 800, opacityFrom: 0.3 },
];

export function MicRings({ active, baseSize = 72 }: Props) {
  const values = useRef(RINGS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) {
      values.forEach((v) => v.setValue(0));
      return;
    }
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(RINGS[i].delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, values]);

  return (
    <View style={[styles.wrap, { width: baseSize, height: baseSize }]} pointerEvents="none">
      {RINGS.map((ring, i) => {
        const scale = values[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0.6, 1],
        });
        const opacity = values[i].interpolate({
          inputRange: [0, 0.15, 1],
          outputRange: [0, ring.opacityFrom, 0],
        });
        return (
          <Animated.View
            key={ring.size}
            style={[
              styles.ring,
              {
                width: ring.size,
                height: ring.size,
                borderRadius: ring.size / 2,
                marginLeft: -ring.size / 2,
                marginTop: -ring.size / 2,
                transform: [{ scale }],
                opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderWidth: 1,
    borderColor: colors.metallicGold,
  },
});
