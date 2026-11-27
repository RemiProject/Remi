import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OutboxHandler, type OutboxHandlerPort, type OutboxMessage } from '@/platform/outbox/outbox-handler.decorator.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { ProcessPasswordResetLookupCommand } from '@/modules/identity/application/commands/process-password-reset-lookup/process-password-reset-lookup.command.js';

/** Idempotent: a retry finds the email already blanked, or the cooldown, and sends nothing more. */
@Injectable()
@OutboxHandler(OutboxTopics.PasswordResetLookup)
export class PasswordResetLookupHandler implements OutboxHandlerPort<{ email?: unknown }> {
  constructor(private readonly commands: CommandBus) {}

  async handle({ id, payload }: OutboxMessage<{ email?: unknown }>): Promise<void> {
    const email = typeof payload?.email === 'string' ? payload.email : '';
    await this.commands.execute(new ProcessPasswordResetLookupCommand(id, email));
  }
}
