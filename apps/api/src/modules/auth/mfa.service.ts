import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';

/**
 * Time-based One-Time Password (TOTP) helpers built on Node's `crypto` — no
 * external dependency. Implements RFC 6238 (TOTP) over HMAC-SHA1 with a 30-second
 * step and a configurable drift window. Secrets are base32 (RFC 4648, no pad)
 * for compatibility with every authenticator app.
 */
@Injectable()
export class MfaService {
  /** TOTP step in seconds (standard 30s window). */
  private readonly step = 30;
  /** Digits in the generated code. */
  private readonly digits = 6;
  /** How many steps either side of "now" to accept, to allow clock drift. */
  private readonly window = 1;

  private static readonly B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  /** Generate a random base32-encoded secret (128 bits of entropy). */
  generateSecret(): string {
    const bytes = randomBytes(16);
    return this.toBase32(bytes);
  }

  /**
   * Build the `otpauth://` URI an authenticator app can scan. The secret is
   * stored encrypted at rest (see AuthService), but the plaintext secret must
   * be handed to the client exactly once at setup time to seed the app.
   */
  getOtpauthUrl(secret: string, email: string, issuer = 'ContentHub'): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(this.digits),
      period: String(this.step),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /**
   * Verify a user-supplied TOTP code against a secret. The secret may arrive
   * base32-encoded (as generated) or raw; we normalise before use. Returns
   * true if the code matches the current step or any step within the drift
   * window.
   */
  verify(secret: string, code: string, now = Date.now()): boolean {
    const clean = String(code ?? '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) {
      return false;
    }
    const secretBytes = this.fromBase32(this.stripBase32(secret));
    const step = Math.floor(now / 1000 / this.step);

    // Check the current step plus/minus the drift window.
    for (let delta = -this.window; delta <= this.window; delta++) {
      if (this.generateTotp(secretBytes, step + delta) === clean) {
        return true;
      }
    }
    return false;
  }

  /** Produce the TOTP code a secret should yield right now (handy for tests). */
  generate(secret: string, now = Date.now()): string {
    const step = Math.floor(now / 1000 / this.step);
    return this.generateTotp(this.fromBase32(this.stripBase32(secret)), step);
  }

  /** Produce the code a secret should yield at the given step (testable). */
  generateTotp(secret: Buffer, targetStep: number): string {
    const buf = Buffer.alloc(8);
    // 64-bit big-endian counter.
    let n = BigInt(targetStep);
    for (let i = 7; i >= 0; i--) {
      buf[i] = Number(n & 0xffn);
      n >>= 8n;
    }
    const hmac = createHmac('sha1', secret).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const otp = binary % 10 ** this.digits;
    return otp.toString().padStart(this.digits, '0');
  }

  // --- base32 helpers -----------------------------------------------------

  private toBase32(buf: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (let i = 0; i < buf.length; i++) {
      value = (value << 8) | buf[i];
      bits += 8;
      while (bits >= 5) {
        out += MfaService.B32[(value >>> (bits - 5)) & 0x1f];
        bits -= 5;
      }
    }
    if (bits > 0) {
      out += MfaService.B32[(value << (5 - bits)) & 0x1f];
    }
    return out;
  }

  /** Strip any whitespace/padding before decoding. */
  private stripBase32(input: string): string {
    return input.replace(/[\s=]/g, '').toUpperCase();
  }

  private fromBase32(input: string): Buffer {
    const clean = this.stripBase32(input);
    if (clean.length === 0) {
      return Buffer.alloc(0);
    }
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
      const idx = MfaService.B32.indexOf(ch.toUpperCase());
      if (idx === -1) {
        // Skip characters that aren't in the base32 alphabet.
        continue;
      }
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(out);
  }
}
