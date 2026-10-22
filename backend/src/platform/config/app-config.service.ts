import { Injectable } from '@nestjs/common';
import { parseEnv, type Env } from './env.schema.js';

/** Typed, validated access to the environment. The app refuses to boot when the env is invalid. */
@Injectable()
export class AppConfigService {
  readonly env: Env = parseEnv(process.env);

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** Pollers, workers and periodic jobs run only where this is true (see src/worker.ts). */
  get runsBackgroundJobs(): boolean {
    return this.env.RUN_BACKGROUND_JOBS;
  }

  get emitsGraphqlSchema(): boolean {
    return this.env.GRAPHQL_EMIT_SCHEMA ?? !this.isProduction;
  }

  get corsOrigins(): string[] {
    return this.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  }

  get allowedImageMime(): string[] {
    return this.env.IMAGE_ALLOWED_MIME.split(',').map((s) => s.trim()).filter(Boolean);
  }
}
