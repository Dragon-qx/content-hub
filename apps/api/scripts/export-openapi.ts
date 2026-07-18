/**
 * Boots the NestJS app without listening, builds the OpenAPI document and
 * writes it to apps/api/dist/openapi.json. Run with:
 *   pnpm --filter=@content-hub/api openapi
 * The file is consumed by CI sanity checks and downstream SDK generators.
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('ContentHub API')
    .setDescription('Multi-platform content management & publishing platform.')
    .setVersion('1.1')
    .addBearerAuth()
    .addServer('/api/v1', 'Current prefix')
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });

  const outDir = join(__dirname, '..', 'dist');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'openapi.json');
  writeFileSync(outFile, JSON.stringify(document, null, 2));
  // eslint-disable-next-line no-console
  console.log(`OpenAPI document written to ${outFile}`);
  await app.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
