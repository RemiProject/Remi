import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { photoStorage } from './photo-storage';
import { recognizeReceipt, type ReceiptEngine, type ReceiptVisionEngine } from './receipt-ocr-core';

// Optional lookups keep Expo Go and older builds usable without falsely reporting OCR support.
const vision = requireOptionalNativeModule<ReceiptVisionEngine>('ReceiptVision');
const engine = requireOptionalNativeModule<ReceiptEngine>('ExpoTextExtractor');
export const scanReceipt = (ref: string) => recognizeReceipt(ref, photoStorage, engine, Platform.OS, vision);
