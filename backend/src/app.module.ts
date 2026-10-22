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
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { AppConfigService } from './platform/config/app-config.service.js';
import { ConfigModule } from './platform/config/config.module.js';
import { DbModule } from './platform/db/db.module.js';
import { depthLimit } from './platform/graphql/depth-limit.js';
import { complexityLimit } from './platform/graphql/complexity-limit.js';
import { formatGraphQLError } from './platform/graphql/error-mapper.js';
import { GqlThrottlerGuard } from './platform/graphql/graphql-throttler.guard.js';
import { DecimalScalar, LocalDateScalar } from './platform/graphql/scalars.js';
import { MailModule } from './platform/mail/mail.module.js';
import { HealthController } from './platform/observability/health.controller.js';
import { MetricsService } from './platform/observability/metrics.service.js';
import { MetricsModule } from './platform/observability/metrics.module.js';
import { OutboxModule } from './platform/outbox/outbox.module.js';
import { StorageModule } from './platform/storage/storage.module.js';
import { TenancyModule } from './platform/tenancy/tenancy.module.js';

@Module({
  imports: [
    ConfigModule,
    MetricsModule,
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
      imports: [MetricsModule],
      inject: [AppConfigService, MetricsService],
      useFactory: (c: AppConfigService, metrics: MetricsService) => ({
        // Dev writes the SDL to the repo so mobile/web can run codegen against it; production keeps it in memory.
        autoSchemaFile: c.emitsGraphqlSchema ? 'schema.graphql' : true,
        sortSchema: true,
        introspection: c.env.GRAPHQL_INTROSPECTION,
        playground: false,
        plugins: [...(c.isProduction ? [] : [ApolloServerPluginLandingPageLocalDefault({ embed: true })]), metrics.apolloPlugin()],
        validationRules: [depthLimit(c.env.GRAPHQL_DEPTH_LIMIT), complexityLimit(c.env.GRAPHQL_COMPLEXITY_LIMIT)],
        formatError: formatGraphQLError,
        subscriptions: {
          'graphql-ws': {
            onConnect: ({ connectionParams, extra }: any) => {
              const authorization = connectionParams?.authorization ?? connectionParams?.Authorization;
              if (typeof authorization === 'string' && extra?.request?.headers) extra.request.headers.authorization = authorization;
            },
          },
        },
        context: ({ req, res, extra }: any) => ({ req: req ?? extra?.request, res }),
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
    NotificationsModule,
    MediaModule,
  ],
  controllers: [HealthController],
  providers: [LocalDateScalar, DecimalScalar, { provide: APP_GUARD, useClass: GqlThrottlerGuard }],
})
export class AppModule {}
