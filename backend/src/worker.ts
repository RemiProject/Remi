import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

/**
 * Background entry point (guide B18.2): outbox poller, delivery/embedding workers and periodic jobs,
 * with no HTTP server. Scale it independently of the API; run API replicas with RUN_BACKGROUND_JOBS=false.
 */
async function bootstrap() {
  try {
    process.loadEnvFile('.env'); // dev convenience; real env vars always win in containers
  } catch {
    /* no .env file */
  }
  process.env.RUN_BACKGROUND_JOBS = 'true';
  process.env.GRAPHQL_EMIT_SCHEMA = 'false'; // the API owns schema.graphql

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks(); // SIGTERM lets the poller finish its batch and clears every timer
  app.get(Logger).log('worker started');
}

void bootstrap();
