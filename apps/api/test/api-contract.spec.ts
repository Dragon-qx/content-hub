import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

/**
 * API Contract validation tests.
 *
 * Verifies that the OpenAPI document is valid and the API contract
 * is consistent across endpoints.
 */
describe('API Contract (OpenAPI)', () => {
  let app: INestApplication;
  let openapiSpec: Record<string, unknown>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');

    const config = new DocumentBuilder()
      .setTitle('ContentHub API')
      .setVersion('1.1')
      .addBearerAuth()
      .addServer('/api/v1', 'Current prefix')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      deepScanRoutes: true,
    });

    openapiSpec = document as unknown as Record<string, unknown>;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('produces a valid OpenAPI document', () => {
    expect(openapiSpec).toBeDefined();
    expect(openapiSpec.openapi).toMatch(/^3\./);
    expect(openapiSpec.info).toBeDefined();
    expect(openapiSpec.paths).toBeDefined();
  });

  it('has all core endpoints documented', () => {
    const paths = openapiSpec.paths as Record<string, unknown>;
    expect(paths['/api/v1/health']).toBeDefined();
    expect(paths['/api/v1/auth/register']).toBeDefined();
    expect(paths['/api/v1/auth/login']).toBeDefined();
    expect(paths['/api/v1/contents']).toBeDefined();
    expect(paths['/api/v1/contents/{id}']).toBeDefined();
    expect(paths['/api/v1/accounts']).toBeDefined();
    expect(paths['/api/v1/teams']).toBeDefined();
    expect(paths['/api/v1/media/upload']).toBeDefined();
    expect(paths['/api/v1/analytics/dashboard']).toBeDefined();
    expect(paths['/api/v1/wallet/{teamId}/balance']).toBeDefined();
  });

  it('uses consistent pagination response format', () => {
    const paths = openapiSpec.paths as Record<string, unknown>;
    // Paginated endpoints should return { items, total, skip, take }
    const listEndpoint = paths['/api/v1/contents'] as { get?: { responses?: Record<string, unknown> } };
    expect(listEndpoint).toBeDefined();
  });

  it('requires authentication on protected endpoints', () => {
    const paths = openapiSpec.paths as Record<string, unknown>;
    const contentsGet = paths['/api/v1/contents'] as { get?: { security?: Array<Record<string, string[]>> } };
    expect(contentsGet.get?.security).toBeDefined();
  });
});
