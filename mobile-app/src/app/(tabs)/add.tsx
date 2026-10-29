import FoodEntryChooser from '@/screens/food-entry-chooser';
import { BackendWritesUnavailableScreen } from '@/screens/backend-kitchen-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
export default function AddRoute() {
  return isBackendInventoryEnabled() ? <BackendWritesUnavailableScreen /> : <FoodEntryChooser />;
}
