import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NotesCipher } from '@/modules/safety/infrastructure/notes-cipher.js';

describe('NotesCipher', () => {
  const key = randomBytes(32).toString('base64url');
  const cipher = new NotesCipher(JSON.stringify({ current: { kid: 'test-key', key } }));

  it('round trips with row-bound authenticated data and uses a fresh nonce', () => {
    const first = cipher.encrypt('requires emergency medicine', 'UserAllergy', 'row-1', 'user-1')!;
    const second = cipher.encrypt('requires emergency medicine', 'UserAllergy', 'row-1', 'user-1')!;
    expect(first).not.toBe(second);
    expect(cipher.decrypt(first, 'UserAllergy', 'row-1', 'user-1')).toBe('requires emergency medicine');
    expect(() => cipher.decrypt(first, 'UserAllergy', 'row-2', 'user-1')).toThrow(/authenticated/);
    expect(() => cipher.decrypt(first, 'UserAllergy', 'row-1', 'user-2')).toThrow(/authenticated/);
  });

  it('refuses health notes when no keyring is configured', () => {
    expect(() => new NotesCipher(undefined).encrypt('private note', 'UserHealthCondition', 'row', 'user'))
      .toThrow(/PROFILE_NOTES_KEYRING/);
  });
});
