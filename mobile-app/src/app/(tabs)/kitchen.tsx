import KitchenScreen from '@/screens/kitchen-screen';
import { BackendKitchenScreen } from '@/screens/backend-kitchen-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
export default function KitchenRoute() {
  return isBackendInventoryEnabled() ? <BackendKitchenScreen /> : <KitchenScreen />;
}
