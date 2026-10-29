import FoodEntryChooser from '@/screens/food-entry-chooser';
import { BackendWritesUnavailableScreen } from '@/screens/backend-kitchen-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
export default function FoodEntryRoute() {
  return isBackendInventoryEnabled() ? <BackendWritesUnavailableScreen /> : <FoodEntryChooser />;
}
