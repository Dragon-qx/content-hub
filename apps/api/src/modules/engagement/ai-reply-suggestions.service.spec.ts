import { Test } from '@nestjs/testing';
import { AiReplySuggestionsService } from './ai-reply-suggestions.service';

describe('AiReplySuggestionsService', () => {
  let service: AiReplySuggestionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AiReplySuggestionsService],
    }).compile();
    service = module.get(AiReplySuggestionsService);
  });

  const neg: Parameters<AiReplySuggestionsService['suggest']>[1] = {
    sentiment: 'NEGATIVE',
    sentimentScore: -0.8,
    content: 'This product is broken, want a refund',
    likeCount: 2,
    replied: false,
  };

  const negChinese: Parameters<AiReplySuggestionsService['suggest']>[1] = {
    sentiment: 'NEGATIVE',
    sentimentScore: -0.9,
    content: '质量很差，要求退款',
    likeCount: 4,
    replied: false,
    isPurchaser: true,
  };

  const posChinese: Parameters<AiReplySuggestionsService['suggest']>[1] = {
    sentiment: 'POSITIVE',
    sentimentScore: 0.8,
    content: '非常喜欢，推荐购买！',
    likeCount: 12,
    replied: false,
  };

  const question: Parameters<AiReplySuggestionsService['suggest']>[1] = {
    sentiment: 'NEUTRAL',
    sentimentScore: 0,
    content: '这个是否支持退换货？',
    likeCount: 0,
    replied: false,
  };

  it('returns 2 suggestions per call', () => {
    const res = service.suggest('c1', neg);
    expect(res.suggestions.length).toBe(2);
    for (const s of res.suggestions) {
      expect(s.text.length).toBeGreaterThan(0);
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('classifies a negative comment as complaint with empathetic/professional variant', () => {
    const res = service.suggest('c1', neg);
    expect(res.signal.intent).toBe('complaint');
    expect(['empathetic', 'professional']).toContain(res.suggestions[0].variant);
  });

  it('uses a professional tone for verified/purchaser-heavy complaints', () => {
    const res = service.suggest('c1', { ...neg, isPurchaser: true, likeCount: 6 });
    expect(res.suggestions[0].variant).toBe('professional');
  });

  it('classifies a grateful tone for positive comments', () => {
    const res = service.suggest('c1', posChinese);
    expect(res.signal.intent).toBe('praise');
    expect(res.suggestions[0].variant).toBe('grateful');
  });

  it('classifies question intent and uses helpful variant', () => {
    const res = service.suggest('c1', question);
    expect(res.signal.intent).toBe('question');
    expect(res.suggestions[0].variant).toBe('helpful');
  });

  it('detects topics present in the content', () => {
    const res = service.suggest('c1', negChinese);
    expect(res.signal.topics).toContain('quality');
    expect(res.signal.topics).toContain('refund');
  });

  it('renders Chinese bodies in Chinese for the empathetic variant', () => {
    const res = service.suggest('c1', { ...negChinese, isPurchaser: false, sentimentScore: -0.6, likeCount: 1 });
    expect(res.suggestions[0].variant).toBe('empathetic');
    // Chinese content → Chinese suggestion
    expect(/[一-龥]/.test(res.suggestions[0].text)).toBe(true);
  });

  it('labels praise as grateful (confidence window respected)', () => {
    const res = service.suggest('c1', { ...posChinese, sentimentScore: 0.9 });
    expect(res.suggestions[0].confidence).toBeLessThanOrEqual(0.99);
    expect(res.suggestions[0].confidence).toBeGreaterThanOrEqual(0.2);
  });
});
