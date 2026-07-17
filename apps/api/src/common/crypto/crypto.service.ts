import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Encrypts / decrypts sensitive JSON payloads (e.g. social-account credentials)
 * at rest using AES-256-GCM. The encryption key is derived from the
 * CREDENTIAL_ENCRYPTION_KEY config value via scrypt; if unset, a deterministic
 * dev-only key is derived from JWT_SECRET so the service still boots locally.
 */
@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret =
      config.get<string>('CREDENTIAL_ENCRYPTION_KEY') ??
      config.get<string>('JWT_SECRET') ??
      'dev-only-insecure-key';
    // scrypt derives a 32-byte key from the secret. The salt is fixed on purpose
    // — the output is not used for password hashing, only field encryption.
    this.key = scryptSync(secret, 'content-hub-credential-salt', 32);
  }

  encrypt(value: unknown): string {
    // A fresh random IV per encryption is required for GCM security.
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    const plaintext = JSON.stringify(value);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Layout: iv(16) . authTag(16) . ciphertext, all hex-encoded with markers.
    return ['v1', iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
  }

  decrypt<T = unknown>(payload: string): T {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Unsupported credential encoding');
    }
    const [, ivHex, authTagHex, dataHex] = parts;
    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  }
}
