import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import {
  getRule,
  listRules,
  PLATFORM_ORDER,
  PlatformRule,
} from './platform-rules';

/**
 * Result of projecting a single piece of content against one platform's rules.
 * The engine never mutates persisted state — it is a pure projection the
 * publish pipeline and the live preview pane both consume.
 */
export interface PlatformAdaptation {
  platform: string;
  label: string;
  /** Whether the content fits the platform with no modifications needed. */
  fits: boolean;
  /** Whether the body was (or would be) truncated to fit maxLength. */
  truncated: boolean;
  /** The adapted body to actually send (truncated with ellipsis if needed). */
  adaptedBody: string;
  /** Original body length in characters. */
  bodyLength: number;
  maxLength: number;
  /** Image count after culling (the first imageMax are kept). */
  imagesUsed: number;
  imagesDropped: number;
  imageMax: number;
  /** Video count after culling (the first videoMax are kept). */
  videosUsed: number;
  videosDropped: number;
  videoMax: number;
  /** False when the primary video is shorter than the platform floor. */
  durationOk: boolean;
  minDurationSec: number;
  /** Human-readable issues the author should review. */
  warnings: string[];
  /** Platform-specific editorial hints. */
  hints: string[];
}

export interface AdaptationResult {
  contentType: string;
  /** Per-platform projections, in canonical platform order. */
  platforms: PlatformAdaptation[];
}

export interface AdaptationInput {
  body?: string | null;
  contentType?: string;
  imageCount?: number;
  videoCount?: number;
  videoDurationSec?: number;
  /** When provided, only these platforms are projected. */
  platforms?: string[];
}

@Injectable()
export class AdaptationService {
  /** Return the full rule catalog (optionally for a single platform). */
  getRules(platform?: string): PlatformRule | PlatformRule[] {
    return platform ? (getRule(platform) ?? []) : listRules();
  }

  /**
   * Project content against the requested platforms. Pure and deterministic —
   * safe to call from both the publish pipeline and the live preview pane.
   */
  adapt(input: AdaptationInput): AdaptationResult {
    const body = input.body ?? '';
    const contentType = input.contentType ?? 'TEXT';
    const imageCount = Math.max(0, input.imageCount ?? 0);
    const videoCount = Math.max(0, input.videoCount ?? 0);
    const videoDurationSec = Math.max(0, input.videoDurationSec ?? 0);

    const targets = this.resolveTargets(input.platforms);

    const platforms = targets.map((p) =>
      this.adaptForPlatform(getRule(p)!, {
        body,
        contentType,
        imageCount,
        videoCount,
        videoDurationSec,
      }),
    );

    return { contentType, platforms };
  }

  /**
   * Resolve the list of platforms to project against. An empty/unspecified
   * list means "all supported platforms" in canonical display order.
   */
  private resolveTargets(platforms?: string[]): string[] {
    if (platforms && platforms.length > 0) {
      // Keep canonical order but honour the caller's selection, dropping any
      // platform that has no rule (unknown/typo'd values) silently.
      const known = new Set(platforms);
      return PLATFORM_ORDER.filter((p) => known.has(p));
    }
    return [...PLATFORM_ORDER];
  }

  private adaptForPlatform(
    rule: PlatformRule,
    input: {
      body: string;
      contentType: string;
      imageCount: number;
      videoCount: number;
      videoDurationSec: number;
    },
  ): PlatformAdaptation {
    const warnings: string[] = [];

    // --- Body length ---
    const bodyLength = input.body.length;
    let adaptedBody = input.body;
    let truncated = false;
    if (bodyLength > rule.maxLength) {
      // Reserve 1 char for the ellipsis so we stay strictly within the limit.
      adaptedBody = input.body.slice(0, Math.max(0, rule.maxLength - 1)).trimEnd() + '…';
      truncated = true;
      warnings.push(
        `正文超出${rule.label}的${rule.maxLength}字上限，已自动截断（${bodyLength}→${rule.maxLength}字）`,
      );
    }

    // --- Images ---
    const imagesUsed = Math.min(input.imageCount, rule.imageMax);
    const imagesDropped = input.imageCount - imagesUsed;
    if (imagesDropped > 0) {
      warnings.push(
        `${rule.label}最多支持${rule.imageMax}张图，超出${imagesDropped}张将被舍弃`,
      );
    }

    // --- Videos ---
    const videosUsed = Math.min(input.videoCount, rule.videoMax);
    const videosDropped = input.videoCount - videosUsed;
    if (videosDropped > 0) {
      warnings.push(
        `${rule.label}最多支持${rule.videoMax}条视频，超出${videosDropped}条将被舍弃`,
      );
    }

    // --- Video duration floor ---
    let durationOk = true;
    if (input.videoCount > 0 && rule.minDurationSec > 0) {
      if (input.videoDurationSec < rule.minDurationSec) {
        durationOk = false;
        warnings.push(
          `${rule.label}要求视频至少${rule.minDurationSec}秒（当前${input.videoDurationSec}秒），可能被限流`,
        );
      }
    }

    const fits =
      !truncated &&
      imagesDropped === 0 &&
      videosDropped === 0 &&
      durationOk;

    return {
      platform: rule.platform,
      label: rule.label,
      fits,
      truncated,
      adaptedBody,
      bodyLength,
      maxLength: rule.maxLength,
      imagesUsed,
      imagesDropped,
      imageMax: rule.imageMax,
      videosUsed,
      videosDropped,
      videoMax: rule.videoMax,
      durationOk,
      minDurationSec: rule.minDurationSec,
      warnings,
      hints: rule.hints,
    };
  }

  /**
   * Convenience for the publish pipeline: given a content body + a target
   * platform, return the body to actually send (truncated if needed) plus any
   * warnings to log. Returns null when the platform is unknown so callers can
   * fall through to publishing unchanged.
   */
  adaptForPublish(
    platform: Platform | string,
    body: string,
  ): { adaptedBody: string; warnings: string[] } | null {
    const rule = getRule(platform as string);
    if (!rule) return null;

    const bodyLength = body.length;
    if (bodyLength <= rule.maxLength) {
      return { adaptedBody: body, warnings: [] };
    }
    const adaptedBody = body
      .slice(0, Math.max(0, rule.maxLength - 1))
      .trimEnd() + '…';
    return {
      adaptedBody,
      warnings: [
        `正文${bodyLength}字超出${rule.label}的${rule.maxLength}字上限，已截断后发布`,
      ],
    };
  }
}
