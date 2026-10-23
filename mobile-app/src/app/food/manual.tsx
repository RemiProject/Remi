import { useLocalSearchParams } from 'expo-router';
import FoodFormScreen from '@/screens/food-form-screen';
import { isPhotoRef } from '@/domain/inventory';
export default function ManualFoodRoute() {
 const { photoRef, initialName } = useLocalSearchParams<{ photoRef?: string; initialName?: string }>();
 return <FoodFormScreen initialPhotoRef={isPhotoRef(photoRef) ? photoRef : undefined} initialName={typeof initialName === 'string' && initialName.trim().length <= 100 ? initialName.trim() : undefined} />;
}
