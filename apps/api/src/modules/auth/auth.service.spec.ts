import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { MfaService } from './mfa.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  verify: jest.fn().mockResolvedValue(false),
}));

// Mock PrismaService
const createMockPrisma = () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let jwt: any;
  let config: any;
  let audit: any;
  let crypto: any;
  let mfa: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    jwt = {
      signAsync: jest.fn().mockResolvedValue('mock-token'),
      verifyAsync: jest.fn(),
    };
    config = {
      get: jest.fn((key: string, def?: string) => def),
    };
    audit = { log: jest.fn().mockResolvedValue({ id: 'log-1' }) };
    crypto = {
      // Symmetric stand-ins for the real AES-256-GCM CryptoService: encrypt
      // prefixes the plaintext, decrypt strips the prefix.
      encrypt: jest.fn((v: unknown) => `enc:${v}`),
      decrypt: jest.fn((s: string) => s.slice(4)),
    };
    mfa = {
      generateSecret: jest.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
      getOtpauthUrl: jest.fn().mockReturnValue('otpauth://totp/test'),
      verify: jest.fn().mockReturnValue(false),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: audit },
        { provide: CryptoService, useValue: crypto },
        { provide: MfaService, useValue: mfa },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      const dto = { email: 'test@example.com', password: 'password123', name: 'Test User' };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: '1', email: dto.email, role: 'OWNER' });

      const result = await service.register(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ email: dto.email, name: dto.name }),
      }));
    });

    it('should throw ConflictException for existing email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1', email: 'test@example.com' });

      await expect(
        service.register({ email: 'test@example.com', password: 'password123', name: 'Test' })
      ).rejects.toThrow(ConflictException);
    });

    it('should hash password before storing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: '1', email: 'test@example.com', role: 'OWNER' });

      await service.register({ email: 'test@example.com', password: 'password123', name: 'Test' });

      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe('password123');
    });
  });

  describe('login', () => {
    it('should reject non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'bad@example.com', password: 'wrong' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        isActive: false,
        passwordHash: 'hashed',
      });

      await expect(service.login({ email: 'inactive@example.com', password: 'pass' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        isActive: true,
        passwordHash: 'hashed_correct',
        email: 'test@example.com',
        role: 'OWNER',
      });

      await expect(service.login({ email: 'test@example.com', password: 'wrong' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('records a LOGIN audit entry on successful authentication without MFA', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        isActive: true,
        passwordHash: 'hashed_correct',
        email: 'test@example.com',
        role: 'OWNER',
        mfaEnabled: false,
        mfaSecret: null,
      });
      const argon2Mock = jest.requireMock('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);

      const result = await service.login({ email: 'test@example.com', password: 'correct' });

      expect(result).toHaveProperty('accessToken');
      expect(audit.log).toHaveBeenCalledWith(
        'LOGIN',
        '1',
        'User',
        '1',
        { email: 'test@example.com', mfa: false },
      );
    });

    it('returns an mfaToken (not session tokens) when MFA is enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        isActive: true,
        passwordHash: 'hashed',
        email: 'test@example.com',
        role: 'OWNER',
        mfaEnabled: true,
        mfaSecret: 'enc:secret',
      });
      const argon2Mock = jest.requireMock('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);

      const result = await service.login({ email: 'test@example.com', password: 'correct' });

      expect(result).toHaveProperty('mfaRequired', true);
      expect(result).toHaveProperty('mfaToken', 'mock-token');
      // A distinct, short-lived mfa token is signed (one extra call on top of
      // none: session tokens must NOT be issued here).
      expect(jwt.signAsync).toHaveBeenCalledTimes(1);
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: '1', type: 'mfa' }),
        expect.objectContaining({ expiresIn: '5m' }),
      );
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('mfaLogin', () => {
    it('issues session tokens when a valid mfaToken and code are presented', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: '1', type: 'mfa' });
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        role: 'OWNER',
        isActive: true,
        mfaEnabled: true,
        mfaSecret: 'enc:real-secret',
      });
      mfa.verify.mockResolvedValueOnce(true);

      const result = await service.mfaLogin({ mfaToken: 'mfa-tok', code: '123456' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(crypto.decrypt).toHaveBeenCalledWith('enc:real-secret');
      expect(mfa.verify).toHaveBeenCalledWith('real-secret', '123456');
      expect(audit.log).toHaveBeenCalledWith(
        'LOGIN',
        '1',
        'User',
        '1',
        { email: 'test@example.com', mfa: true },
      );
    });

    it('rejects an expired or tampered mfaToken', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('expired'));
      await expect(service.mfaLogin({ mfaToken: 'bad', code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token that is not of type mfa', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: '1', type: 'access' });
      await expect(service.mfaLogin({ mfaToken: 'tok', code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong TOTP code', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: '1', type: 'mfa' });
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        role: 'OWNER',
        isActive: true,
        mfaEnabled: true,
        mfaSecret: 'enc:secret',
      });
      mfa.verify.mockReturnValueOnce(false);

      await expect(service.mfaLogin({ mfaToken: 'tok', code: '000000' }))
        .rejects.toThrow(UnauthorizedException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('setupMfa / enableMfa', () => {
    it('generates and persists a secret, returning the provisioning URI', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'u@e.com',
        mfaEnabled: false,
        mfaSecret: null,
      });

      const result = await service.setupMfa('1');

      expect(result).toEqual({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/test',
      });
      expect(crypto.encrypt).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');
      expect(mfa.generateSecret).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { mfaSecret: expect.stringContaining('enc:') },
      });
    });

    it('refuses setup when MFA is already enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ mfaEnabled: true });
      await expect(service.setupMfa('1')).rejects.toThrow(ConflictException);
    });

    it('enables MFA only when the submitted code verifies', async () => {
      prisma.user.findUnique.mockResolvedValue({
        mfaEnabled: false,
        mfaSecret: 'enc:real-secret',
        email: 'u@e.com',
      });
      mfa.verify.mockResolvedValueOnce(true);

      const result = await service.enableMfa('1', { code: '123456' });

      expect(result).toEqual({ enabled: true });
      expect(mfa.verify).toHaveBeenCalledWith('real-secret', '123456');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { mfaEnabled: true },
      });
      expect(audit.log).toHaveBeenCalledWith('MFA_ENABLE', '1', 'User', '1', { email: 'u@e.com' });
    });

    it('rejects enable when the code is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue({
        mfaEnabled: false,
        mfaSecret: 'enc:secret',
        email: 'u@e.com',
      });
      mfa.verify.mockReturnValueOnce(false);

      await expect(service.enableMfa('1', { code: '000000' }))
        .rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('disableMfa', () => {
    it('clears MFA and the secret', async () => {
      prisma.user.findUnique.mockResolvedValue({
        mfaEnabled: true,
        mfaSecret: 'enc:secret',
        email: 'u@e.com',
      });

      const result = await service.disableMfa('1');

      expect(result).toEqual({ enabled: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { mfaEnabled: false, mfaSecret: null },
      });
      expect(audit.log).toHaveBeenCalledWith('MFA_DISABLE', '1', 'User', '1', { email: 'u@e.com' });
    });
  });

  describe('refresh', () => {
    it('should reject non-refresh token type', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: '1', type: 'access' });

      await expect(service.refresh({ refreshToken: 'token' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject invalid token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid'));

      await expect(service.refresh({ refreshToken: 'bad-token' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject if user not found', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: '999', type: 'refresh' });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: 'token' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject if user is inactive', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: '1', type: 'refresh' });
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        isActive: false,
        email: 'test@example.com',
        role: 'OWNER',
      });

      await expect(service.refresh({ refreshToken: 'token' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
