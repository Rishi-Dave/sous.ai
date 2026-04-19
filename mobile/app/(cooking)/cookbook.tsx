import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Clock } from 'lucide-react-native';

import { EditorialHeader } from '../../src/components/EditorialHeader';
import { SectionHeading } from '../../src/components/SectionHeading';
import { RuleOff } from '../../src/components/RuleOff';
import { EmptyIllustration } from '../../src/components/EmptyIllustration';
import { getRecipe, listRecipes } from '../../src/api/client';
import type { CookbookEntry } from '../../src/api/types';
import { useCooking } from '../../src/state/CookingContext';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { scale } from '../../src/theme/spacing';
import { formatDuration, formatRelativeDate } from '../../src/util/formatDuration';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

export default function CookbookScreen() {
  const router = useRouter();
  const { setFinalizeResponse, setFinalizeStarted } = useCooking();
  const [entries, setEntries] = useState<CookbookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setError(null);
      setEntries(null);
      listRecipes(DEMO_USER_ID)
        .then((r) => {
          if (!cancelled) setEntries(r.entries);
        })
        .catch((e) => {
          if (!cancelled) setError(String(e));
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const openEntry = async (entry: CookbookEntry) => {
    if (openingId) return;
    setOpeningId(entry.recipe_id);
    try {
      const full = await getRecipe(entry.recipe_id);
      setFinalizeStarted(false);
      setFinalizeResponse(full);
      router.push('/(cooking)/summary');
    } catch (e) {
      setError(`Couldn't open recipe: ${String(e)}`);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.headerWrap}>
        <EditorialHeader eyebrow="Your cookbook" onBack={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Saved recipes</Text>
          <Text style={styles.subtitle}>
            Every session you finish lands here with its macros and time on the stove.
          </Text>
        </View>

        <SectionHeading
          title="All recipes"
          count={entries?.length ?? undefined}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {entries === null && !error ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.deepGreen} />
          </View>
        ) : null}

        {entries !== null && entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyIllustration size={96} />
            <Text style={styles.empty}>
              No saved recipes yet.{'\n'}Your first session will show up here once you finish.
            </Text>
          </View>
        ) : null}

        {entries && entries.length > 0 ? (
          <View style={styles.list}>
            {entries.map((entry, i) => (
              <EntryRow
                key={entry.recipe_id}
                entry={entry}
                last={i === entries.length - 1}
                onPress={() => openEntry(entry)}
                loading={openingId === entry.recipe_id}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function EntryRow({
  entry,
  last,
  onPress,
  loading,
}: {
  entry: CookbookEntry;
  last: boolean;
  onPress: () => void;
  loading: boolean;
}) {
  const duration = formatDuration(entry.cook_time_seconds);
  const when = formatRelativeDate(entry.finalized_at);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Open ${entry.recipe_name ?? 'saved recipe'}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{entry.recipe_name ?? 'Untitled recipe'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{Math.round(entry.calories)} cal</Text>
          {duration ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Clock size={11} color={colors.mutedGreen} style={styles.clockIcon} />
              <Text style={styles.meta}>{duration}</Text>
            </>
          ) : null}
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.meta}>{when}</Text>
        </View>
      </View>
      <View style={styles.chev}>
        {loading ? (
          <ActivityIndicator color={colors.mutedGreen} size="small" />
        ) : (
          <ChevronRight size={18} color={colors.mutedGreen} />
        )}
      </View>
      {!last ? <RuleOff color="borderGrey" style={styles.rowRule} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerWrap: { paddingHorizontal: scale.xxl, paddingTop: scale.sm },
  body: {
    paddingHorizontal: scale.xxl,
    paddingTop: scale.xl,
    paddingBottom: scale.xxxl,
    gap: scale.xl,
  },
  titleBlock: { gap: 6 },
  title: { ...typography.recipeTitle, color: colors.deepGreen },
  subtitle: { ...typography.body, color: colors.mutedGreen, lineHeight: 20, maxWidth: 320 },
  centerState: { paddingVertical: scale.xxl, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', gap: scale.md, paddingVertical: scale.xl },
  empty: {
    ...typography.body,
    color: colors.mutedGreen,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: { paddingHorizontal: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale.md,
    gap: scale.md,
    position: 'relative',
  },
  rowPressed: { opacity: 0.6 },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { ...typography.body, color: colors.deepGreen, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  meta: { ...typography.caption, color: colors.mutedGreen },
  metaDot: { ...typography.caption, color: colors.mutedGreen, marginHorizontal: 6 },
  clockIcon: { marginRight: 3 },
  chev: { width: 20, alignItems: 'flex-end' },
  rowRule: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  error: { ...typography.body, color: colors.error, textAlign: 'center' },
});
