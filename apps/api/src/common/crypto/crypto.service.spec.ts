import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        { provide: ConfigService, useValue: { get: jest.fn(() => 'test-secret-key') } },
      ],
    }).compile();

    service = module.get(CryptoService);
  });

  it('round-trips an object through encrypt/decrypt', () => {
    const payload = { appid: 'wx123', secret: 'shhh', nested: { a: 1 } };
    const encrypted = service.encrypt(payload);

    expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:/);
    expect(service.decrypt(encrypted)).toEqual(payload);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const a = service.encrypt({ same: true });
    const b = service.encrypt({ same: true });
    expect(a).not.toEqual(b);
  });

  it('throws on a malformed payload', () => {
    expect(() => service.decrypt('not-valid')).toThrow();
  });
});
