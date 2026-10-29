import HomeScreen from '@/screens/home-screen';
import { BackendHomeScreen } from '@/screens/backend-kitchen-screen';
import { isBackendInventoryEnabled } from '@/services/inventory-feature';
export default function HomeRoute() {
  return isBackendInventoryEnabled() ? <BackendHomeScreen /> : <HomeScreen />;
}
