import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccountStatus, Platform } from '@prisma/client';
import request from 'supertest';
import { HealthModule } from '../src/modules/health/health.module';
import { HealthService } from '../src/modules/health/health.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';

/**
 * Boots the real HealthModule (so routing, the global prefix, DTO validation
 * and the guard all exercise) with HealthService stubbed to isolate the
 * controller's contract from the unit-level evaluation logic.
 */
describe('HealthController (e2e)', () => {
  let app: INestApplication;

  const healthServiceStub = {
    evaluateAccount: jest.fn(),
    evaluateTeam: jest.fn(),
    runTeamCheck: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(HealthService)
      .useValue(healthServiceStub)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const req = () => request(app.getHttpServer());

  it('GET /health-monitor/accounts/:id routes to evaluateAccount', async () => {
    healthServiceStub.evaluateAccount.mockResolvedValue({
      accountId: 'acc-1',
      accountName: 'A',
      platform: Platform.WECHAT_OFFICIAL,
      status: AccountStatus.ACTIVE,
      health: 'HEALTHY',
      signals: [],
      lastSyncedAt: null,
      tokenExpiresAt: null,
      evaluatedAt: new Date().toISOString(),
    });

    await req().get('/api/v1/health-monitor/accounts/acc-1').expect(200);
    expect(healthServiceStub.evaluateAccount).toHaveBeenCalledWith('acc-1');
  });

  it('GET /health-monitor/teams/:teamId routes to evaluateTeam', async () => {
    healthServiceStub.evaluateTeam.mockResolvedValue({
      teamId: 'team-1',
      evaluatedAt: new Date().toISOString(),
      totals: { total: 0, healthy: 0, warning: 0, critical: 0 },
      accounts: [],
    });

    await req().get('/api/v1/health-monitor/teams/team-1').expect(200);
    expect(healthServiceStub.evaluateTeam).toHaveBeenCalledWith('team-1');
  });

  it('POST /health-monitor/teams/:teamId/run defaults notify=true', async () => {
    healthServiceStub.runTeamCheck.mockResolvedValue({
      summary: {
        teamId: 'team-1',
        evaluatedAt: new Date().toISOString(),
        totals: { total: 1, healthy: 0, warning: 0, critical: 1 },
        accounts: [],
      },
      notified: 1,
    });

    await req()
      .post('/api/v1/health-monitor/teams/team-1/run')
      .send({})
      .expect(201);

    expect(healthServiceStub.runTeamCheck).toHaveBeenCalledWith('team-1');
  });
});
