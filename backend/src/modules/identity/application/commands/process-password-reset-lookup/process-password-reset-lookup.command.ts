import { Command } from '@nestjs/cqrs';

export type PasswordResetLookupOutcome = 'queued-with-code' | 'queued-link-only' | 'not-sent';

/** `lookupId` is the outbox row holding `email`; its payload is blanked in the same transaction. */
export class ProcessPasswordResetLookupCommand extends Command<{ outcome: PasswordResetLookupOutcome }> {
  constructor(public readonly lookupId: bigint, public readonly email: string) { super(); }
}
