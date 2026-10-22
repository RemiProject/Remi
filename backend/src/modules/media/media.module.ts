import { Module } from '@nestjs/common';
import { ImageService } from './application/image.service.js';
import { ImageResolver } from './presentation/image.resolver.js';

@Module({ providers: [ImageService, ImageResolver], exports: [ImageService] })
export class MediaModule {}
