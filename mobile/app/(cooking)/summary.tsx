import { useMemo } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { EditorialHeader } from '../../src/components/EditorialHeader';
import { CalorieRing } from '../../src/components/CalorieRing';
import { MacroTable } from '../../src/components/MacroTable';
import { ConfirmationPill } from '../../src/components/ConfirmationPill';
import { IngredientRow } from '../../src/components/IngredientRow';
import { SectionHeading } from '../../src/components/SectionHeading';
import { RuleOff } from '../../src/components/RuleOff';
import { useCooking } from '../../src/state/CookingContext';
import { formatDuration } from '../../src/util/formatDuration';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { radii, scale } from '../../src/theme/spacing';

function formatEditorialDate(d: Date): string {
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${month} ${day} · ${year}`;
}

export default function SummaryScreen() {
  const router = useRouter();
  const { finalizeResponse } = useCooking();
  const today = useMemo(() => formatEditorialDate(new Date()), []);

  if (!finalizeResponse) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.headerWrap}>
          <EditorialHeader eyebrow="Recipe complete · N° 01" />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No macros to show — try finishing a cooking session first.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { macros, ingredients } = finalizeResponse;
  const perIngredient = macros.per_ingredient;
  const maxIngredientCal = perIngredient
    ? Object.values(perIngredient).reduce((m, v) => (v.calories > m ? v.calories : m), 0)
    : 0;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.headerWrap}>
        <EditorialHeader
          eyebrow="Recipe complete · N° 01"
          onBack={() => router.back()}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.titleBlock}>
          <Text style={styles.recipeTitle}>Tonight's recipe</Text>
          <Text style={styles.dateline}>{today}</Text>
        </View>

        <View style={styles.ringBlock}>
          <Text style={styles.eyebrowTotal}>Total calories</Text>
          <CalorieRing calories={macros.calories} />
          {formatDuration(finalizeResponse.cook_time_seconds) ? (
            <Text style={styles.cookTime}>
              Time on the stove · {formatDuration(finalizeResponse.cook_time_seconds)}
            </Text>
          ) : null}
        </View>

        <View style={styles.macroBlock}>
          <RuleOff color="deepGreenOnCream" />
          <MacroTable
            protein_g={macros.protein_g}
            fat_g={macros.fat_g}
            carbs_g={macros.carbs_g}
          />
          <RuleOff color="deepGreenOnCream" />
        </View>

        <SectionHeading title="Ingredients" count={ingredients.length} />
        <View style={styles.list}>
          {ingredients.map((ing, i) => {
            const per = perIngredient?.[ing.name];
            const cal = per ? per.calories : null;
            return (
              <IngredientRow
                key={`${ing.name}-${i}`}
                name={ing.name}
                quantity={
                  ing.qty != null ? `${ing.qty}${ing.unit ? ' ' + ing.unit : ''}` : undefined
                }
                caption={cal != null ? `${Math.round(cal)} cal` : undefined}
                last={i === ingredients.length - 1}
                microBar={
                  cal != null && maxIngredientCal > 0
                    ? { value: cal, max: maxIngredientCal }
                    : undefined
                }
              />
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.pillWrap} pointerEvents="box-none">
        <ConfirmationPill label="Saved to your cookbook" />
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.replace('/(home)')}
          accessibilityLabel="Done"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerWrap: { paddingHorizontal: scale.xxl, paddingTop: scale.sm },
  body: {
    paddingHorizontal: scale.xxl,
    paddingTop: scale.xl,
    paddingBottom: 160,
    gap: scale.xxl,
  },
  titleBlock: { gap: 4 },
  recipeTitle: { ...typography.recipeTitle, color: colors.deepGreen },
  dateline: { ...typography.byline, color: colors.mutedGreen },
  ringBlock: { alignItems: 'center', gap: scale.md },
  eyebrowTotal: { ...typography.eyebrow, color: colors.mutedGreen },
  cookTime: { ...typography.caption, color: colors.mutedGreen },
  macroBlock: { gap: scale.md },
  list: { paddingHorizontal: 0 },
  empty: { padding: scale.xl },
  emptyText: { ...typography.body, color: colors.mutedGreen, textAlign: 'center' },
  pillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: scale.xxl,
    paddingVertical: scale.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.deepGreenOnCream,
  },
  cta: {
    backgroundColor: colors.vibrantGreen,
    borderRadius: radii.button,
    paddingVertical: scale.lg,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: {
    ...typography.button,
    color: colors.cream,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
