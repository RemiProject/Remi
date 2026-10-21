import { Module } from '@nestjs/common';
import { SafetyProfileLoader } from './application/safety-profile.loader.js';
import { SafetyEvaluator } from './domain/safety-evaluator.js';

@Module({ providers: [SafetyProfileLoader, SafetyEvaluator], exports: [SafetyProfileLoader, SafetyEvaluator] })
export class SafetyModule {}
