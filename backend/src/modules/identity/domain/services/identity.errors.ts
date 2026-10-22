import { DomainError } from '@/shared/domain-error.js';

export class InvalidCredentialsError extends DomainError { constructor() { super('INVALID_CREDENTIALS', 'Invalid email or password', 401); } }
export class EmailNotVerifiedError extends DomainError { constructor() { super('EMAIL_NOT_VERIFIED', 'Please verify your email first', 403); } }
export class EmailAlreadyRegisteredError extends DomainError { constructor() { super('EMAIL_ALREADY_REGISTERED', 'Email is already registered', 409); } }
export class InvalidTokenError extends DomainError { constructor() { super('INVALID_OR_EXPIRED_TOKEN', 'Token is invalid, expired or already used', 422); } }
export class ReferenceNotFoundError extends DomainError { constructor(what: string) { super('REFERENCE_NOT_FOUND', `Unknown ${what}`, 422); } }
export class InvalidTimezoneError extends DomainError { constructor() { super('INVALID_TIMEZONE', 'Timezone must be a valid IANA zone', 422); } }
export class UserNotFoundError extends DomainError { constructor() { super('USER_NOT_FOUND', 'User not found', 404); } }
export class NotHouseholdOwnerError extends DomainError { constructor() { super('NOT_HOUSEHOLD_OWNER', 'Only the household owner can do this', 403); } }
export class NotHouseholdMemberError extends DomainError { constructor() { super('NOT_HOUSEHOLD_MEMBER', 'Not an active member of this household', 403); } }
export class AlreadyMemberError extends DomainError { constructor() { super('ALREADY_MEMBER', 'This person is already a member of the household', 409); } }
export class InvitationAlreadyOpenError extends DomainError { constructor() { super('INVITATION_ALREADY_OPEN', 'An open invitation already exists for this email', 409); } }
export class InvitationNotFoundError extends DomainError { constructor() { super('INVITATION_NOT_FOUND', 'Invitation not found', 404); } }
export class InvitationNotUsableError extends DomainError { constructor() { super('INVITATION_NOT_USABLE', 'Invitation was already used, revoked or expired', 422); } }
export class InvitationEmailMismatchError extends DomainError { constructor() { super('INVITATION_EMAIL_MISMATCH', 'This invitation was sent to a different email', 403); } }
export class MemberNotFoundError extends DomainError { constructor() { super('MEMBER_NOT_FOUND', 'Member not found', 404); } }
export class CannotRemoveOwnerError extends DomainError { constructor() { super('CANNOT_REMOVE_OWNER', 'The owner cannot be removed', 422); } }
export class CannotTransferToSelfError extends DomainError { constructor() { super('CANNOT_TRANSFER_TO_SELF', 'You already own this household', 422); } }
export class OwnerCannotLeaveError extends DomainError { constructor() { super('OWNER_CANNOT_LEAVE', 'The owner cannot leave the household', 422); } }
