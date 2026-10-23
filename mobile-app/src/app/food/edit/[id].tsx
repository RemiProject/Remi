import { useLocalSearchParams } from 'expo-router';
import FoodFormScreen from '@/screens/food-form-screen';

export default function EditFoodRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FoodFormScreen itemId={id} />;
}
