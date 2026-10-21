import { Injectable } from '@nestjs/common';
import { parseEnv, type Env } from './env.schema.js';

/** Typed, validated access to the environment. The app refuses to boot when the env is invalid. */
@Injectable()
export class AppConfigService {
  readonly env: Env = parseEnv(process.env);

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get corsOrigins(): string[] {
    return this.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  }

  get allowedImageMime(): string[] {
    return this.env.IMAGE_ALLOWED_MIME.split(',').map((s) => s.trim()).filter(Boolean);
  }
}
