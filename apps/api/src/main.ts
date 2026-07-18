import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  // Swagger / OpenAPI documentation at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ContentHub API')
    .setDescription(
      'Multi-platform content management & publishing platform.\n\n' +
        'All endpoints (except `/auth/*` public actions and the OAuth callback) ' +
        'require `Authorization: Bearer <jwt>`. Obtain a token via ' +
        '`POST /auth/register` or `POST /auth/login`, and refresh it via ' +
        '`POST /auth/refresh`.',
    )
    .setVersion('1.1')
    .setContact('ContentHub', '', '')
    .setLicense('Proprietary', '')
    .addBearerAuth()
    .addServer('/api/v1', 'Current prefix')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

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
