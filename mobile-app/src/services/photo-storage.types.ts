export interface PhotoStorage {
  save(uri: string): Promise<string>;
  resolve(ref: string): Promise<string | null>;
  release(uri: string): void;
  remove(ref: string): Promise<void>;
}
