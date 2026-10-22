import { Injectable } from '@nestjs/common';
import { MailService } from '@/platform/mail/mail.service.js';
import { OutboxHandler, type OutboxHandlerPort, type OutboxMessage } from '@/platform/outbox/outbox-handler.decorator.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';

@Injectable()
@OutboxHandler(OutboxTopics.PasswordChanged)
export class SendPasswordChangedEmailHandler implements OutboxHandlerPort {
  constructor(private readonly mail: MailService) {}

  async handle({ payload: p }: OutboxMessage): Promise<void> {
    await this.mail.send({ to: p.to, template: 'password-changed', lang: p.lang, vars: { name: p.name, changedAt: p.changedAt, supportEmail: p.supportEmail } });
  }
}
