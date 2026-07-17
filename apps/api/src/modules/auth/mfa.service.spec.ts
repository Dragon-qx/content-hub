import { Test } from '@nestjs/testing';
import { MfaService } from './mfa.service';

describe('MfaService', () => {
  let service: MfaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MfaService],
    }).compile();
    service = module.get(MfaService);
  });

  it('generates a base32 secret of expected length', () => {
    const secret = service.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    // 128 bits -> ceil(128/5) = 26 base32 chars.
    expect(secret).toHaveLength(26);
  });

  it('builds an otpauth:// URI carrying the secret, issuer and period', () => {
    const uri = service.getOtpauthUrl('JBSWY3DPEHPK3PXP', 'user@example.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=ContentHub');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
    expect(uri).toContain(encodeURIComponent('user@example.com'));
  });

  it('verifies a code generated for the current step', () => {
    const secret = service.generateSecret();
    const now = Date.now();
    expect(service.verify(secret, service.generate(secret, now), now)).toBe(true);
  });

  it('accepts a code from one step in the past (drift window)', () => {
    const secret = service.generateSecret();
    const now = Date.now();
    // Step one behind the window produces the code's generation point.
    const prevNow = now - 30_000;
    const code = service.generate(secret, prevNow);
    expect(service.verify(secret, code, now)).toBe(true);
  });

  it('rejects a code from two steps away (outside the window)', () => {
    const secret = service.generateSecret();
    const now = Date.now();
    const farNow = now - 60_000;
    const code = service.generate(secret, farNow);
    expect(service.verify(secret, code, now)).toBe(false);
  });

  it('rejects malformed codes (wrong length, non-digits)', () => {
    const secret = service.generateSecret();
    expect(service.verify(secret, '12345')).toBe(false);
    expect(service.verify(secret, '1234567')).toBe(false);
    expect(service.verify(secret, 'abcdef')).toBe(false);
    expect(service.verify(secret, '')).toBe(false);
  });

  it('is resistant to whitespace around the code', () => {
    const secret = service.generateSecret();
    const now = Date.now();
    const code = service.generate(secret, now);
    expect(service.verify(secret, ` ${code} `, now)).toBe(true);
  });
});
