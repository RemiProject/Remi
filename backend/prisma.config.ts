import { defineConfig } from 'prisma/config';

// Prisma is only a query client here: SQL migrations in prisma/migrations are the source of truth.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://kitchen:change-me-dev-only@localhost:5432/ai_kitchen' },
});
