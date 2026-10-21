import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

interface DataKey { kid: string; key: Buffer }
interface KeyringInput { current: { kid: string; key: string }; previous?: Array<{ kid: string; key: string }> }

/** App-level AES-256-GCM envelope payload. Key material must be injected by the runtime secret manager. */
export class NotesCipher {
  private readonly current?: DataKey;
  private readonly keys = new Map<string, Buffer>();

  constructor(serializedKeyring = process.env.PROFILE_NOTES_KEYRING) {
    if (!serializedKeyring) return;
    let parsed: KeyringInput;
    try { parsed = JSON.parse(serializedKeyring) as KeyringInput; }
    catch { throw new Error('PROFILE_NOTES_KEYRING must be valid JSON.'); }
    const entries = [parsed.current, ...(parsed.previous ?? [])];
    if (!parsed.current || !Array.isArray(parsed.previous ?? [])) throw new Error('PROFILE_NOTES_KEYRING must contain current and optional previous data keys.');
    for (const entry of entries) {
      if (!entry || !/^[a-zA-Z0-9_-]{1,32}$/.test(entry.kid)) throw new Error('Profile notes key ids must be 1 to 32 URL-safe characters.');
      const key = Buffer.from(entry.key, 'base64url');
      if (key.length !== 32 || this.keys.has(entry.kid)) throw new Error('Each profile notes key must be unique and decode to exactly 32 bytes.');
      this.keys.set(entry.kid, key);
    }
    this.current = { kid: parsed.current.kid, key: this.keys.get(parsed.current.kid)! };
  }

  encrypt(value: string | null | undefined, table: 'UserAllergy' | 'UserHealthCondition', rowId: string, userId: string): string | null {
    if (value == null) return null;
    if (!this.current) throw new Error('Health notes are disabled until PROFILE_NOTES_KEYRING is provided by the secret manager.');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.current.key, nonce);
    cipher.setAAD(this.aad(table, rowId, userId));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return `enc:v1:${this.current.kid}:${nonce.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  decrypt(value: string | null, table: 'UserAllergy' | 'UserHealthCondition', rowId: string, userId: string): string | null {
    if (value == null) return null;
    try {
      const [prefix, version, kid, nonceText, ciphertextText, extra] = value.split(':');
      const key = this.keys.get(kid);
      if (prefix !== 'enc' || version !== 'v1' || extra !== undefined || !key) throw new Error('invalid key or envelope');
      const nonce = Buffer.from(nonceText, 'base64url');
      const data = Buffer.from(ciphertextText, 'base64url');
      if (nonce.length !== 12 || data.length < 16) throw new Error('invalid envelope');
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(this.aad(table, rowId, userId));
      decipher.setAuthTag(data.subarray(data.length - 16));
      return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Health note could not be authenticated or decrypted.');
    }
  }

  private aad(table: string, rowId: string, userId: string): Buffer {
    return Buffer.from(`${table}|notes|${rowId}|${userId}`, 'utf8');
  }
}
