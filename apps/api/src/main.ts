import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.enableShutdownHooks();

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ContentHub API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
