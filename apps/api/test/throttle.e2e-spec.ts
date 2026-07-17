import { INestApplication, Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

/**
 * Verifies the global throttler guard engages: boots a minimal app with a very
 * low limit (3 requests / ttl) and confirms the 4th request is rejected with
 * HTTP 429, and that the health probe is exempt via skipIf.
 */
@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Get('health')
  health() {
    return { status: 'up' };
  }
}

describe('ThrottlerGuard (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60_000,
            limit: 3,
            skipIf: (ctx) => {
              const req = ctx.switchToHttp().getRequest();
              return req?.url?.includes('/health') ?? false;
            },
            getTracker: (req: Record<string, any>) => req?.ip ?? 'unknown',
          },
        ]),
      ],
      controllers: [PingController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const req = () => request(app.getHttpServer());

  it('allows requests up to the limit, then rejects with 429', async () => {
    await req().get('/ping').expect(200);
    await req().get('/ping').expect(200);
    await req().get('/ping').expect(200);
    await req().get('/ping').expect(429);
  });

  it('exempts the health probe from rate limiting', async () => {
    // Many requests to /health should all succeed, even past the limit.
    for (let i = 0; i < 5; i++) {
      await req().get('/health').expect(200);
    }
  });
});
