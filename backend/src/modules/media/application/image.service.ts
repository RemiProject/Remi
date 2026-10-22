import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain-error.js';
import { newId } from '@/shared/ids.js';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { TransactionRunner } from '@/platform/db/transaction-runner.js';
import { OBJECT_STORAGE, type ObjectStorage } from '@/platform/storage/object-storage.port.js';
import { IMAGE_SIGNATURE_BYTES, detectImageMime, imageKeyPrefix } from '@/modules/media/domain/image-signature.js';

export type ImageKind = 'RECEIPT' | 'FOOD' | 'FRESHNESS' | 'OTHER';
type ImageRow = { id: string; type: ImageKind; storageKey: string; mimeType: string; sizeBytes: bigint; createdAt: Date };

@Injectable()
export class ImageService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly config: AppConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Step 1: hand out a short-lived PUT URL. No row is written until the upload is confirmed. */
  async requestUpload(householdId: string, mimeType: string, sizeBytes: number) {
    this.assertAllowed(mimeType, sizeBytes);
    const ttl = this.config.env.IMAGE_PRESIGN_TTL_SEC;
    const storageKey = `${imageKeyPrefix(householdId)}${newId()}`;
    const uploadUrl = await this.storage.presignPut({ key: storageKey, contentType: mimeType, contentLength: sizeBytes, expiresInSec: ttl });
    return { storageKey, uploadUrl, contentType: mimeType, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  /** Step 2: verify the object really exists and really is an image, then record it. Safe to call twice. */
  async confirmUpload(householdId: string, userId: string, storageKey: string, type: ImageKind) {
    if (!storageKey.startsWith(imageKeyPrefix(householdId))) throw new DomainError('IMAGE_NOT_FOUND', 'Image upload not found.', 404);
    const existing = await this.findByKey(householdId, storageKey);
    if (existing) return this.present(existing);

    const head = await this.storage.head(storageKey);
    if (!head) throw new DomainError('IMAGE_NOT_UPLOADED', 'Upload the file to uploadUrl before confirming.', 409);
    const mimeType = detectImageMime(await this.storage.readFirstBytes(storageKey, IMAGE_SIGNATURE_BYTES));
    if (!mimeType || head.contentLength <= 0 || head.contentLength > this.config.env.IMAGE_MAX_BYTES) {
      await this.storage.delete(storageKey);
      throw new DomainError('INVALID_IMAGE', 'The uploaded file is not a supported image or is too large.');
    }

    const id = newId();
    await this.transactions.run((tx) => tx.$executeRaw`
      INSERT INTO "Image" ("id", "householdId", "uploadedByUserId", "type", "storageKey", "mimeType", "sizeBytes")
      VALUES (${id}::uuid, ${householdId}::uuid, ${userId}::uuid, ${type}::"ImageType", ${storageKey}, ${mimeType}, ${head.contentLength})
      ON CONFLICT ("storageKey") DO NOTHING`, { householdId, userId });
    return this.present((await this.findByKey(householdId, storageKey))!);
  }

  async get(householdId: string, id: string) {
    const rows = await this.transactions.run((tx) => tx.$queryRaw<ImageRow[]>`
      SELECT "id", "type", "storageKey", "mimeType", "sizeBytes", "createdAt" FROM "Image"
      WHERE "id" = ${id}::uuid AND "householdId" = ${householdId}::uuid`, { householdId });
    if (!rows[0]) throw new DomainError('IMAGE_NOT_FOUND', 'Image not found.', 404);
    return this.present(rows[0]);
  }

  private findByKey(householdId: string, storageKey: string): Promise<ImageRow | undefined> {
    return this.transactions.run(async (tx) => (await tx.$queryRaw<ImageRow[]>`
      SELECT "id", "type", "storageKey", "mimeType", "sizeBytes", "createdAt" FROM "Image"
      WHERE "storageKey" = ${storageKey} AND "householdId" = ${householdId}::uuid`)[0], { householdId });
  }

  private async present(row: ImageRow) {
    const ttl = this.config.env.IMAGE_PRESIGN_TTL_SEC;
    return { ...row, sizeBytes: Number(row.sizeBytes), url: await this.storage.presignGet(row.storageKey, ttl), urlExpiresAt: new Date(Date.now() + ttl * 1000) };
  }

  private assertAllowed(mimeType: string, sizeBytes: number): void {
    const allowed = this.config.env.IMAGE_ALLOWED_MIME.split(',').map((value) => value.trim());
    if (!allowed.includes(mimeType)) throw new DomainError('UNSUPPORTED_IMAGE_TYPE', `Allowed types: ${allowed.join(', ')}.`);
    if (sizeBytes > this.config.env.IMAGE_MAX_BYTES) throw new DomainError('IMAGE_TOO_LARGE', `Maximum size is ${this.config.env.IMAGE_MAX_BYTES} bytes.`, 413);
  }
}
