import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Mic } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { MicRings } from './MicRings';

export type MicState = 'armed' | 'listening' | 'processing' | 'speaking';

interface Props {
  state: MicState;
  transcript?: string;
  assistantText?: string;
  onTap?: () => void;
}

const STATES: MicState[] = ['armed', 'listening', 'processing', 'speaking'];

export function MicCard({ state, transcript, assistantText, onTap }: Props) {
  const opacities = useRef(
    STATES.reduce<Record<MicState, Animated.Value>>(
      (acc, s) => {
        acc[s] = new Animated.Value(s === state ? 1 : 0);
        return acc;
      },
      {} as Record<MicState, Animated.Value>,
    ),
  ).current;
  const goldBorder = useRef(new Animated.Value(state === 'listening' ? 1 : 0)).current;

  useEffect(() => {
    const fades = STATES.map((s) =>
      Animated.timing(opacities[s], {
        toValue: s === state ? 1 : 0,
        duration: s === state ? 180 : 120,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(fades).start();
    Animated.timing(goldBorder, {
      toValue: state === 'listening' ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [state, opacities, goldBorder]);

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.borderLayer, { opacity: Animated.subtract(1, goldBorder) }]} />
      <Animated.View
        style={[styles.borderLayer, styles.borderGold, { opacity: goldBorder }]}
        pointerEvents="none"
      />
      <StateBody state="armed" visible={state === 'armed'} opacity={opacities.armed}>
        <ArmedBody onTap={onTap} />
      </StateBody>
      <StateBody state="listening" visible={state === 'listening'} opacity={opacities.listening}>
        <ListeningBody onTap={onTap} transcript={transcript} active={state === 'listening'} />
      </StateBody>
      <StateBody
        state="processing"
        visible={state === 'processing'}
        opacity={opacities.processing}
      >
        <ProcessingBody active={state === 'processing'} />
      </StateBody>
      <StateBody state="speaking" visible={state === 'speaking'} opacity={opacities.speaking}>
        <SpeakingBody active={state === 'speaking'} assistantText={assistantText} />
      </StateBody>
    </View>
  );
}

interface BodyWrapperProps {
  state: MicState;
  visible: boolean;
  opacity: Animated.Value;
  children: React.ReactNode;
}

function StateBody({ visible, opacity, children }: BodyWrapperProps) {
  const style: Animated.WithAnimatedObject<ViewStyle> = { opacity };
  return (
    <Animated.View
      style={[styles.bodyLayer, visible ? styles.bodyActive : styles.bodyInactive, style]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}

function ArmedBody({ onTap }: { onTap?: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const haloScale = useRef(new Animated.Value(0)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ]),
    );
    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(haloScale, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(haloOpacity, {
              toValue: 0.5,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(haloOpacity, {
              toValue: 0,
              duration: 1400,
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.timing(haloScale, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    haloLoop.start();
    return () => {
      pulseLoop.stop();
      haloLoop.stop();
    };
  }, [pulse, haloScale, haloOpacity]);

  const haloTransform = haloScale.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });

  return (
    <>
      <View style={styles.micWrap}>
        <Animated.View
          style={[
            styles.halo,
            { transform: [{ scale: haloTransform }], opacity: haloOpacity },
          ]}
          pointerEvents="none"
        />
        <Pressable onPress={onTap} accessibilityLabel="Wake" hitSlop={8}>
          <Animated.View style={[styles.micGold, { transform: [{ scale: pulse }] }]}>
            <Mic size={28} color={colors.deepGreen} />
          </Animated.View>
        </Pressable>
      </View>
      <Text style={styles.label}>Tap or say 'hey sous'</Text>
    </>
  );
}

function ListeningBody({
  onTap,
  transcript,
  active,
}: {
  onTap?: () => void;
  transcript?: string;
  active: boolean;
}) {
  return (
    <>
      <View style={styles.micStack}>
        <View style={styles.ringsLayer} pointerEvents="none">
          <MicRings active={active} />
        </View>
        <Pressable onPress={onTap} accessibilityLabel="Stop listening" hitSlop={8}>
          <View style={styles.micGoldFilled}>
            <Mic size={28} color={colors.deepGreen} />
          </View>
        </Pressable>
      </View>
      <Text style={styles.eyebrow}>Listening</Text>
      <Text style={styles.label}>Tap when you're done</Text>
      {transcript ? <Text style={styles.transcript}>{transcript}</Text> : null}
    </>
  );
}

function ProcessingBody({ active }: { active: boolean }) {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    if (!active) {
      dots.forEach((d) => d.setValue(0));
      return;
    }
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, {
            toValue: 1,
            duration: 250,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0,
            duration: 250,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, dots]);

  return (
    <>
      <View style={styles.dotRow}>
        {dots.map((d, i) => {
          const translateY = d.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
          return (
            <Animated.View key={i} style={[styles.dot, { transform: [{ translateY }] }]} />
          );
        })}
      </View>
      <Text style={styles.label}>Thinking…</Text>
    </>
  );
}

function SpeakingBody({
  active,
  assistantText,
}: {
  active: boolean;
  assistantText?: string;
}) {
  return (
    <>
      <Waveform active={active} />
      <Text style={styles.eyebrow}>Chef is talking</Text>
      {assistantText ? <Text style={styles.transcript}>{assistantText}</Text> : null}
    </>
  );
}

function Waveform({ active }: { active: boolean }) {
  const bars = useMemo(
    () => [0, 1, 2, 3, 4].map(() => new Animated.Value(0.4)),
    [],
  );

  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.4));
      return;
    }
    const delays = [0, 120, 240, 180, 60];
    const loops = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delays[i]),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.4, duration: 300, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, bars]);

  return (
    <View style={styles.wave}>
      {bars.map((v, i) => (
        <Animated.View key={i} style={[styles.bar, { transform: [{ scaleY: v }] }]} />
      ))}
    </View>
  );
}

const CARD_PADDING = 20;
const MIN_HEIGHT = 220;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: CARD_PADDING,
    minHeight: MIN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  borderLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderGrey,
  },
  borderGold: { borderColor: colors.metallicGold },
  bodyLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: CARD_PADDING,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  bodyActive: {},
  bodyInactive: {},
  micWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micStack: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringsLayer: {
    position: 'absolute',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.metallicGold,
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
  wave: { flexDirection: 'row', gap: 6, height: 36, alignItems: 'center' },
  bar: {
    width: 6,
    height: 32,
    backgroundColor: colors.vibrantGreen,
    borderRadius: 2,
  },
  dotRow: { flexDirection: 'row', gap: 10, height: 24, alignItems: 'center' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.deepGreen,
  },
});
