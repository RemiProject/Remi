import { Module } from '@nestjs/common';
import { SafetyProfileLoader } from './application/safety-profile.loader.js';
import { SafetyEvaluator } from './domain/safety-evaluator.js';
import { ProductSafetyService } from './application/product-safety.service.js';
import { ProductSafetyResolver } from './presentation/product-safety.resolver.js';

@Module({ providers: [SafetyProfileLoader, SafetyEvaluator, ProductSafetyService, ProductSafetyResolver], exports: [SafetyProfileLoader, SafetyEvaluator] })
export class SafetyModule {}
