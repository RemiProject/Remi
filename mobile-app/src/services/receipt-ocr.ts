import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { photoStorage } from './photo-storage';
import { recognizeReceipt, type ReceiptEngine } from './receipt-ocr-core';

// Optional lookup keeps Expo Go usable without falsely reporting OCR support.
const engine = requireOptionalNativeModule<ReceiptEngine>('ExpoTextExtractor');
export const scanReceipt = (ref: string) => recognizeReceipt(ref, photoStorage, engine, Platform.OS);
