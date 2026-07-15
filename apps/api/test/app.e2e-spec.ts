import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

const PREFIX = '/api/v1';

describe('ContentHub API (e2e)', () => {
  let app: INestApplication;
  let prismaMock: any;

  beforeAll(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: '1', email: 'test@e2e.com', name: 'E2E User', role: 'OWNER' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: '1', isActive: false }),
        count: jest.fn().mockResolvedValue(0),
      },
      team: {
        create: jest.fn().mockResolvedValue({ id: 'team-1', name: 'Team', ownerId: 'user-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1', ownerId: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'team-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'team-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      member: {
        create: jest.fn().mockResolvedValue({ id: 'mem-1', role: 'ADMIN' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({ id: 'mem-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      content: {
        create: jest.fn().mockResolvedValue({ id: 'content-1', title: 'Test', body: 'Body', version: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'content-1', title: 'Test', version: 1, tags: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'content-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'content-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      contentVersion: {
        create: jest.fn().mockResolvedValue({ id: 'ver-1', version: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      mediaAsset: {
        create: jest.fn().mockResolvedValue({ id: 'media-1', type: 'IMAGE', url: '/uploads/img.jpg' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'media-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({ id: 'media-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      socialAccount: {
        create: jest.fn().mockResolvedValue({ id: 'account-1', platform: 'TWITTER' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({ id: 'account-1' }),
        update: jest.fn().mockResolvedValue({ id: 'account-1' }),
      },
      platformPost: {
        create: jest.fn().mockResolvedValue({ id: 'post-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'post-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      publishJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'job-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'job-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      workflow: {
        create: jest.fn().mockResolvedValue({ id: 'wf-1', status: 'PENDING' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'wf-1', status: 'PENDING' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'wf-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'wf-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1', action: 'CREATE' }),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      analyticsSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'snap-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const req = () => request(app.getHttpServer());

  // ── Auth ──────────────────────────────────────────────
  describe('POST /api/v1/auth/register', () => {
    it('should validate input', async () => {
      return req()
        .post(`${PREFIX}/auth/register`)
        .send({ email: 'bad', password: 'short', name: '' })
        .expect(400);
    });

    it('should register with valid data', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce({
        id: '1',
        email: 'new@e2e.com',
        name: 'New User',
        role: 'OWNER',
      });

      return req()
        .post(`${PREFIX}/auth/register`)
        .send({ email: 'new@e2e.com', password: 'password123', name: 'New User' })
        .expect(201);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should reject invalid email', async () => {
      return req()
        .post(`${PREFIX}/auth/login`)
        .send({ email: 'invalid', password: 'pass' })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should reject invalid token', async () => {
      return req()
        .post(`${PREFIX}/auth/refresh`)
        .send({ refreshToken: 'x' })
        .expect(401);
    });
  });

  // ── Audit ─────────────────────────────────────────────
  describe('POST /api/v1/audit', () => {
    it('should create audit log', async () => {
      prismaMock.auditLog.create.mockResolvedValueOnce({ id: 'log-1' });

      return req()
        .post(`${PREFIX}/audit`)
        .send({
          action: 'test',
          userId: 'u1',
          entityType: 'Content',
          entityId: 'c1',
        })
        .expect(201);
    });
  });

  // ── Workflow ──────────────────────────────────────────
  describe('POST /api/v1/workflow/approval', () => {
    it('should create workflow', async () => {
      prismaMock.content.findUnique.mockResolvedValue({ id: 'c1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
      prismaMock.workflow.create.mockResolvedValue({ id: 'wf-1', status: 'PENDING' });

      return req()
        .post(`${PREFIX}/workflow/approval`)
        .send({ contentId: 'c1', approverId: 'u1' })
        .expect(201);
    });
  });

  // ── Content ───────────────────────────────────────────
  describe('POST /api/v1/contents', () => {
    it('should create content', async () => {
      prismaMock.content.create.mockResolvedValueOnce({
        id: 'c1',
        title: 'Test',
        version: 1,
        tags: [],
      });

      return req()
        .post(`${PREFIX}/contents`)
        .send({ title: 'Test', body: 'Body' })
        .expect(201);
    });
  });

  describe('GET /api/v1/contents', () => {
    it('should list content', async () => {
      prismaMock.content.findMany.mockResolvedValueOnce([]);
      prismaMock.content.count.mockResolvedValueOnce(0);

      return req()
        .get(`${PREFIX}/contents?skip=0&take=10`)
        .expect(200);
    });
  });

  // ── Scheduler ────────────────────────────────────────
  describe('GET /api/v1/scheduler', () => {
    it('should list jobs', async () => {
      prismaMock.publishJob.findMany.mockResolvedValueOnce([]);
      prismaMock.publishJob.count.mockResolvedValueOnce(0);

      return req()
        .get(`${PREFIX}/scheduler?skip=0&take=10`)
        .expect(200);
    });
  });

  // ── Platform SDK ─────────────────────────────────────
  describe('POST /api/v1/platform-sdk/publish', () => {
    it('should accept publish request', async () => {
      return req()
        .post(`${PREFIX}/platform-sdk/publish`)
        .send({ contentId: 'c1', platform: 'TWITTER' })
        .expect(201);
    });
  });

  describe('POST /api/v1/platform-sdk/validate', () => {
    it('should validate credentials', async () => {
      return req()
        .post(`${PREFIX}/platform-sdk/validate`)
        .send({ platform: 'TWITTER', credentials: {} })
        .expect(201);
    });
  });

  // ── Media ─────────────────────────────────────────────
  describe('GET /api/v1/media', () => {
    it('should list media', async () => {
      prismaMock.mediaAsset.findMany.mockResolvedValueOnce([]);
      prismaMock.mediaAsset.count.mockResolvedValueOnce(0);

      return req()
        .get(`${PREFIX}/media`)
        .expect(200);
    });
  });

  // ── Analytics ─────────────────────────────────────────
  describe('GET /api/v1/analytics/dashboard/:id', () => {
    it('should handle invalid account id', async () => {
      prismaMock.socialAccount.findUnique.mockResolvedValueOnce(null);

      return req()
        .get(`${PREFIX}/analytics/dashboard/nonexistent`)
        .expect(404);
    });
  });

  // ── Invalid Routes ────────────────────────────────────
  describe('Invalid Routes', () => {
    it('should 404 unknown route', async () => {
      return req()
        .get(`${PREFIX}/nonexistent`)
        .expect(404);
    });
  });
});
