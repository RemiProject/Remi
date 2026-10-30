import FoodEntryChooser from '@/screens/food-entry-chooser';
import BackendAddFoodScreen from '@/screens/backend-add-food-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
export default function FoodEntryRoute() {
  return isBackendInventoryEnabled() ? <BackendAddFoodScreen /> : <FoodEntryChooser />;
}
