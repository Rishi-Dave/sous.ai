import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { createSession } from '../../src/api/client';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { radii, scale } from '../../src/theme/spacing';
import { Wordmark } from '../../src/components/Wordmark';
import { SprigMark } from '../../src/components/SprigMark';
import { RuleOff } from '../../src/components/RuleOff';
import { TimeOfDayGreeting } from '../../src/components/TimeOfDayGreeting';

// Seeded demo user — must be a real UUID so the FK to profiles holds.
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

function formatEditorialDate(d: Date): string {
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${month} ${day} · ${year}`;
}

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => formatEditorialDate(new Date()), []);

  useFocusEffect(
    useCallback(() => {
      setBusy(false);
      setError(null);
    }, []),
  );

  const onStart = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createSession(DEMO_USER_ID);
      router.push({
        pathname: '/(cooking)/[sessionId]',
        params: { sessionId: res.session_id, recipeId: res.recipe_id },
      });
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.eyebrow}>N° 01 · Cookbook</Text>
        <Text style={styles.dateline}>{today}</Text>
      </View>

      <View style={styles.hero}>
        <SprigMark size={28} />
        <View style={styles.wordmarkBlock}>
          <Wordmark variant="hero" />
          <View style={styles.ruleRow}>
            <RuleOff color="metallicGold" width={72} />
          </View>
          <Text style={styles.tagline}>
            A voice-first sous chef.{'\n'}Ingredients, macros, and the quiet work of dinner —
            written down for you.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TimeOfDayGreeting />
        <Pressable
          onPress={onStart}
          disabled={busy}
          accessibilityLabel="Start cooking"
          style={({ pressed }) => [
            styles.cta,
            busy && styles.ctaDisabled,
            pressed && styles.ctaPressed,
          ]}
        >
          {busy ? (
            <View style={styles.ctaInner}>
              <Text style={styles.ctaText}>Starting</Text>
              <BusyDots />
            </View>
          ) : (
            <Text style={styles.ctaText}>Begin a session</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => router.push('/(cooking)/cookbook')}
          accessibilityLabel="Open your cookbook"
          style={({ pressed }) => [styles.cookbookLink, pressed && styles.cookbookLinkPressed]}
          hitSlop={8}
        >
          <Text style={styles.cookbookLinkText}>Open your cookbook →</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

function BusyDots() {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
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
  }, [dots]);

  return (
    <View style={styles.busyDots}>
      {dots.map((d, i) => {
        const translateY = d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
        return (
          <Animated.View
            key={i}
            style={[styles.busyDot, { transform: [{ translateY }] }]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: scale.xxxl },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: scale.lg,
  },
  eyebrow: { ...typography.eyebrow, color: colors.deepGreen },
  dateline: { ...typography.byline, color: colors.mutedGreen },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: scale.xl,
  },
  wordmarkBlock: { gap: scale.lg },
  ruleRow: { marginTop: scale.xs },
  tagline: {
    ...typography.body,
    color: colors.mutedGreen,
    lineHeight: 20,
    maxWidth: 300,
  },
  footer: { paddingBottom: scale.xxl, gap: scale.md },
  cta: {
    backgroundColor: colors.deepGreen,
    borderRadius: radii.button,
    paddingVertical: scale.lg,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaPressed: { opacity: 0.85 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: scale.sm },
  ctaText: {
    ...typography.button,
    color: colors.cream,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  busyDots: { flexDirection: 'row', gap: 4 },
  busyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cream,
  },
  cookbookLink: { alignSelf: 'center', paddingVertical: scale.xs },
  cookbookLinkPressed: { opacity: 0.6 },
  cookbookLinkText: {
    ...typography.eyebrow,
    color: colors.deepGreen,
    textDecorationLine: 'underline',
  },
  error: { color: colors.error, textAlign: 'center', marginTop: scale.md },
});
