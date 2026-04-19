import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createSession } from '../../src/api/client';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { radii } from '../../src/theme/spacing';

// Seeded demo user — must be a real UUID so the FK to profiles holds.
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <View style={styles.center}>
        <Text style={styles.wordmark}>Sous Chef</Text>
        <Text style={styles.caption}>Your voice sous chef</Text>
      </View>
      <View style={styles.footer}>
        <Pressable
          onPress={onStart}
          disabled={busy}
          accessibilityLabel="Start cooking"
          style={[styles.cta, busy && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>{busy ? 'Starting…' : 'Start cooking'}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { ...typography.wordmark, color: colors.deepGreen },
  caption: { ...typography.body, color: colors.mutedGreen, marginTop: 8 },
  footer: { padding: 20 },
  cta: {
    backgroundColor: colors.vibrantGreen,
    borderRadius: radii.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...typography.button, color: colors.cream },
  error: { color: '#c62828', textAlign: 'center', marginTop: 12 },
});
