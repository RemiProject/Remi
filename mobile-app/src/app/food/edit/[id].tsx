import { useLocalSearchParams } from 'expo-router';
import FoodFormScreen from '@/screens/food-form-screen';
import { BackendWritesUnavailableScreen } from '@/screens/backend-kitchen-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';

export default function EditFoodRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (isBackendInventoryEnabled()) return <BackendWritesUnavailableScreen />;
  return <FoodFormScreen itemId={id} />;
}
