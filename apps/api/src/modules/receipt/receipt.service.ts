import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Platform, PublishReceipt, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaService } from '../media/media.service';

/**
 * Result of attempting a platform screenshot capture. The default seam returns
 * `{ captured: false }` because no headless browser is available — a real
 * adapter (Playwright/Puppeteer) swaps in by injecting a different
 * ScreenshotProvider and fullfills `{ captured: true, asset, ... }`.
 */
export interface ScreenshotResult {
  captured: boolean;
  assetId?: string;
  url?: string;
  note?: string;
}

/**
 * ScreenshotProvider seam — capture a headless snapshot of the published
 * external URL. Injected via DI; the default implementation is a no-op that
 * signals the caller to fall back to the card-image receipt. Wire a real one by
 * providing 'SCREENSHOT_PROVIDER' with a Playwright-backed implementation.
 */
export abstract class ScreenshotProvider {
  abstract capture(
    externalUrl: string,
    context: { contentId: string; platform: Platform; externalId?: string },
  ): Promise<ScreenshotResult>;
}

/** Default seam — no headless browser available; emit the fallback signal. */
@Injectable()
export class NoopScreenshotProvider extends ScreenshotProvider {
  async capture(): Promise<ScreenshotResult> {
    return {
      captured: false,
      note: 'Screenshot capture disabled (no SCREENSHOT_PROVIDER configured)',
    };
  }
}

export interface GenerateReceiptInput {
  contentId: string;
  platform: Platform;
  externalId?: string;
  externalUrl?: string;
  platformPostId?: string;
  accountId?: string;
  /** Retry-safe: re-run only if a receipt doesn't already exist. */
  idempotent?: boolean;
}

@Injectable()
export class PublishReceiptService {
  private readonly logger = new Logger(PublishReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly screenshot: ScreenshotProvider,
  ) {}

  /**
   * Build the deterministic receipt hash (a server-signed summary of the
   * (contentId, platform, externalId) tuple). Two receipts with the same hash
   * are identical by design — used both for idempotency and for tamper
   * verification by a future auditor.
   */
  receiptHashFor(input: GenerateReceiptInput): string {
    const blob = [
      input.contentId,
      input.platform,
      input.externalId ?? '',
      input.platformPostId ?? '',
    ].join('|');
    return createHash('sha256').update(blob).digest('hex');
  }

  /**
   * Generate a publish receipt. Attempts a screenshot capture (via the seam),
   * falls back to a card-image (sharp-built PNG of the publish metadata),
   * seals a receipt hash, and persists a PublishReceipt row + linked MediaAsset.
   * Idempotent by default — returns the existing receipt if one already carries
   * the same hash.
   */
  async generate(
    input: GenerateReceiptInput,
  ): Promise<{ receipt: PublishReceipt; asset: unknown; screenshotCaptured: boolean }> {
    if (!input.contentId || !input.platform) {
      throw new BadRequestException('contentId and platform are required');
    }

    const hash = this.receiptHashFor(input);

    const existing = await this.prisma.publishReceipt.findUnique({
      where: { receiptHash: hash },
    });
    if (existing && input.idempotent !== false) {
      return {
        receipt: existing,
        asset: null,
        screenshotCaptured: existing.assetId != null,
      };
    }
    if (existing) {
      throw new ConflictException('A receipt already exists for this publish');
    }

    // Try screenshot capture first.
    let screenshot: ScreenshotResult = { captured: false };
    if (input.externalUrl) {
      try {
        screenshot = await this.screenshot.capture(input.externalUrl, {
          contentId: input.contentId,
          platform: input.platform,
          externalId: input.externalId,
        });
      } catch (err) {
        this.logger.warn(
          `Screenshot capture failed (proceeding without): ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    // Always produce a card image as the retained-receipt artifact (either as
    // the screenshot companion or as the standalone fallback).
    const cardGen = await this.media.buildReceiptCard({
      contentId: input.contentId,
      platform: input.platform,
      externalId: input.externalId,
      externalUrl: input.externalUrl,
      generatedAt: new Date(),
    });
    const asset = await this.media.attachReceiptCard(cardGen.buffer, {
      width: cardGen.width,
      height: cardGen.height,
      mimeType: 'image/png',
    });

    const receipt = await this.prisma.publishReceipt.create({
      data: {
        contentId: input.contentId,
        platformPostId: input.platformPostId ?? null,
        accountId: input.accountId ?? null,
        platform: input.platform,
        externalId: input.externalId,
        externalUrl: input.externalUrl,
        receiptHash: hash,
        metadata: {
          screenshot: screenshot.captured ? { captured: true } : { captured: false },
          note: screenshot.note,
        },
        assetId: screenshot.assetId ?? asset.id,
      },
      include: { asset: true },
    });

    this.logger.log(
      `Receipt ${receipt.id}: content=${input.contentId} platform=${input.platform} screenshot=${screenshot.captured}`,
    );

    return { receipt, asset, screenshotCaptured: screenshot.captured };
  }

  async listByContent(contentId: string) {
    return this.prisma.publishReceipt.findMany({
      where: { contentId },
      orderBy: { generatedAt: 'desc' },
      include: { asset: true },
    });
  }

  async get(id: string) {
    const receipt = await this.prisma.publishReceipt.findUnique({
      where: { id },
      include: { asset: true, content: { select: { title: true } } },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  /** Verify that a stored receipt's hash still matches its input tuple. */
  async verify(id: string): Promise<{ id: string; valid: boolean }> {
    const receipt = await this.prisma.publishReceipt.findUnique({
      where: { id },
      select: {
        id: true,
        contentId: true,
        platform: true,
        externalId: true,
        platformPostId: true,
        receiptHash: true,
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    const expected = this.receiptHashFor({
      contentId: receipt.contentId,
      platform: receipt.platform,
      externalId: receipt.externalId ?? undefined,
      platformPostId: receipt.platformPostId ?? undefined,
    });
    return { id, valid: expected === receipt.receiptHash };
  }
}
