import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GqlAuthGuard } from './gql-auth.guard.js';
import { HouseholdGuard } from './household.guard.js';
import { JwtTokensService } from './jwt-tokens.service.js';
import { RolesGuard } from './roles.guard.js';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtTokensService, GqlAuthGuard, HouseholdGuard, RolesGuard],
  exports: [JwtTokensService, GqlAuthGuard, HouseholdGuard, RolesGuard],
})
export class TenancyModule {}
