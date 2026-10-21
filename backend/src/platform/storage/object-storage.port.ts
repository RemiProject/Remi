export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PresignPutInput {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSec: number;
}

export interface ObjectHead {
  contentLength: number;
  contentType?: string;
}

export interface ObjectStorage {
  presignPut(input: PresignPutInput): Promise<string>;
  presignGet(key: string, expiresInSec: number): Promise<string>;
  head(key: string): Promise<ObjectHead | null>;
  readFirstBytes(key: string, count: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
