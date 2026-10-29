import FoodDetail from '@/screens/food-detail-screen';
import { BackendFoodDetailScreen } from '@/screens/backend-kitchen-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
export default function FoodDetailRoute() {
  return isBackendInventoryEnabled() ? <BackendFoodDetailScreen /> : <FoodDetail />;
}
