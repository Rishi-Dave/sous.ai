import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Mic } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type MicState = 'armed' | 'listening' | 'processing' | 'speaking';

interface Props {
  state: MicState;
  transcript?: string;
  assistantText?: string;
  onTap?: () => void;
}

export function MicCard({ state, transcript, assistantText, onTap }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state !== 'armed') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const borderColor = state === 'listening' ? colors.metallicGold : colors.borderGrey;

  return (
    <View style={[styles.card, { borderColor }]}>
      {state === 'armed' ? (
        <>
          <Pressable onPress={onTap} accessibilityLabel="Wake" hitSlop={8}>
            <Animated.View style={[styles.micGold, { transform: [{ scale: pulse }] }]}>
              <Mic size={28} color={colors.deepGreen} />
            </Animated.View>
          </Pressable>
          <Text style={styles.label}>Tap or say 'hey sous'</Text>
        </>
      ) : null}

      {state === 'listening' ? (
        <>
          <View style={styles.micGoldFilled}>
            <Mic size={28} color={colors.deepGreen} />
          </View>
          <Text style={styles.eyebrow}>Listening</Text>
          {transcript ? <Text style={styles.transcript}>{transcript}</Text> : null}
        </>
      ) : null}

      {state === 'processing' ? (
        <>
          <ActivityIndicator size="large" color={colors.metallicGold} />
          <Text style={styles.label}>Thinking…</Text>
        </>
      ) : null}

      {state === 'speaking' ? (
        <>
          <Waveform />
          <Text style={styles.eyebrow}>Chef is talking</Text>
          {assistantText ? <Text style={styles.transcript}>{assistantText}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

function Waveform() {
  const bar1 = useRef(new Animated.Value(0.4)).current;
  const bar2 = useRef(new Animated.Value(0.4)).current;
  const bar3 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const bars: Array<[Animated.Value, number]> = [
      [bar1, 0],
      [bar2, 200],
      [bar3, 400],
    ];
    const loops = bars.map(([v, delay]) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.4, duration: 300, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bar1, bar2, bar3]);

  return (
    <View style={styles.wave}>
      {[bar1, bar2, bar3].map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, { transform: [{ scaleY: v }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  micGold: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.metallicGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGoldFilled: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.metallicGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.body, color: colors.mutedGreen, textAlign: 'center' },
  eyebrow: { ...typography.eyebrow, color: colors.mutedGreen },
  transcript: { ...typography.body, color: colors.darkGrey, textAlign: 'center' },
  wave: { flexDirection: 'row', gap: 6, height: 32, alignItems: 'center' },
  bar: {
    width: 6,
    height: 28,
    backgroundColor: colors.vibrantGreen,
    borderRadius: 2,
  },
});
