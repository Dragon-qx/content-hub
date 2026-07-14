import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Auth tests against the real AppModule graph.
 *
 * No database is available in this environment, so PrismaService is replaced
 * with an in-memory mock that mirrors the queries the auth flow touches.
 */

interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
  isActive: boolean;
  lastLoginAt: Date | null;
}

const users = new Map<string, UserRow>();
let idCounter = 0;

const ids = () => {
  idCounter += 1;
  return `user_${idCounter}`;
};

const mockPrismaService = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  user: {
    findUnique: jest.fn(
      ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.email) {
          return (
            Array.from(users.values()).find((u) => u.email === where.email) ??
            null
          );
        }
        if (where.id) {
          return users.get(where.id) ?? null;
        }
        return null;
      },
    ),
    create: jest.fn(
      ({
        data,
      }: {
        data: Omit<UserRow, 'id' | 'role' | 'isActive' | 'lastLoginAt'> & {
          role?: string;
        };
      }) => {
        const id = ids();
        const row: UserRow = {
          id,
          email: data.email,
          name: data.name,
          passwordHash: data.passwordHash,
          role: (data.role as UserRow['role']) ?? 'OWNER',
          isActive: true,
          lastLoginAt: null,
        };
        users.set(id, row);
        return row;
      },
    ),
    update: jest.fn(
      ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const row = users.get(where.id);
        if (!row) {
          throw new Error('User not found');
        }
        Object.assign(row, data);
        return row;
      },
    ),
  },
};

async function buildApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrismaService)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.init();
  return app;
}

describe('Auth', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    users.clear();
    idCounter = 0;
    jest.clearAllMocks();
  });

  it('registers a new user and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'password123', name: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();

    const stored = Array.from(users.values()).find(
      (u) => u.email === 'alice@example.com',
    );
    expect(stored).toBeDefined();
    // Password is stored hashed, not as plain text.
    expect(stored?.passwordHash).not.toBe('password123');
  });

  it('rejects duplicate registration', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'bob@example.com', password: 'password123', name: 'Bob' });

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'bob@example.com', password: 'password123', name: 'Bob 2' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('该邮箱已被注册');
  });

  it('logs in with valid credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'carol@example.com', password: 'password123', name: 'Carol' });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'carol@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dan@example.com', password: 'password123', name: 'Dan' });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dan@example.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('邮箱或密码错误');
  });

  it('rejects login with unknown email', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: '<EMAIL>', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('validates the register payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: '' });

    expect(res.status).toBe(400);
    expect(res.body.code).not.toBe(0);
  });

  it('refreshes a valid refresh token', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'eve@example.com', password: 'password123', name: 'Eve' });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'eve@example.com', password: 'password123' });

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('rejects an invalid refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for a protected route without a token', async () => {
    const res = await request(app.getHttpServer()).get('/users/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a protected route with a forged token', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer bogus-token');
    expect(res.status).toBe(401);
  });

  it('stores an argon2 password hash verifiable at login', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'frank@example.com', password: 'password123', name: 'Frank' });

    const stored = Array.from(users.values()).find(
      (u) => u.email === 'frank@example.com',
    );
    expect(stored).toBeDefined();
    const valid = await argon2.verify(stored!.passwordHash, 'password123');
    expect(valid).toBe(true);
  });
});
