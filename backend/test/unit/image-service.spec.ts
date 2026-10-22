import { describe, expect, it, vi } from 'vitest';
import { ImageService } from '@/modules/media/application/image.service.js';
import type { ObjectStorage } from '@/platform/storage/object-storage.port.js';
import { fakeConfig } from '../support/fakes.js';

const HH = '0190aaaa-0000-7000-8000-000000000001';
const KEY = `households/${HH}/images/0190bbbb-0000-7000-8000-000000000002`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const config = fakeConfig({ IMAGE_MAX_BYTES: 1000, IMAGE_PRESIGN_TTL_SEC: 60, IMAGE_ALLOWED_MIME: 'image/jpeg,image/png' });

/** In-memory Image table: $queryRaw returns stored rows, $executeRaw inserts (ON CONFLICT DO NOTHING). */
function setup(head: { contentLength: number } | null, firstBytes = JPEG) {
  const rows: any[] = [];
  const tx = {
    $queryRaw: vi.fn(async () => rows.slice()),
    $executeRaw: vi.fn(async (_s: TemplateStringsArray, id: string, _hh: string, _user: string, type: string, key: string, mimeType: string, size: number) => {
      if (!rows.length) rows.push({ id, type, storageKey: key, mimeType, sizeBytes: BigInt(size), createdAt: new Date() });
      return 1;
    }),
  };
  const runner = { run: vi.fn(async (fn: (t: any) => any) => fn(tx)) } as any;
  const storage: ObjectStorage = {
    presignPut: vi.fn(async () => 'https://s3/put'),
    presignGet: vi.fn(async () => 'https://s3/get'),
    head: vi.fn(async () => head),
    readFirstBytes: vi.fn(async () => firstBytes),
    delete: vi.fn(async () => undefined),
  };
  return { service: new ImageService(runner, config, storage), storage, tx };
}

describe('ImageService.confirmUpload', () => {
  it('records a real jpeg once and returns the same image on retry', async () => {
    const { service, tx } = setup({ contentLength: 500 });
    const first = await service.confirmUpload(HH, 'u1', KEY, 'FOOD');
    const second = await service.confirmUpload(HH, 'u1', KEY, 'FOOD');
    expect(first).toMatchObject({ mimeType: 'image/jpeg', sizeBytes: 500, url: 'https://s3/get' });
    expect(second.id).toBe(first.id);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('refuses to confirm before the bytes are uploaded', async () => {
    const { service } = setup(null);
    await expect(service.confirmUpload(HH, 'u1', KEY, 'FOOD')).rejects.toMatchObject({ code: 'IMAGE_NOT_UPLOADED' });
  });

  it('deletes and rejects a non-image disguised as one', async () => {
    const { service, storage } = setup({ contentLength: 10 }, new TextEncoder().encode('%PDF-1.7 xxxx'));
    await expect(service.confirmUpload(HH, 'u1', KEY, 'FOOD')).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    expect(storage.delete).toHaveBeenCalledWith(KEY);
  });

  it('deletes and rejects an upload larger than the limit', async () => {
    const { service, storage } = setup({ contentLength: 5000 });
    await expect(service.confirmUpload(HH, 'u1', KEY, 'FOOD')).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    expect(storage.delete).toHaveBeenCalledWith(KEY);
  });

  it("never touches another household's key", async () => {
    const { service, storage } = setup({ contentLength: 500 });
    await expect(service.confirmUpload(HH, 'u1', 'households/other/images/x', 'FOOD')).rejects.toMatchObject({ code: 'IMAGE_NOT_FOUND' });
    expect(storage.head).not.toHaveBeenCalled();
  });
});
