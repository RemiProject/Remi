import { UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE } from '@/platform/graphql/throttle.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { AcceptInvitationCommand } from '@/modules/identity/application/commands/accept-invitation/accept-invitation.command.js';
import { LoginCommand } from '@/modules/identity/application/commands/login/login.command.js';
import { LogoutAllCommand } from '@/modules/identity/application/commands/logout-all/logout-all.command.js';
import { LogoutCommand } from '@/modules/identity/application/commands/logout/logout.command.js';
import { RefreshAccessTokenCommand } from '@/modules/identity/application/commands/refresh-access-token/refresh-access-token.command.js';
import { RegisterCommand } from '@/modules/identity/application/commands/register/register.command.js';
import { RequestPasswordResetCommand } from '@/modules/identity/application/commands/request-password-reset/request-password-reset.command.js';
import { ResetPasswordCommand } from '@/modules/identity/application/commands/reset-password/reset-password.command.js';
import { VerifyEmailCommand } from '@/modules/identity/application/commands/verify-email/verify-email.command.js';
import { GetMeQuery } from '@/modules/identity/application/queries/get-me/get-me.query.js';
import {
  LoginInput,
  LogoutInput,
  RefreshAccessTokenInput,
  RegisterInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  TokenInput,
} from '@/modules/identity/presentation/inputs/identity.inputs.js';
import { AuthTokensType, MeType, RegisterResultType } from '@/modules/identity/presentation/types/identity.types.js';

/** Resolvers only translate GraphQL <-> commands/queries. No business logic here. */
@Resolver()
export class AuthResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Throttle(AUTH_THROTTLE)
  @Mutation(() => RegisterResultType)
  register(@Args('input') i: RegisterInput) {
    return this.commandBus.execute(
      new RegisterCommand(i.email, i.password, i.name, i.countryCode, i.localeCode, i.timezone, i.languageCode),
    );
  }

  @Throttle(AUTH_THROTTLE)
  @Mutation(() => AuthTokensType)
  login(@Args('input') i: LoginInput, @Context() ctx: { req?: { headers?: Record<string, string | string[] | undefined> } }) {
    const ua = ctx?.req?.headers?.['user-agent'];
    const userAgent = typeof ua === 'string' ? ua.slice(0, 512) : null;
    return this.commandBus.execute(new LoginCommand(i.email, i.password, userAgent));
  }

  @Throttle(AUTH_THROTTLE)
  @Mutation(() => AuthTokensType, {
    description: 'Rotates the refresh token and returns a new access + refresh pair (Session-backed).',
  })
  refreshAccessToken(@Args('input') i: RefreshAccessTokenInput) {
    return this.commandBus.execute(new RefreshAccessTokenCommand(i.refreshToken));
  }

  @Throttle(AUTH_THROTTLE)
  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean, { description: 'Revoke the session for the given refresh token (this device).' })
  async logout(@Ctx() ctx: RequestContext, @Args('input') i: LogoutInput) {
    await this.commandBus.execute(new LogoutCommand(ctx.userId, i.refreshToken));
    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean, { description: 'Revoke every active session for the current user.' })
  async logoutAll(@Ctx() ctx: RequestContext) {
    await this.commandBus.execute(new LogoutAllCommand(ctx.userId));
    return true;
  }

  @Throttle(AUTH_THROTTLE)
  @Mutation(() => Boolean)
  async verifyEmail(@Args('input') i: TokenInput) {
    await this.commandBus.execute(new VerifyEmailCommand(i.token));
    return true;
  }

  @Throttle(AUTH_THROTTLE)
  @Mutation(() => Boolean)
  async requestPasswordReset(@Args('input') i: RequestPasswordResetInput) {
    await this.commandBus.execute(new RequestPasswordResetCommand(i.email));
    return true;
  }

  @Throttle(AUTH_THROTTLE)
  @Mutation(() => Boolean)
  async resetPassword(@Args('input') i: ResetPasswordInput) {
    await this.commandBus.execute(new ResetPasswordCommand(i.token, i.newPassword));
    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => MeType)
  me(@Ctx() ctx: RequestContext) {
    return this.queryBus.execute(new GetMeQuery(ctx.userId));
  }

  /** Needs only a logged-in user (the invitee may not be a member of anything yet) — so no HouseholdGuard. */
  @Throttle(AUTH_THROTTLE)
  @UseGuards(GqlAuthGuard)
  @Mutation(() => String, { description: 'Returns the id of the joined household' })
  async acceptInvitation(@Ctx() ctx: RequestContext, @Args('input') i: TokenInput) {
    const { householdId } = await this.commandBus.execute(new AcceptInvitationCommand(ctx.userId, i.token));
    return householdId;
  }
}
