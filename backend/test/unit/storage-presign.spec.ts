import { afterEach, expect, it, vi } from 'vitest';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { S3ObjectStorage } from '@/platform/storage/s3-object-storage.js';

afterEach(() => vi.unstubAllEnvs());
it('presigns the future upload size without binding it to an empty-body checksum', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');
  vi.stubEnv('JWT_ACCESS_SECRET', 'test-access-secret-at-least-32-characters');
  vi.stubEnv('JWT_REFRESH_SECRET', 'test-refresh-secret-at-least-32-characters');
  vi.stubEnv('S3_BUCKET', 'cookbook-test');
  vi.stubEnv('S3_ENDPOINT', 'http://localhost:8333');
  vi.stubEnv('S3_PUBLIC_ENDPOINT', 'http://localhost:8333');
  vi.stubEnv('S3_ACCESS_KEY_ID', 'test-key');
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test-secret');
  vi.stubEnv('S3_FORCE_PATH_STYLE', 'true');
  const storage = new S3ObjectStorage(new AppConfigService());
  const url = new URL(await storage.presignPut({ key: 'test/image.png', contentType: 'image/png', contentLength: 123, expiresInSec: 60 }));
  expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  expect(url.pathname).toBe('/cookbook-test/test/image.png');
});
