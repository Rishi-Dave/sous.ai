import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  name: string;
  quantity?: string;
  caption?: string;
  last?: boolean;
}

export function IngredientRow({ name, quantity, caption, last }: Props) {
  return (
    <View style={[styles.root, !last && styles.border]}>
      <View style={styles.left}>
        <Text style={styles.name}>{name}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      {quantity ? <Text style={styles.quantity}>{quantity}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  border: { borderBottomWidth: 1, borderBottomColor: colors.borderGrey },
  left: { flex: 1 },
  name: { ...typography.body, color: colors.darkGrey },
  caption: { ...typography.caption, color: colors.mutedGreen, opacity: 0.75, marginTop: 2 },
  quantity: { ...typography.quantity, color: colors.mutedGreen, marginLeft: 12 },
});
