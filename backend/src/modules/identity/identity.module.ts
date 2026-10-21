import { Module } from '@nestjs/common';
import { AcceptInvitationHandler } from './application/commands/accept-invitation/accept-invitation.handler.js';
import { CreateHouseholdHandler } from './application/commands/create-household/create-household.handler.js';
import { InviteMemberHandler } from './application/commands/invite-member/invite-member.handler.js';
import { LeaveHouseholdHandler } from './application/commands/leave-household/leave-household.handler.js';
import { LoginHandler } from './application/commands/login/login.handler.js';
import { LogoutAllHandler } from './application/commands/logout-all/logout-all.handler.js';
import { LogoutHandler } from './application/commands/logout/logout.handler.js';
import { RefreshAccessTokenHandler } from './application/commands/refresh-access-token/refresh-access-token.handler.js';
import { RegisterHandler } from './application/commands/register/register.handler.js';
import { RemoveMemberHandler } from './application/commands/remove-member/remove-member.handler.js';
import { RequestPasswordResetHandler } from './application/commands/request-password-reset/request-password-reset.handler.js';
import { ResetPasswordHandler } from './application/commands/reset-password/reset-password.handler.js';
import { RevokeInvitationHandler } from './application/commands/revoke-invitation/revoke-invitation.handler.js';
import { VerifyEmailHandler } from './application/commands/verify-email/verify-email.handler.js';
import { IdentityAuditEventsHandler } from './application/identity-audit.events-handler.js';
import { GetActiveMembershipHandler } from './application/queries/get-active-membership/get-active-membership.handler.js';
import { IsSessionActiveHandler } from './application/queries/is-session-active/is-session-active.handler.js';
import { GetMeHandler } from './application/queries/get-me/get-me.handler.js';
import { ListHouseholdInvitationsHandler } from './application/queries/list-household-invitations/list-household-invitations.handler.js';
import { ListHouseholdMembersHandler } from './application/queries/list-household-members/list-household-members.handler.js';
import { ListMyHouseholdsHandler } from './application/queries/list-my-households/list-my-households.handler.js';
import { LinkBuilder } from './application/services/link-builder.js';
import { OneTimeTokenService } from './application/services/one-time-token.service.js';
import { HOUSEHOLD_INVITATION_REPOSITORY } from './domain/ports/household-invitation.repository.js';
import { HOUSEHOLD_MEMBER_REPOSITORY } from './domain/ports/household-member.repository.js';
import { HOUSEHOLD_REPOSITORY } from './domain/ports/household.repository.js';
import { PASSWORD_HASHER } from './domain/ports/password-hasher.port.js';
import { SESSION_REPOSITORY } from './domain/ports/session.repository.js';
import { TOKEN_REPOSITORY } from './domain/ports/token.repository.js';
import { TOKEN_SIGNER } from './domain/ports/token-signer.port.js';
import { USER_REPOSITORY } from './domain/ports/user.repository.js';
import { Argon2PasswordHasher } from './infrastructure/adapters/argon2-password-hasher.js';
import { JwtTokenSigner } from './infrastructure/adapters/jwt-token-signer.js';
import { SendHouseholdInvitationEmailHandler } from './infrastructure/handlers/send-household-invitation-email.handler.js';
import { SendPasswordChangedEmailHandler } from './infrastructure/handlers/send-password-changed-email.handler.js';
import { SendPasswordResetEmailHandler } from './infrastructure/handlers/send-password-reset-email.handler.js';
import { SendVerificationEmailHandler } from './infrastructure/handlers/send-verification-email.handler.js';
import { PrismaHouseholdInvitationRepository } from './infrastructure/repositories/prisma-household-invitation.repository.js';
import { PrismaHouseholdMemberRepository } from './infrastructure/repositories/prisma-household-member.repository.js';
import { PrismaHouseholdRepository } from './infrastructure/repositories/prisma-household.repository.js';
import { PrismaSessionRepository } from './infrastructure/repositories/prisma-session.repository.js';
import { PrismaTokenRepository } from './infrastructure/repositories/prisma-token.repository.js';
import { PrismaUserRepository } from './infrastructure/repositories/prisma-user.repository.js';
import { AuthResolver } from './presentation/resolvers/auth.resolver.js';
import { HouseholdResolver } from './presentation/resolvers/household.resolver.js';
import { InvitationResolver } from './presentation/resolvers/invitation.resolver.js';

const CommandHandlers = [
  RegisterHandler,
  LoginHandler,
  RefreshAccessTokenHandler,
  LogoutHandler,
  LogoutAllHandler,
  VerifyEmailHandler,
  RequestPasswordResetHandler,
  ResetPasswordHandler,
  CreateHouseholdHandler,
  InviteMemberHandler,
  AcceptInvitationHandler,
  RevokeInvitationHandler,
  RemoveMemberHandler,
  LeaveHouseholdHandler,
];
const QueryHandlers = [
  GetMeHandler,
  ListMyHouseholdsHandler,
  ListHouseholdMembersHandler,
  ListHouseholdInvitationsHandler,
  GetActiveMembershipHandler,
  IsSessionActiveHandler,
];
const EventHandlers = [IdentityAuditEventsHandler];
const OutboxHandlers = [
  SendVerificationEmailHandler,
  SendPasswordResetEmailHandler,
  SendPasswordChangedEmailHandler,
  SendHouseholdInvitationEmailHandler,
];

@Module({
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    ...OutboxHandlers,
    OneTimeTokenService,
    LinkBuilder,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: TOKEN_REPOSITORY, useClass: PrismaTokenRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: HOUSEHOLD_REPOSITORY, useClass: PrismaHouseholdRepository },
    { provide: HOUSEHOLD_MEMBER_REPOSITORY, useClass: PrismaHouseholdMemberRepository },
    { provide: HOUSEHOLD_INVITATION_REPOSITORY, useClass: PrismaHouseholdInvitationRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_SIGNER, useClass: JwtTokenSigner },
    AuthResolver,
    HouseholdResolver,
    InvitationResolver,
  ],
})
export class IdentityModule {}
