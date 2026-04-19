import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Clock, Trash2 } from 'lucide-react-native';

import { EditorialHeader } from '../../src/components/EditorialHeader';
import { SectionHeading } from '../../src/components/SectionHeading';
import { RuleOff } from '../../src/components/RuleOff';
import { EmptyIllustration } from '../../src/components/EmptyIllustration';
import { deleteRecipe, getRecipe, listRecipes } from '../../src/api/client';
import type { CookbookEntry } from '../../src/api/types';
import { useCooking } from '../../src/state/CookingContext';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { scale } from '../../src/theme/spacing';
import { formatDuration, formatRelativeDate } from '../../src/util/formatDuration';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

// Alert.alert is a no-op on web; use window.confirm instead so delete works in
// both the expo-web dev loop and the iOS dev client.
function confirmDelete(name: string, onConfirm: () => void): void {
  const title = 'Delete recipe?';
  const message = `"${name}" will be removed from your cookbook. This can't be undone.`;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function CookbookScreen() {
  const router = useRouter();
  const { setFinalizeResponse, setFinalizeStarted } = useCooking();
  const [entries, setEntries] = useState<CookbookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    if (openingId || deletingId) return;
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

  const askDelete = (entry: CookbookEntry) => {
    if (deletingId || openingId) return;
    confirmDelete(entry.recipe_name ?? 'Untitled recipe', () => performDelete(entry));
  };

  const performDelete = async (entry: CookbookEntry) => {
    const prev = entries;
    setDeletingId(entry.recipe_id);
    setError(null);
    // Optimistic removal so the list re-renders immediately.
    setEntries((current) =>
      current ? current.filter((e) => e.recipe_id !== entry.recipe_id) : current,
    );
    try {
      await deleteRecipe(entry.recipe_id);
    } catch (e) {
      setError(`Couldn't delete recipe: ${String(e)}`);
      // Roll back on failure.
      setEntries(prev);
    } finally {
      setDeletingId(null);
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
                onDelete={() => askDelete(entry)}
                loading={openingId === entry.recipe_id}
                deleting={deletingId === entry.recipe_id}
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
  onDelete,
  loading,
  deleting,
}: {
  entry: CookbookEntry;
  last: boolean;
  onPress: () => void;
  onDelete: () => void;
  loading: boolean;
  deleting: boolean;
}) {
  const duration = formatDuration(entry.cook_time_seconds);
  const when = formatRelativeDate(entry.finalized_at);
  return (
    <View style={styles.rowWrap}>
      <Pressable
        onPress={onPress}
        disabled={deleting}
        accessibilityLabel={`Open ${entry.recipe_name ?? 'saved recipe'}`}
        style={({ pressed }) => [styles.rowMain, pressed && styles.rowMainPressed]}
      >
        <View style={styles.rowText}>
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
      </Pressable>
      <Pressable
        onPress={onDelete}
        disabled={deleting || loading}
        accessibilityLabel={`Delete ${entry.recipe_name ?? 'saved recipe'}`}
        hitSlop={10}
        style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
      >
        {deleting ? (
          <ActivityIndicator color={colors.mutedGreen} size="small" />
        ) : (
          <Trash2 size={16} color={colors.mutedGreen} />
        )}
      </Pressable>
      {!last ? <RuleOff color="borderGrey" style={styles.rowRule} /> : null}
    </View>
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
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale.md,
    gap: scale.sm,
    position: 'relative',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale.md,
  },
  rowMainPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { ...typography.body, color: colors.deepGreen, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  meta: { ...typography.caption, color: colors.mutedGreen },
  metaDot: { ...typography.caption, color: colors.mutedGreen, marginHorizontal: 6 },
  clockIcon: { marginRight: 3 },
  chev: { width: 20, alignItems: 'flex-end' },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  deleteBtnPressed: { opacity: 0.5, backgroundColor: colors.deepGreenTint },
  rowRule: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  error: { ...typography.body, color: colors.error, textAlign: 'center' },
});
