import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
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

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: audit },
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

      // argon2.verify returns false for wrong password
      // We need to mock it, but since argon2 is imported in auth.service
      // and we're using a mock prisma, we can't easily mock argon2 here
      // For a unit test, we mock at the service level, not testing argon2
      await expect(service.login({ email: 'test@example.com', password: 'wrong' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('records a LOGIN audit entry on successful authentication', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        isActive: true,
        passwordHash: 'hashed_correct',
        email: 'test@example.com',
        role: 'OWNER',
      });
      // argon2.verify returns false by default in this suite, so flip it true
      // for this single happy-path assertion.
      const argon2Mock = jest.requireMock('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);

      const result = await service.login({ email: 'test@example.com', password: 'correct' });

      expect(result).toHaveProperty('accessToken');
      expect(audit.log).toHaveBeenCalledWith(
        'LOGIN',
        '1',
        'User',
        '1',
        { email: 'test@example.com' },
      );
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
