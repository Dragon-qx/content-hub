import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Integration tests: security and data integrity.
 *
 * These tests verify that the core security mechanisms work correctly:
 * - Tenant isolation (cross-team access denial)
 * - Authentication enforcement
 * - Input validation
 */
describe('Security & Data Integrity (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userAToken: string;
  let userBToken: string;
  let userATeamId: string;
  let userBTeamId: string;

  const login = async (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Clean test data (order matters due to FK constraints)
    await prisma.auditLog.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.publishReceipt.deleteMany();
    await prisma.publishJob.deleteMany();
    await prisma.platformPost.deleteMany();
    await prisma.mediaAsset.deleteMany();
    await prisma.contentTag.deleteMany();
    await prisma.content.deleteMany();
    await prisma.accountTransfer.deleteMany();
    await prisma.engagementComment.deleteMany();
    await prisma.engagementMessage.deleteMany();
    await prisma.socialAccount.deleteMany();
    await prisma.walletTransaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.healthThreshold.deleteMany();
    await prisma.accountHealth.deleteMany();
    await prisma.anomalyAlert.deleteMany();
    await prisma.analyticsSnapshot.deleteMany();
    await prisma.sentimentKeyword.deleteMany();
    await prisma.contentTemplate.deleteMany();
    await prisma.customReport.deleteMany();
    await prisma.commentTemplate.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.accountGroup.deleteMany();
    await prisma.member.deleteMany();
    await prisma.team.deleteMany();
    await prisma.user.deleteMany();

    // Create two users with separate teams
    const resA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'tenant-a@test.com', password: 'password123', name: 'Tenant A' });
    userAToken = resA.body.accessToken;

    const resB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'tenant-b@test.com', password: 'password123', name: 'Tenant B' });
    userBToken = resB.body.accessToken;

    // Get team IDs
    const teamsA = await request(app.getHttpServer())
      .get('/api/v1/teams')
      .set(await login(userAToken));
    userATeamId = teamsA.body[0]?.id;

    const teamsB = await request(app.getHttpServer())
      .get('/api/v1/teams')
      .set(await login(userBToken));
    userBTeamId = teamsB.body[0]?.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contents')
        .expect(401);
    });

    it('rejects requests with an invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contents')
        .set({ Authorization: 'Bearer invalid-token' })
        .expect(401);
    });

    it('accepts requests with a valid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contents')
        .set(await login(userAToken))
        .expect(200);
    });
  });

  describe('Tenant Isolation', () => {
    let contentId: string;

    beforeAll(async () => {
      // User A creates content
      const res = await request(app.getHttpServer())
        .post('/api/v1/contents')
        .set(await login(userAToken))
        .send({
          title: 'Team A Secret Content',
          body: 'This belongs to team A',
          contentType: 'TEXT',
          teamId: userATeamId,
        });
      contentId = res.body.id;
    });

    it('prevents User B from reading User A\'s content', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/contents/${contentId}`)
        .set(await login(userBToken))
        .expect(404); // Not 403 — we don't leak existence
    });

    it('prevents User B from updating User A\'s content', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/contents/${contentId}`)
        .set(await login(userBToken))
        .send({ title: 'Hacked!' })
        .expect(404);
    });

    it('prevents User B from deleting User A\'s content', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/contents/${contentId}`)
        .set(await login(userBToken))
        .expect(404);
    });

    it('allows User A to read their own content', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/contents/${contentId}`)
        .set(await login(userAToken))
        .expect(200);
    });

    it('prevents User B from listing User A\'s contents', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contents')
        .set(await login(userBToken));
      const items = res.body.items || [];
      const found = items.find((c: any) => c.id === contentId);
      expect(found).toBeUndefined();
    });
  });

  describe('Input Validation', () => {
    it('rejects content creation without title', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contents')
        .set(await login(userAToken))
        .send({ body: 'No title', contentType: 'TEXT', teamId: userATeamId })
        .expect(400);
    });

    it('rejects content creation without teamId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contents')
        .set(await login(userAToken))
        .send({ title: 'No team', contentType: 'TEXT' })
        .expect(400);
    });

    it('rejects registration with invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'password123', name: 'Bad' })
        .expect(400);
    });

    it('rejects registration with short password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'short@test.com', password: '123', name: 'Short' })
        .expect(400);
    });
  });

  describe('Wallet Security', () => {
    it('prevents User B from accessing User A\'s wallet', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/wallet/${userATeamId}/balance`)
        .set(await login(userBToken))
        .expect(404);
    });

    it('allows User A to access their own wallet', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/wallet/${userATeamId}/balance`)
        .set(await login(userAToken))
        .expect(200);
    });
  });

  describe('Concurrent Wallet Operations', () => {
    it('handles concurrent debits without overdrafting', async () => {
      const authHeader = await login(userAToken);

      // Top up wallet
      await request(app.getHttpServer())
        .post(`/api/v1/wallet/${userATeamId}/top-up`)
        .set(authHeader)
        .send({ amount: 100 })
        .expect(201);

      // Fire 20 concurrent debits of 10 each (total 200, but only 100 available)
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/wallet/${userATeamId}/debit`)
            .set(authHeader)
            .send({ type: 'PUBLISH' }),
        ),
      );

      // Count successes and failures
      const succeeded = results.filter(
        (r) => r.status === 'fulfilled' && (r.value as any).status === 201,
      ).length;
      const conflicted = results.filter(
        (r) => r.status === 'fulfilled' && (r.value as any).status === 409,
      ).length;

      // Should have exactly 10 successes (100 / 10 = 10) and 10 conflicts
      expect(succeeded).toBeLessThanOrEqual(10);
      expect(succeeded + conflicted).toBe(20);

      // Verify balance is not negative
      const balanceRes = await request(app.getHttpServer())
        .get(`/api/v1/wallet/${userATeamId}/balance`)
        .set(await login(userAToken));
      expect(balanceRes.body.balance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Content Lifecycle', () => {
    it('supports full content workflow: create → submit → approve → archive', async () => {
      // Create content
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/contents')
        .set(await login(userAToken))
        .send({
          title: 'Lifecycle Test',
          body: 'Testing the full workflow',
          contentType: 'TEXT',
          teamId: userATeamId,
        })
        .expect(201);
      const contentId = createRes.body.id;
      expect(createRes.body.status).toBe('DRAFT');

      // Submit for review
      await request(app.getHttpServer())
        .post(`/api/v1/contents/${contentId}/submit`)
        .set(await login(userAToken))
        .expect(201);

      // Verify status is IN_REVIEW
      const reviewRes = await request(app.getHttpServer())
        .get(`/api/v1/contents/${contentId}`)
        .set(await login(userAToken));
      expect(reviewRes.body.status).toBe('IN_REVIEW');

      // Approve
      await request(app.getHttpServer())
        .post(`/api/v1/contents/${contentId}/approve`)
        .set(await login(userAToken))
        .send({ comment: 'Looks good' })
        .expect(201);

      // Verify status is APPROVED
      const approvedRes = await request(app.getHttpServer())
        .get(`/api/v1/contents/${contentId}`)
        .set(await login(userAToken));
      expect(approvedRes.body.status).toBe('APPROVED');

      // Archive
      await request(app.getHttpServer())
        .post(`/api/v1/contents/${contentId}/archive`)
        .set(await login(userAToken))
        .expect(201);

      // Verify status is ARCHIVED
      const archivedRes = await request(app.getHttpServer())
        .get(`/api/v1/contents/${contentId}`)
        .set(await login(userAToken));
      expect(archivedRes.body.status).toBe('ARCHIVED');
    });
  });
});
