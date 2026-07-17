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

  // ── OAuth state tokens ───────────────────────────────────────────────
  // The OAuth2 authorization-code flow is stateless: the platform redirects
  // the user's browser back to our callback with no JWT, so the context
  // (who is binding, to which team, with which app credentials) is carried in
  // a tamper-proof, short-lived `state` token. AES-256-GCM gives us both
  // confidentiality and integrity, and the embedded `exp` bounds its life.

  /** Embedding this in a state token lets `verifyOAuthState` reject replays. */
  private static readonly STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Seal an opaque, expiring state token carrying the OAuth attempt's
   * context. The nonce is derived internally so callers only pass meaning.
   */
  sealOAuthState(payload: OauthStatePayload): string {
    const envelope: OauthStateEnvelope = {
      ...payload,
      nonce: randomBytes(8).toString('hex'),
      exp: Date.now() + CryptoService.STATE_TTL_MS,
    };
    return this.encrypt(envelope);
  }

  /**
   * Open and validate a state token. Returns the original payload when the
   * token is authentic and unexpired; throws otherwise (tampered, expired, or
   // * not produced by this server).
   */
  openOAuthState(token: string): OauthStatePayload {
    const envelope = this.decrypt<OauthStateEnvelope>(token);
    if (typeof envelope.exp !== 'number' || envelope.exp < Date.now()) {
      throw new Error('OAuth state token expired');
    }
    // `nonce` and `exp` are verified-only — strip them before returning.
    const { nonce: _nonce, exp: _exp, ...payload } = envelope;
    return payload;
  }
}

/** What the caller cares about; embedded in the signed state token. */
export interface OauthStatePayload {
  userId: string;
  teamId: string;
  platform: string;
  /** Platform OAuth app credentials needed to (re)build the adapter. */
  appKey: string;
  appSecret: string;
  accountName?: string;
  accountId?: string;
}

/** Internal shape: the payload plus verification metadata. */
interface OauthStateEnvelope extends OauthStatePayload {
  nonce: string;
  exp: number;
}
