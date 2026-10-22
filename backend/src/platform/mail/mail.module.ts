import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { TemplateRenderer } from './template-renderer.js';

@Global()
@Module({ providers: [TemplateRenderer, MailService], exports: [MailService, TemplateRenderer] })
export class MailModule {}
