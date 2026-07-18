import { AdaptationService } from './adaptation.service';
import { PLATFORM_ORDER } from './platform-rules';

describe('AdaptationService', () => {
  let service: AdaptationService;

  beforeEach(() => {
    service = new AdaptationService();
  });

  describe('adapt — default targets', () => {
    it('projects against all supported platforms when none are specified', () => {
      const result = service.adapt({ body: 'hello' });
      expect(result.platforms).toHaveLength(PLATFORM_ORDER.length);
      expect(result.platforms.map((p) => p.platform)).toEqual(PLATFORM_ORDER);
    });

    it('honours a caller-selected subset in canonical order', () => {
      const result = service.adapt({
        body: 'hello',
        platforms: ['DOUYIN', 'WEIBO', 'BILIBILI'],
      });
      // Canonical display order is preserved regardless of call order.
      expect(result.platforms.map((p) => p.platform)).toEqual([
        'DOUYIN',
        'BILIBILI',
        'WEIBO',
      ]);
    });

    it('drops unknown platform values silently', () => {
      const result = service.adapt({
        body: 'hello',
        platforms: ['DOUYIN', 'NOT_A_PLATFORM'],
      });
      expect(result.platforms.map((p) => p.platform)).toEqual(['DOUYIN']);
    });
  });

  describe('adapt — body length', () => {
    it('marks short bodies as fitting and passes them through unchanged', () => {
      const result = service.adapt({ body: 'short', platforms: ['TWITTER'] });
      const tw = result.platforms[0];
      expect(tw.fits).toBe(true);
      expect(tw.truncated).toBe(false);
      expect(tw.adaptedBody).toBe('short');
      expect(tw.warnings).toHaveLength(0);
    });

    it('does not truncate when body equals the limit exactly', () => {
      const body = 'a'.repeat(280);
      const result = service.adapt({ body, platforms: ['TWITTER'] });
      expect(result.platforms[0].truncated).toBe(false);
      expect(result.platforms[0].adaptedBody).toBe(body);
    });

    it('truncates bodies that exceed the limit and stays within it', () => {
      const body = 'x'.repeat(300);
      const result = service.adapt({ body, platforms: ['TWITTER'] });
      const tw = result.platforms[0];
      expect(tw.truncated).toBe(true);
      expect(tw.fits).toBe(false);
      expect(tw.adaptedBody.length).toBeLessThanOrEqual(280);
      expect(tw.adaptedBody.endsWith('…')).toBe(true);
      expect(tw.warnings[0]).toContain('280');
    });

    it('applies per-platform limits (Twitter short, WeChat Official long)', () => {
      const body = 'y'.repeat(500);
      const result = service.adapt({
        body,
        platforms: ['TWITTER', 'WECHAT_OFFICIAL'],
      });
      const byPlatform = Object.fromEntries(
        result.platforms.map((p) => [p.platform, p]),
      );
      expect(byPlatform.TWITTER.truncated).toBe(true);
      expect(byPlatform.WECHAT_OFFICIAL.truncated).toBe(false);
      expect(byPlatform.WECHAT_OFFICIAL.adaptedBody).toBe(body);
    });

    it('treats an empty/undefined body as fitting', () => {
      const r1 = service.adapt({ platforms: ['DOUYIN'] });
      const r2 = service.adapt({ body: undefined, platforms: ['DOUYIN'] });
      expect(r1.platforms[0].fits).toBe(true);
      expect(r2.platforms[0].fits).toBe(true);
    });
  });

  describe('adapt — media culling', () => {
    it('keeps images up to the platform maximum and drops the rest', () => {
      const result = service.adapt({
        body: 'post',
        imageCount: 10,
        platforms: ['TWITTER'],
      });
      const tw = result.platforms[0];
      expect(tw.imagesUsed).toBe(4);
      expect(tw.imagesDropped).toBe(6);
      expect(tw.fits).toBe(false);
      expect(tw.warnings.some((w) => w.includes('4张'))).toBe(true);
    });

    it('does not modify image counts when within the limit', () => {
      const result = service.adapt({
        body: 'post',
        imageCount: 3,
        platforms: ['TWITTER'],
      });
      expect(result.platforms[0].imagesDropped).toBe(0);
    });

    it('drops all images on image-less platforms (YouTube)', () => {
      const result = service.adapt({
        body: 'post',
        imageCount: 5,
        platforms: ['YOUTUBE'],
      });
      const yt = result.platforms[0];
      expect(yt.imageMax).toBe(0);
      expect(yt.imagesUsed).toBe(0);
      expect(yt.imagesDropped).toBe(5);
    });

    it('caps videos at the platform maximum and drops extras', () => {
      const result = service.adapt({
        body: 'post',
        videoCount: 3,
        platforms: ['DOUYIN'],
      });
      const dy = result.platforms[0];
      expect(dy.videosUsed).toBe(1);
      expect(dy.videosDropped).toBe(2);
      expect(dy.warnings.some((w) => w.includes('1条'))).toBe(true);
    });

    it('never reports negative counts for negative inputs', () => {
      const result = service.adapt({
        body: 'post',
        imageCount: -5,
        videoCount: -2,
        platforms: ['TWITTER'],
      });
      expect(result.platforms[0].imagesUsed).toBe(0);
      expect(result.platforms[0].videosUsed).toBe(0);
    });
  });

  describe('adapt — video duration floor', () => {
    it('flags videos shorter than the Douyin minimum', () => {
      const result = service.adapt({
        body: 'post',
        videoCount: 1,
        videoDurationSec: 10,
        platforms: ['DOUYIN'],
      });
      const dy = result.platforms[0];
      expect(dy.durationOk).toBe(false);
      expect(dy.fits).toBe(false);
      expect(dy.warnings.some((w) => w.includes('15'))).toBe(true);
    });

    it('passes videos at or above the Douyin minimum', () => {
      const result = service.adapt({
        body: 'post',
        videoCount: 1,
        videoDurationSec: 30,
        platforms: ['DOUYIN'],
      });
      expect(result.platforms[0].durationOk).toBe(true);
    });

    it('does not enforce a duration floor for text-only posts', () => {
      const result = service.adapt({
        body: 'post',
        videoCount: 0,
        videoDurationSec: 0,
        platforms: ['DOUYIN'],
      });
      expect(result.platforms[0].durationOk).toBe(true);
    });

    it('does not flag duration on platforms without a floor', () => {
      const result = service.adapt({
        body: 'post',
        videoCount: 1,
        videoDurationSec: 5,
        platforms: ['TWITTER'],
      });
      expect(result.platforms[0].durationOk).toBe(true);
    });
  });

  describe('adapt — combined fit + warnings + hints', () => {
    it('surfaces platform-specific editorial hints', () => {
      const result = service.adapt({ body: 'post', platforms: ['DOUYIN'] });
      expect(result.platforms[0].hints.length).toBeGreaterThan(0);
    });

    it('produces a clean fit when everything is within limits', () => {
      const result = service.adapt({
        body: 'a nice short post',
        imageCount: 2,
        videoCount: 1,
        videoDurationSec: 30,
        platforms: ['DOUYIN'],
      });
      const dy = result.platforms[0];
      expect(dy.fits).toBe(true);
      expect(dy.warnings).toHaveLength(0);
    });
  });

  describe('adaptForPublish (pipeline convenience)', () => {
    it('returns null for unknown platforms so callers can fall through', () => {
      expect(service.adaptForPublish('NOPE', 'body')).toBeNull();
    });

    it('passes through an in-limit body unchanged with no warnings', () => {
      const out = service.adaptForPublish('TWITTER', 'ok');
      expect(out).toEqual({ adaptedBody: 'ok', warnings: [] });
    });

    it('truncates an over-limit body and reports a warning', () => {
      const body = 'z'.repeat(300);
      const out = service.adaptForPublish('TWITTER', body);
      expect(out).not.toBeNull();
      expect(out!.adaptedBody.length).toBeLessThanOrEqual(280);
      expect(out!.warnings).toHaveLength(1);
    });
  });

  describe('getRules', () => {
    it('returns the full catalog when no platform is given', () => {
      const rules = service.getRules() as unknown[];
      expect(rules).toHaveLength(PLATFORM_ORDER.length);
    });

    it('returns a single rule when a platform is given', () => {
      const rule = service.getRules('TWITTER') as { platform: string };
      expect(rule.platform).toBe('TWITTER');
    });

    it('returns an empty array for an unknown platform', () => {
      expect(service.getRules('NOPE')).toEqual([]);
    });
  });
});
