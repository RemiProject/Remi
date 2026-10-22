import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import type { ObjectHead, ObjectStorage, PresignPutInput } from './object-storage.port.js';

/**
 * Two clients on purpose: `internal` (server -> S3) and `public` (signs URLs for the host the BROWSER uses).
 * Works against AWS S3 in production and SeaweedFS locally by changing env only.
 */
@Injectable()
export class S3ObjectStorage implements ObjectStorage, OnModuleInit {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly internal: S3Client;
  private readonly public: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: AppConfigService) {
    const e = config.env;
    this.bucket = e.S3_BUCKET;
    const base = {
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials:
        e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
          : undefined,
    };
    this.internal = new S3Client({ ...base, endpoint: e.S3_ENDPOINT });
    this.public = new S3Client({ ...base, endpoint: e.S3_PUBLIC_ENDPOINT ?? e.S3_ENDPOINT });
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.env.S3_AUTO_CREATE_BUCKET) return;
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`created bucket ${this.bucket}`);
      } catch (err) {
        this.logger.warn(`could not create bucket ${this.bucket}: ${(err as Error).message}`);
      }
    }
  }

  presignPut(input: PresignPutInput): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    return getSignedUrl(this.public, cmd, { expiresIn: input.expiresInSec });
  }

  presignGet(key: string, expiresInSec: number): Promise<string> {
    return getSignedUrl(this.public, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSec });
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const out = await this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { contentLength: Number(out.ContentLength ?? 0), contentType: out.ContentType };
    } catch (err) {
      if ((err as any)?.$metadata?.httpStatusCode === 404 || (err as any)?.name === 'NotFound') return null;
      throw err;
    }
  }

  async readFirstBytes(key: string, count: number): Promise<Uint8Array> {
    const out = await this.internal.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${count - 1}` }));
    return out.Body ? await out.Body.transformToByteArray() : new Uint8Array();
  }

  async delete(key: string): Promise<void> {
    await this.internal.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
