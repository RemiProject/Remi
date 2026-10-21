import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import {
  EmailVerifiedEvent, HouseholdCreatedEvent, InvitationRevokedEvent, MemberInvitedEvent, MemberJoinedEvent, MemberLeftEvent, PasswordChangedEvent, UserRegisteredEvent,
} from '@/modules/identity/domain/events/identity.events.js';

type IdentityEvent = UserRegisteredEvent | EmailVerifiedEvent | PasswordChangedEvent | HouseholdCreatedEvent | MemberInvitedEvent | MemberJoinedEvent | MemberLeftEvent | InvitationRevokedEvent;

/**
 * Example subscriber. Add analytics, cache invalidation, notifications… as NEW @EventsHandler classes
 * without touching the command handlers. (Events are best-effort; guaranteed side effects go through the outbox.)
 */
@EventsHandler(UserRegisteredEvent, EmailVerifiedEvent, PasswordChangedEvent, HouseholdCreatedEvent, MemberInvitedEvent, MemberJoinedEvent, MemberLeftEvent, InvitationRevokedEvent)
export class IdentityAuditEventsHandler implements IEventHandler<IdentityEvent> {
  private readonly logger = new Logger('IdentityEvents');

  handle(event: IdentityEvent): void {
    // never log emails/tokens at info level in production; ids only
    const ids = Object.fromEntries(Object.entries(event).filter(([k]) => k.endsWith('Id') || k === 'removedBy'));
    this.logger.log(`${event.constructor.name} ${JSON.stringify(ids)}`);
  }
}
