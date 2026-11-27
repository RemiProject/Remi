import { Command } from '@nestjs/cqrs';

export type EmailVerificationCodeLookupOutcome = 'queued' | 'not-sent';

/** `lookupId` is the outbox row holding `email`; its payload is blanked in the same transaction. */
export class ProcessEmailVerificationCodeLookupCommand extends Command<{ outcome: EmailVerificationCodeLookupOutcome }> {
  constructor(public readonly lookupId: bigint, public readonly email: string) { super(); }
}
