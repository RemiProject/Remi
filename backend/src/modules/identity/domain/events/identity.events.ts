import type { IEvent } from '@nestjs/cqrs';

/** In-process domain events, published on the EventBus AFTER the transaction commits. Add side effects by adding an @EventsHandler. */
export class UserRegisteredEvent implements IEvent { constructor(public readonly userId: string, public readonly email: string) {} }
export class EmailVerifiedEvent implements IEvent { constructor(public readonly userId: string) {} }
export class PasswordChangedEvent implements IEvent { constructor(public readonly userId: string) {} }
export class HouseholdCreatedEvent implements IEvent { constructor(public readonly householdId: string, public readonly ownerUserId: string) {} }
export class MemberInvitedEvent implements IEvent { constructor(public readonly householdId: string, public readonly invitationId: string, public readonly email: string) {} }
export class MemberJoinedEvent implements IEvent { constructor(public readonly householdId: string, public readonly userId: string) {} }
export class MemberLeftEvent implements IEvent { constructor(public readonly householdId: string, public readonly userId: string, public readonly removedBy?: string) {} }
export class InvitationRevokedEvent implements IEvent { constructor(public readonly householdId: string, public readonly invitationId: string) {} }
