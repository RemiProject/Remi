import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OutboxHandler, type OutboxHandlerPort, type OutboxMessage } from '@/platform/outbox/outbox-handler.decorator.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { ProcessEmailVerificationCodeLookupCommand } from '@/modules/identity/application/commands/process-email-verification-code-lookup/process-email-verification-code-lookup.command.js';

/** Idempotent: a retry finds the email already blanked, or the cooldown, and sends nothing more. */
@Injectable()
@OutboxHandler(OutboxTopics.EmailVerificationCodeLookup)
export class EmailVerificationCodeLookupHandler implements OutboxHandlerPort<{ email?: unknown }> {
  constructor(private readonly commands: CommandBus) {}

  async handle({ id, payload }: OutboxMessage<{ email?: unknown }>): Promise<void> {
    const email = typeof payload?.email === 'string' ? payload.email : '';
    await this.commands.execute(new ProcessEmailVerificationCodeLookupCommand(id, email));
  }
}
