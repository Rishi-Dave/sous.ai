import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 200;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_RATIO = 0.9;
const VISIBLE_ARC = CIRCUMFERENCE * ARC_RATIO;
const ROTATION_DEG = 90 + ((1 - ARC_RATIO) / 2) * 360;

interface Props {
  calories: number;
}

export function CalorieRing({ calories }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const numberScale = useRef(new Animated.Value(0.96)).current;
  const numberOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(progress, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.delay(150),
        Animated.parallel([
          Animated.timing(numberScale, {
            toValue: 1,
            duration: 450,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(numberOpacity, {
            toValue: 1,
            duration: 450,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [progress, numberScale, numberOpacity]);

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [VISIBLE_ARC, 0],
  });

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        <G rotation={ROTATION_DEG} origin={`${SIZE / 2}, ${SIZE / 2}`}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.borderGrey}
            strokeWidth={StyleSheet.hairlineWidth}
            fill="none"
            strokeDasharray={`${VISIBLE_ARC}, ${CIRCUMFERENCE}`}
          />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.metallicGold}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${VISIBLE_ARC}, ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
          />
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Animated.Text
          style={[
            styles.number,
            {
              opacity: numberOpacity,
              transform: [{ scale: numberScale }],
            },
          ]}
        >
          {Math.round(calories)}
        </Animated.Text>
        <Text style={styles.eyebrow}>calories</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  number: { ...typography.monoDigit, color: colors.deepGreen },
  eyebrow: { ...typography.eyebrow, color: colors.mutedGreen },
});
