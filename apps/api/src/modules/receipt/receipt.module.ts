import { Module } from '@nestjs/common';
import { ReceiptController } from './receipt.controller';
import {
  NoopScreenshotProvider,
  PublishReceiptService,
  ScreenshotProvider,
} from './receipt.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  controllers: [ReceiptController],
  providers: [
    PublishReceiptService,
    {
      // The screenshot-capture seam. Swap `useClass` for a Playwright/Puppeteer
      // provider once a headless browser is available.
      provide: ScreenshotProvider,
      useClass: NoopScreenshotProvider,
    },
  ],
  exports: [PublishReceiptService],
})
export class ReceiptModule {}
