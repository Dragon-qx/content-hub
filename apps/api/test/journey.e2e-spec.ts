import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

const PREFIX = '/api/v1';

/**
 * Stateful end-to-end journey: the core user lifecycle exercised as one
 * coherent flow against a single in-memory Prisma mock.
 *
 *   register → login → create content → submit → approve → schedule → publish
 *
 * The mock keeps a tiny in-memory store so status transitions (DRAFT →
 * IN_REVIEW → APPROVED) are reflected realistically, and the publish pipeline
 * is driven by a mocked global fetch (no real platform APIs).
 */
describe('ContentHub core journey (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let authToken = '';

  // ── In-memory store backing the Prisma mock ────────────────────────────
  const store = {
    contents: [] as any[],
    workflows: [] as any[],
    jobs: [] as any[],
    posts: [] as any[],
    nextId: 1,
  };
  const id = (p: string) => `${p}-${store.nextId++}`;

  function createPrismaMock() {
    return {
      user: {
        findUnique: jest.fn((args: any) =>
          Promise.resolve({ id: args.where.id ?? 'u-1', isActive: true }),
        ),
        create: jest.fn((args: any) =>
          Promise.resolve({ id: id('u'), ...args.data }),
        ),
        findMany: jest.fn(() => Promise.resolve([])),
        update: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        count: jest.fn(() => Promise.resolve(0)),
      },
      team: {
        create: jest.fn((args: any) => Promise.resolve({ id: id('team'), ...args.data })),
        findUnique: jest.fn((args: any) =>
          Promise.resolve({
            id: args.where.id,
            ownerId: 'u-1',
            members: [{ userId: 'u-2', role: 'ADMIN' }],
          }),
        ),
        update: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        delete: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      member: {
        create: jest.fn((args: any) => Promise.resolve({ id: id('mem'), ...args.data })),
        findUnique: jest.fn(() => Promise.resolve(null)),
        findMany: jest.fn(() => Promise.resolve([])),
        delete: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        count: jest.fn(() => Promise.resolve(0)),
      },
      content: {
        create: jest.fn((args: any) => {
          const row = { id: id('c'), status: 'DRAFT', version: 1, tags: [], ...args.data };
          store.contents.push(row);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn((args: any) => {
          const row = store.contents.find((c) => c.id === args.where.id);
          return Promise.resolve(row ? { ...row } : null);
        }),
        findMany: jest.fn(() => Promise.resolve([...store.contents])),
        update: jest.fn((args: any) => {
          const row = store.contents.find((c) => c.id === args.where.id);
          Object.assign(row ?? {}, args.data);
          return Promise.resolve({ ...(row ?? { id: args.where.id }), ...args.data });
        }),
        delete: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        count: jest.fn(() => Promise.resolve(store.contents.length)),
      },
      contentVersion: {
        create: jest.fn((args: any) => Promise.resolve({ id: id('ver'), ...args.data })),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      workflow: {
        create: jest.fn((args: any) => {
          const data = args.data ?? {};
          const row = {
            id: id('wf'),
            status: 'PENDING',
            ...data,
            contentId: data.content?.connect?.id ?? data.contentId,
          };
          store.workflows.push(row);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn((args: any) =>
          Promise.resolve(store.workflows.find((w) => w.id === args.where.id) ?? null),
        ),
        findFirst: jest.fn((args: any) => {
          const row = store.workflows.find(
            (w) => w.contentId === args.where.contentId && w.status === 'PENDING',
          );
          return Promise.resolve(row ?? null);
        }),
        findMany: jest.fn(() => Promise.resolve([...store.workflows])),
        update: jest.fn((args: any) => {
          const row = store.workflows.find((w) => w.id === args.where.id);
          Object.assign(row ?? {}, args.data);
          return Promise.resolve({ ...(row ?? { id: args.where.id }), ...args.data });
        }),
        delete: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        count: jest.fn(() => Promise.resolve(store.workflows.length)),
      },
      publishJob: {
        create: jest.fn((args: any) => {
          const row = { id: id('job'), status: 'QUEUED', ...args.data };
          store.jobs.push(row);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn((args: any) =>
          Promise.resolve(store.jobs.find((j) => j.id === args.where.id) ?? null),
        ),
        findMany: jest.fn(() => Promise.resolve([...store.jobs])),
        update: jest.fn((args: any) => {
          const row = store.jobs.find((j) => j.id === args.where.id);
          Object.assign(row ?? {}, args.data);
          return Promise.resolve({ ...(row ?? { id: args.where.id }), ...args.data });
        }),
        delete: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        count: jest.fn(() => Promise.resolve(store.jobs.length)),
      },
      platformPost: {
        create: jest.fn((args: any) => {
          const row = { id: id('post'), ...args.data };
          store.posts.push(row);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn((args: any) =>
          Promise.resolve(store.posts.find((p) => p.id === args.where.id) ?? null),
        ),
        findMany: jest.fn(() => Promise.resolve([...store.posts])),
        count: jest.fn(() => Promise.resolve(store.posts.length)),
      },
      socialAccount: {
        create: jest.fn((args: any) => Promise.resolve({ id: id('acc'), ...args.data })),
        findUnique: jest.fn(() => Promise.resolve(null)),
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'acc-1',
            platform: 'WECHAT_OFFICIAL',
            status: 'ACTIVE',
            credentials: { appid: 'appid', secret: 'secret', rawId: 'raw' },
          }),
        ),
        findMany: jest.fn(() => Promise.resolve([])),
        delete: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        update: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
      },
      mediaAsset: {
        create: jest.fn((args: any) => Promise.resolve({ id: id('media'), ...args.data })),
        findUnique: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        findMany: jest.fn(() => Promise.resolve([])),
        delete: jest.fn((args: any) => Promise.resolve({ id: args.where.id })),
        count: jest.fn(() => Promise.resolve(0)),
      },
      auditLog: {
        create: jest.fn((args: any) => Promise.resolve({ id: id('log'), ...args.data })),
        findMany: jest.fn(() => Promise.resolve([])),
        deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
        count: jest.fn(() => Promise.resolve(0)),
      },
      analyticsSnapshot: {
        create: jest.fn((args: any) => Promise.resolve({ id: id('snap'), ...args.data })),
        findFirst: jest.fn(() => Promise.resolve(null)),
        findMany: jest.fn(() => Promise.resolve([])),
        count: jest.fn(() => Promise.resolve(0)),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
  }

  function installFetchMock() {
    const fetchMock = jest.fn((url: string) => {
      const u = String(url);
      let body: any = {};
      if (u.includes('cgi-bin/token')) {
        body = { access_token: 'mock-access-token', expires_in: 7200 };
      } else if (u.includes('add_material')) {
        body = { media_id: 'mock-thumb-id', url: 'https://mmbiz.qpic.cn/mock-thumb' };
      } else if (u.includes('draft/add')) {
        body = { media_id: 'mock-media-id' };
      } else if (u.includes('freepublish/submit')) {
        body = { publish_id: 'mock-publish-id' };
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      } as Response);
    });
    (globalThis as any).fetch = fetchMock;
    return fetchMock;
  }

  beforeAll(async () => {
    installFetchMock();
    prismaMock = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    const jwt = app.get(JwtService);
    authToken = jwt.sign({
      sub: 'u-1',
      email: 'owner@journey.com',
      role: 'OWNER',
      type: 'access',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (r: request.Test) =>
    r.set('Authorization', `Bearer ${authToken}`);
  const req = () => request(app.getHttpServer());

  it('runs the full content lifecycle end-to-end', async () => {
    // 1. Register a fresh account
    prismaMock.user.findUnique.mockImplementationOnce(() => Promise.resolve(null as any));
    prismaMock.user.create.mockResolvedValueOnce({
      id: 'u-1',
      email: 'owner@journey.com',
      name: 'Journey Owner',
      role: 'OWNER',
    });
    const reg = await req()
      .post(`${PREFIX}/auth/register`)
      .send({ email: 'owner@journey.com', password: 'password123', name: 'Journey Owner' });
    expect(reg.status).toBe(201);

    // 2. Create content (DRAFT)
    const created = await auth(
      req()
        .post(`${PREFIX}/contents`)
        .send({ title: 'Journey Post', body: 'Hello world', teamId: 'team-1' }),
    );
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    const contentId = created.body.id as string;
    expect(contentId).toBeTruthy();

    // 3. Submit for review (DRAFT → IN_REVIEW) — creates a PENDING workflow
    const submitted = await auth(
      req().post(`${PREFIX}/contents/${contentId}/submit`),
    );
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe('IN_REVIEW');
    const pendingWf = store.workflows.find((w) => w.contentId === contentId);
    expect(pendingWf).toBeDefined();
    expect(pendingWf.status).toBe('PENDING');

    // 4. Approve (IN_REVIEW → APPROVED) — closes the workflow
    const approved = await auth(
      req()
        .post(`${PREFIX}/contents/${contentId}/approve`)
        .send({ approverId: 'u-2', comment: 'Looks good' }),
    );
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('APPROVED');
    expect(pendingWf.status).toBe('APPROVED');

    // 5. Schedule a publish job
    const scheduled = await auth(
      req()
        .post(`${PREFIX}/scheduler`)
        .send({ contentId, platform: 'WECHAT_OFFICIAL' }),
    );
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.status).toBe('QUEUED');
    const jobId = scheduled.body.id as string;

    // 6. Publish via the platform adapter (APPROVED → PUBLISHED)
    prismaMock.publishJob.findUnique.mockResolvedValueOnce({
      id: jobId,
      contentId,
      platform: 'WECHAT_OFFICIAL',
      status: 'QUEUED',
    });
    prismaMock.platformPost.create.mockResolvedValueOnce({
      id: 'post-1',
      contentId,
      platform: 'WECHAT_OFFICIAL',
      externalId: 'mock-publish-id',
      status: 'PUBLISHED',
    });
    const published = await auth(
      req()
        .post(`${PREFIX}/platform-sdk/publish`)
        .send({
          contentId,
          platform: 'WECHAT_OFFICIAL',
          payload: { mediaUrls: ['https://example.com/cover.jpg'] },
        }),
    );
    expect(published.status).toBe(201);
    expect(published.body.externalId).toBe('mock-publish-id');
    expect(published.body.status).toBe('PUBLISHED');

    // 7. Verify the platform post was recorded
    expect(prismaMock.platformPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentId,
          platform: 'WECHAT_OFFICIAL',
          externalId: 'mock-publish-id',
          status: 'PUBLISHED',
        }),
      }),
    );
  });

  it('rejects an unauthenticated request at every guarded step', async () => {
    await req().get(`${PREFIX}/contents`).expect(401);
    await req()
      .post(`${PREFIX}/contents`)
      .send({ title: 'X', body: 'Y', teamId: 'team-1' })
      .expect(401);
    await req()
      .post(`${PREFIX}/workflow/approval`)
      .send({ contentId: 'c-1', approverId: 'u-2' })
      .expect(401);
  });
});
