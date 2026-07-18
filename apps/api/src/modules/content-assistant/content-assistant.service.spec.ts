import { ContentAssistantService } from './content-assistant.service';
import {
  LlmProviderFactory,
  LlmProvider,
} from './llm.service';
import {
  auditContent,
  extractTagsFromBody,
  generateVariants,
  optimizeTitles,
} from './content-assistant.service';

const heuristicProvider: LlmProvider = {
  name: 'heuristic',
  isAvailable: true,
  generate: async () => ({ text: '', provider: 'heuristic' }),
};

const mockFactory: LlmProviderFactory = {
  getProvider: () => heuristicProvider,
} as unknown as LlmProviderFactory;

describe('ContentAssistantService', () => {
  let service: ContentAssistantService;

  beforeEach(() => {
    service = new ContentAssistantService(mockFactory);
  });

  // The service is a thin deterministic wrapper over pure functions, so we
  // assert the wrapper delegates and then test the engine functions directly.

  it('instantiates', () => {
    expect(service).toBeDefined();
  });

  describe('optimizeTitles', () => {
    it('returns the requested number of distinct variants', () => {
      const result = optimizeTitles({ body: '内容创作与社交媒体运营指南', count: 4 });
      expect(result.variants).toHaveLength(4);
      expect(new Set(result.variants.map((v) => v.title)).size).toBe(4);
    });

    it('clamps count into the 1-10 range', () => {
      expect(optimizeTitles({ body: 'x', count: 0 }).variants.length).toBeGreaterThanOrEqual(1);
      expect(optimizeTitles({ body: 'x', count: 50 }).variants.length).toBeLessThanOrEqual(10);
    });

    it('uses Chinese templates for Chinese drafts and English for English', () => {
      const zh = optimizeTitles({ body: '今天我们来聊聊短视频运营的技巧', count: 3 });
      expect(zh.locale).toBe('zh');
      expect(zh.variants.every((v) => /[一-鿿]/.test(v.title))).toBe(true);

      const en = optimizeTitles({ body: 'A guide to growing your audience on social media', count: 3 });
      expect(en.locale).toBe('en');
    });

    it('is deterministic for the same draft', () => {
      const a = optimizeTitles({ body: 'deterministic draft body', count: 5 });
      const b = optimizeTitles({ body: 'deterministic draft body', count: 5 });
      expect(a.variants).toEqual(b.variants);
    });

    it('tags each variant with a strategy', () => {
      const { variants } = optimizeTitles({ body: 'strategy test', count: 2 });
      expect(variants.every((v) => v.strategy.length > 0)).toBe(true);
    });

    it('falls back to a sensible core when the body is empty', () => {
      const { variants } = optimizeTitles({ body: '', count: 3 });
      expect(variants.length).toBe(3);
      expect(variants.every((v) => v.title.length > 0)).toBe(true);
    });
  });

  describe('extractTags', () => {
    it('ranks the most frequent meaningful tokens first', () => {
      const body = '运营 运营 运营 内容 内容 短视频 短视频 短视频 短视频';
      const tags = extractTagsFromBody(body, 5);
      expect(tags[0]).toBe('短视频');
      expect(tags).toContain('运营');
      expect(tags).toContain('内容');
    });

    it('extracts and lower-cases English words, dropping stopwords', () => {
      const body =
        'The marketing team published a marketing guide about content marketing strategies';
      const tags = extractTagsFromBody(body, 10);
      expect(tags).toContain('marketing');
      expect(tags).not.toContain('the');
      expect(tags).not.toContain('about');
    });

    it('returns an empty array for an empty body', () => {
      expect(extractTagsFromBody('', 8)).toEqual([]);
    });

    it('respects the count cap', () => {
      const body = '苹果 香蕉 西瓜 葡萄 草莓 芒果 蓝莓 樱桃 柠檬 桃子';
      expect(extractTagsFromBody(body, 3)).toHaveLength(3);
    });

    it('strips markdown noise before extracting', () => {
      const body = '** bold text** and [a link](https://example.com) plus realword';
      const tags = extractTagsFromBody(body, 10);
      expect(tags).toContain('bold');
      expect(tags).toContain('realword');
    });
  });

  describe('audit', () => {
    it('flags an empty body as an error and docks the score', () => {
      const result = auditContent({ body: '' });
      expect(result.findings.some((f) => f.code === 'EMPTY_BODY')).toBe(true);
      // A single error (-25) brings 100 down to 75 → needs-work (not poor).
      expect(result.score).toBe(75);
      expect(result.grade).toBe('needs-work');
    });

    it('scores a clean, short draft as good', () => {
      const result = auditContent({
        body: 'A concise, well-written draft that respects every platform.',
      });
      expect(result.grade).toBe('good');
      expect(result.findings.some((f) => f.code === 'EMPTY_BODY')).toBe(false);
    });

    it('projects per-platform limits and flags oversized platforms', () => {
      const body = 'x'.repeat(500); // exceeds Twitter (280), fits WeChat (20000)
      const result = auditContent({ body });
      const byPlatform = Object.fromEntries(
        result.platforms.map((p) => [p.platform, p]),
      );
      expect(byPlatform.TWITTER.truncated).toBe(true);
      expect(byPlatform.WECHAT_OFFICIAL.truncated).toBe(false);
      expect(byPlatform.WECHAT_OFFICIAL.fits).toBe(true);
    });

    it('flags excessive ALL-CAPS', () => {
      const result = auditContent({ body: 'THIS IS A SHOUTY DRAFT WITH MANY UPPERCASE LETTERS' });
      expect(result.findings.some((f) => f.code === 'ALL_CAPS')).toBe(true);
    });

    it('flags repeated punctuation', () => {
      const result = auditContent({ body: 'Amazing deal!!!! Buy now???? Really!!!!' });
      expect(result.findings.some((f) => f.code === 'EXCESSIVE_PUNCTUATION')).toBe(true);
    });

    it('restricts platform projection to the requested subset in canonical order', () => {
      // Like the adaptation engine, projection always follows canonical platform
      // order regardless of the order the caller listed them in.
      const result = auditContent({ body: 'hello', platforms: ['TWITTER', 'DOUYIN'] });
      expect(result.platforms.map((p) => p.platform)).toEqual(['DOUYIN', 'TWITTER']);
    });

    it('reports dropped images beyond the platform maximum', () => {
      const result = auditContent({
        body: 'post with images',
        images: ['a', 'b', 'c', 'd', 'e'],
        platforms: ['TWITTER'],
      });
      const tw = result.platforms[0];
      expect(tw.imageMax).toBe(4);
      expect(tw.imagesDropped).toBe(1);
    });
  });

  describe('generateVariants', () => {
    it('produces all four variants when style is "all"', () => {
      const { variants } = generateVariants({ body: '今天分享几个运营小技巧，希望对大家有帮助。', style: 'all' });
      expect(variants.map((v) => v.style)).toEqual(['short', 'long', 'formal', 'social']);
    });

    it('produces only the requested style', () => {
      const { variants } = generateVariants({ body: 'Some body text here.', style: 'short' });
      expect(variants).toHaveLength(1);
      expect(variants[0].style).toBe('short');
    });

    it('keeps the short variant within the cap', () => {
      const longBody = 'A'.repeat(300);
      const { variants } = generateVariants({ body: longBody, style: 'short' });
      expect(variants[0].body.length).toBeLessThanOrEqual(130);
    });

    it('appends hashtags to the social variant', () => {
      const { variants } = generateVariants({ body: '短视频运营技巧分享', style: 'all' });
      const social = variants.find((v) => v.style === 'social');
      expect(social?.body).toContain('#');
    });

    it('detects locale from the draft', () => {
      const zh = generateVariants({ body: '中文内容', style: 'short' });
      expect(zh.locale).toBe('zh');
      const en = generateVariants({ body: 'English content body', style: 'short' });
      expect(en.locale).toBe('en');
    });
  });

  describe('service wrapper delegation', () => {
    it('optimizeTitles delegates to the pure engine', async () => {
      const result = await service.optimizeTitles({ body: 'wrapper delegation test', count: 3 });
      expect(result.variants).toHaveLength(3);
    });

    it('extractTags delegates to the pure engine', async () => {
      const result = await service.extractTags({ body: 'one one one two two three', count: 5 });
      expect(result.tags.length).toBeGreaterThan(0);
    });

    it('audit delegates to the pure engine', async () => {
      const result = await service.audit({ body: 'a'.repeat(300) });
      expect(result.platforms.length).toBeGreaterThan(0);
    });

    it('generateVariants delegates to the pure engine', async () => {
      const result = await service.generateVariants({ body: 'body', style: 'all' });
      expect(result.variants).toHaveLength(4);
    });
  });
});
