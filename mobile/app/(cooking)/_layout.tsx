import { Stack } from 'expo-router';
import { CookingProvider } from '../../src/state/CookingContext';

// Group layout hosts CookingProvider so reducer + finalize response survive
// [sessionId] → summary navigation (and Undo back).
export default function CookingLayout() {
  return (
    <CookingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </CookingProvider>
  );
}
