import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TemplateRenderer } from './template-renderer.js';

export interface SendMailInput {
  to: string;
  template: string;
  lang: string;
  vars: Record<string, unknown>;
}

/** Called from outbox handlers only (never from inside a DB transaction). */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;

  constructor(
    private readonly config: AppConfigService,
    private readonly renderer: TemplateRenderer,
  ) {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = config.env;
    if (SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      });
    }
  }

  get isConfigured(): boolean { return this.transporter !== undefined; }

  async send(input: SendMailInput): Promise<void> {
    const { subject, html } = this.renderer.render(input.template, input.lang, input.vars);
    if (!this.transporter) {
      // Never log the body: it contains one-time links.
      this.logger.warn(`SMTP_HOST not set; skipping "${subject}" to ${input.to}`);
      return;
    }
    await this.transporter.sendMail({ from: this.config.env.MAIL_FROM, to: input.to, subject, html });
  }
}
