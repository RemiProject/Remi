import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoredInventoryRepository } from './inventory-repository';

export const inventoryRepository = new StoredInventoryRepository(AsyncStorage);
