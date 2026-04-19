import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { HeaderStrip } from '../../src/components/HeaderStrip';
import { MacroSummary } from '../../src/components/MacroSummary';
import { ConfirmationPill } from '../../src/components/ConfirmationPill';
import { IngredientRow } from '../../src/components/IngredientRow';
import { UndoToast } from '../../src/components/UndoToast';
import { useCooking } from '../../src/state/CookingContext';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { radii } from '../../src/theme/spacing';

export default function SummaryScreen() {
  const router = useRouter();
  const { finalizeResponse } = useCooking();

  if (!finalizeResponse) {
    return (
      <SafeAreaView style={styles.root}>
        <HeaderStrip eyebrow="Recipe complete" title="Summary" />
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

  return (
    <SafeAreaView style={styles.root}>
      <HeaderStrip eyebrow="Recipe complete" title="Your recipe" />
      <ScrollView contentContainerStyle={styles.body}>
        <MacroSummary
          calories={macros.calories}
          protein_g={macros.protein_g}
          fat_g={macros.fat_g}
          carbs_g={macros.carbs_g}
        />
        <ConfirmationPill label="Saved to your cookbook" />

        <Text style={styles.eyebrow}>Ingredients</Text>
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
              />
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.replace('/(home)')}
          accessibilityLabel="Done"
          style={styles.cta}
        >
          <Text style={styles.ctaText}>Done</Text>
        </Pressable>
      </View>

      <UndoToast label="Saved to cookbook" onUndo={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  body: { padding: 20, gap: 18, paddingBottom: 96 },
  empty: { padding: 20 },
  emptyText: { ...typography.body, color: colors.mutedGreen, textAlign: 'center' },
  eyebrow: { ...typography.eyebrow, color: colors.mutedGreen },
  list: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderGrey,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.borderGrey },
  cta: {
    backgroundColor: colors.vibrantGreen,
    borderRadius: radii.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { ...typography.button, color: colors.cream },
});
