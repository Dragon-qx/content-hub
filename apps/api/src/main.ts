import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  // Swagger / OpenAPI documentation at /api/docs. Routes are exposed under the
  // global `/api/v1` prefix, but the docs UI itself is served at `/api/docs`
  // (no prefix) so it is reachable behind the reverse proxy at `/api/docs`.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ContentHub API')
    .setDescription(
      'Multi-platform content management & publishing platform.\n\n' +
        '## Authentication\n' +
        'All endpoints (except the public `POST /auth/*` actions and the OAuth ' +
        'callback) require `Authorization: Bearer <jwt>`. Obtain a token via ' +
        '`POST /auth/login` or `POST /auth/register`, and refresh it via ' +
        '`POST /auth/refresh`. Two-factor (TOTP) accounts complete a second ' +
        '`POST /auth/mfa/login` step.\n\n' +
        '## Conventions\n' +
        'Routes are served under the `/api/v1` prefix. Paginated endpoints ' +
        'accept `skip`/`take` and return `{ data, total }`.\n\n' +
        '## Content lifecycle\n' +
        '`DRAFT → IN_REVIEW → APPROVED → PUBLISHED`, plus `ARCHIVED` from any ' +
        'stable state. Submitting/approving/rejecting a draft closes the ' +
        'matching workflow flow.',
    )
    .setVersion('1.1')
    .setContact('ContentHub', '', '')
    .setLicense('Proprietary', '')
    .addBearerAuth()
    .addServer('/api/v1', 'Current prefix')
    .addServer('/', 'Relative')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    // Deep-scan every controller so newly added routes appear without manual
    // registration.
    deepScanRoutes: true,
  });
  SwaggerModule.setup('api/docs', app, document, {
    // Persist the entered bearer token to localStorage within the browser
    // session so reloads keep the lock icon enabled.
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    jsonDocumentUrl: '/api/docs-json',
    customSiteTitle: 'ContentHub API',
  });
  // Serve the raw OpenAPI document so clients can fetch /api/docs-json.
  app.getHttpAdapter().get('/api/docs-json', (_req, res) => {
    res.json(document as Partial<OpenAPIObject>);
  });
  // Optionally emit a static build artifact to dist for CI / sdks.
  if (process.env.WRITERSWAPI_DOC === '1') {
    writeFileSync('dist/openapi.json', JSON.stringify(document, null, 2));
  }

  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ContentHub API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
