import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/client.js';
import { AppConfigService } from '@/platform/config/app-config.service.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly config: AppConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.env.DATABASE_URL,
        max: config.env.DB_POOL_MAX,
        statement_timeout: config.env.DB_STATEMENT_TIMEOUT_MS,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    if (this.config.env.NODE_ENV === 'production') {
      const [role] = await this.$queryRaw<Array<{ name: string; superuser: boolean; bypassRls: boolean }>>`
        SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS "bypassRls"
        FROM pg_roles r WHERE r.rolname = current_user`;
      if (role.superuser || role.bypassRls) {
        await this.$disconnect();
        throw new Error(`Unsafe PostgreSQL runtime role "${role.name}": production DATABASE_URL must not use a superuser or BYPASSRLS role.`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
