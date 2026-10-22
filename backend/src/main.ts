import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AppConfigService } from './platform/config/app-config.service.js';

async function bootstrap() {
  try {
    process.loadEnvFile('.env'); // dev convenience; real env vars always win in containers
  } catch {
    /* no .env file */
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks(); // drains requests and lets the outbox poller finish its batch

  await app.listen(config.env.PORT, '0.0.0.0');
}

void bootstrap();
