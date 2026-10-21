import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import type { PasswordHasherPort } from '@/modules/identity/domain/ports/password-hasher.port.js';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
