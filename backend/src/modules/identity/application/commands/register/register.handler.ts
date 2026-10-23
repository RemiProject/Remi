import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OutboxPublisher } from '@/platform/outbox/outbox.publisher.js';
import { isUniqueViolation } from '@/shared/db-errors.js';
import { newId } from '@/shared/ids.js';
import { normalizeEmail } from '@/shared/normalize-email.js';
import { isValidTimezone } from '@/shared/timezone.js';
import { ResolveRegistrationReferencesQuery } from '@/modules/reference/application/queries/resolve-registration-references/resolve-registration-references.query.js';
import { UserRegisteredEvent } from '@/modules/identity/domain/events/identity.events.js';
import { OutboxTopics } from '@/modules/identity/domain/outbox-topics.js';
import { EmailAlreadyRegisteredError, InvalidTimezoneError, ReferenceNotFoundError } from '@/modules/identity/domain/services/identity.errors.js';
import { PASSWORD_HASHER, type PasswordHasherPort } from '@/modules/identity/domain/ports/password-hasher.port.js';
import { TOKEN_REPOSITORY, type TokenRepository } from '@/modules/identity/domain/ports/token.repository.js';
import { USER_REPOSITORY, type UserRepository } from '@/modules/identity/domain/ports/user.repository.js';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { LinkBuilder } from '@/modules/identity/application/services/link-builder.js';
import { OneTimeTokenService } from '@/modules/identity/application/services/one-time-token.service.js';
import { RegisterCommand } from './register.command.js';
import { assertStrongPassword, normalizeUsername, isValidUsername, isSupportedMobile } from '@/modules/identity/domain/services/registration-policy.js';
import { DomainError } from '@/shared/domain-error.js';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
    private readonly outbox: OutboxPublisher,
    private readonly tokens: OneTimeTokenService,
    private readonly links: LinkBuilder,
    private readonly config: AppConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_REPOSITORY) private readonly tokenRepo: TokenRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(cmd: RegisterCommand): Promise<{ userId: string }> {
    assertStrongPassword(cmd.password);
    const username = normalizeUsername(cmd.username);
    if (!isValidUsername(username)) throw new DomainError('INVALID_USERNAME', 'Username must be 3–30 letters, numbers or underscores, starting with a letter.', 400);
    if (!isSupportedMobile(cmd.phoneNumber)) throw new DomainError('INVALID_PHONE', 'Enter a valid Egyptian or Saudi mobile number in international format.', 400);
    const countryCode = cmd.countryCode ?? (cmd.phoneNumber.startsWith('+20') ? 'EG' : 'SA');
    const localeCode = cmd.localeCode ?? (cmd.languageCode === 'ar' ? 'ar-EG' : 'en-US');
    const timezone = cmd.timezone ?? (countryCode === 'EG' ? 'Africa/Cairo' : countryCode === 'SA' ? 'Asia/Riyadh' : 'UTC');
    if (!isValidTimezone(timezone)) throw new InvalidTimezoneError();
    const refs = await this.queryBus.execute(new ResolveRegistrationReferencesQuery(countryCode, localeCode, cmd.languageCode));
    if (!refs) throw new ReferenceNotFoundError('country, locale or language');

    const email = normalizeEmail(cmd.email);
    const passwordHash = await this.hasher.hash(cmd.password); // CPU work stays outside the TX
    const userId = newId();
    const issued = this.tokens.issue('EMAIL_VERIFY', userId);

    try {
      await this.tx.run(async (tx) => {
        await this.users.create(tx, {
          id: userId, email, username, phoneNumber: cmd.phoneNumber, passwordHash, name: cmd.name.trim(), timezone,
          countryId: refs.countryId, localeId: refs.localeId, preferredLanguageId: refs.languageId,
        });
        await this.tokenRepo.insert(tx, issued.row);
        await this.outbox.publish(tx, {
          topic: OutboxTopics.EmailVerifyRequested,
          dedupeKey: issued.row.id,
          payload: {
            tokenId: issued.row.id,
            to: email,
            name: cmd.name.trim(),
            lang: refs.languageCode,
            verifyUrl: this.links.verifyEmail(issued.raw),
            expiresInHours: this.config.env.EMAIL_VERIFY_TTL_HOURS,
          },
        });
      }, { userId });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const conflict = err as { constraint?: string; meta?: unknown };
        const usernameConflict = /username/i.test(`${conflict.constraint ?? ''} ${JSON.stringify(conflict.meta ?? {})}`);
        if (usernameConflict || await this.users.findByUsername(this.tx.db, username)) throw new DomainError('USERNAME_TAKEN', 'This username is already taken.', 409);
        throw new EmailAlreadyRegisteredError();
      }
      throw err;
    }

    this.eventBus.publish(new UserRegisteredEvent(userId, email));
    return { userId };
  }
}
