import { Module } from '@nestjs/common';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { LoggerModule } from 'nestjs-pino';
import { ReferenceModule } from './modules/reference/reference.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { RecipesModule } from './modules/recipes/recipes.module.js';
import { MealsModule } from './modules/meals/meals.module.js';
import { ShoppingModule } from './modules/shopping/shopping.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { PredictionsModule } from './modules/predictions/predictions.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { AppConfigService } from './platform/config/app-config.service.js';
import { ConfigModule } from './platform/config/config.module.js';
import { DbModule } from './platform/db/db.module.js';
import { depthLimit } from './platform/graphql/depth-limit.js';
import { formatGraphQLError } from './platform/graphql/error-mapper.js';
import { GqlThrottlerGuard } from './platform/graphql/graphql-throttler.guard.js';
import { DecimalScalar, LocalDateScalar } from './platform/graphql/scalars.js';
import { MailModule } from './platform/mail/mail.module.js';
import { HealthController } from './platform/observability/health.controller.js';
import { OutboxModule } from './platform/outbox/outbox.module.js';
import { StorageModule } from './platform/storage/storage.module.js';
import { TenancyModule } from './platform/tenancy/tenancy.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (c: AppConfigService) => ({
        pinoHttp: {
          level: c.env.LOG_LEVEL,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: { ignore: (req: any) => req.url?.startsWith('/health') },
        },
      }),
    }),
    CqrsModule.forRoot(),
    DbModule,
    OutboxModule,
    MailModule,
    StorageModule,
    TenancyModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (c: AppConfigService) => [{ name: 'default', ttl: c.env.THROTTLE_TTL_SEC * 1000, limit: c.env.THROTTLE_LIMIT }],
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [AppConfigService],
      useFactory: (c: AppConfigService) => ({
        autoSchemaFile: true,
        sortSchema: true,
        introspection: c.env.GRAPHQL_INTROSPECTION,
        playground: false,
        plugins: c.isProduction ? [] : [ApolloServerPluginLandingPageLocalDefault({ embed: true })],
        validationRules: [depthLimit(c.env.GRAPHQL_DEPTH_LIMIT)],
        formatError: formatGraphQLError,
        context: ({ req, res }: any) => ({ req, res }),
      }),
    }),
    ReferenceModule,
    IdentityModule,
    CatalogModule,
    InventoryModule,
    RecipesModule,
    MealsModule,
    ShoppingModule,
    ProfileModule,
    PredictionsModule,
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [LocalDateScalar, DecimalScalar, { provide: APP_GUARD, useClass: GqlThrottlerGuard }],
})
export class AppModule {}
