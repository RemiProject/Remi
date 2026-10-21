import { Module } from '@nestjs/common';
import { UnitConverter } from './domain/unit-converter.js';
import { UnitConverter as PublicUnitConverter } from './units.public.js';

@Module({ providers: [UnitConverter], exports: [UnitConverter, PublicUnitConverter] })
export class UnitsModule {}
