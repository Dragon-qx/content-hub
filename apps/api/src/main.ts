import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT ?? 3000;

  // Serve uploaded media files at /uploads/* (development only)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    index: false,
    maxAge: '1d',
  });

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
    (res as unknown as { json: (data: unknown) => void }).json(document as Partial<OpenAPIObject>);
  });
  // Optionally emit a static build artifact to dist for CI / sdks.
  if (process.env.WRITERSWAPI_DOC === '1') {
    writeFileSync('dist/openapi.json', JSON.stringify(document, null, 2));
  }

  app.setGlobalPrefix('api/v1');

  // CORS: allowlist of trusted origins (dev + production)
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3001,http://localhost:3000')
    .split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  });

  // Security headers (Helmet-lite)
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Trust proxy (configure based on environment)
  if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Request ID + structured logging middleware
  app.use((req: any, res: any, next: () => void) => {
    // Generate or propagate request ID
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startTime = Date.now();
    const { method, originalUrl } = req;

    // Log request start
    const reqLogger = new Logger('HTTP');
    reqLogger.log(`[${requestId}] ${method} ${originalUrl} - started`);

    // Log response finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';
      reqLogger[level](`[${requestId}] ${method} ${originalUrl} ${statusCode} - ${duration}ms`);
    });

    next();
  });

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
  logger.log(`ContentHub API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
