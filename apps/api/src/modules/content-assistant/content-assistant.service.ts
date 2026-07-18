import { Injectable, Logger } from '@nestjs/common';
import { ContentType } from '@prisma/client';
import {
  getRule,
  PLATFORM_ORDER,
  PlatformRule,
} from '../adaptation/platform-rules';
import {
  LlmProviderFactory,
  LlmRequest,
  HeuristicLlmProvider,
} from './llm.service';
import {
  AssistantDraftDto,
  ContentAuditDto,
  TagExtractDto,
  TitleOptimizeDto,
  VariantGenerateDto,
} from './dto/content-assistant.dto';

export interface TitleVariant {
  title: string;
  strategy: string;
}

export interface TitleOptimizeResult {
  contentType: string;
  locale: 'zh' | 'en';
  variants: TitleVariant[];
}

export interface TagExtractResult {
  tags: string[];
}

export type AuditSeverity = 'info' | 'warning' | 'error';

export interface AuditFinding {
  code: string;
  severity: AuditSeverity;
  message: string;
  platform?: string;
}

export interface PlatformAudit {
  platform: string;
  label: string;
  fits: boolean;
  bodyLength: number;
  maxLength: number;
  truncated: boolean;
  imagesUsed: number;
  imagesDropped: number;
  imageMax: number;
  videosUsed: number;
  videosDropped: number;
  videoMax: number;
  durationOk: boolean;
  minDurationSec: number;
  warnings: string[];
}

export interface ContentAuditResult {
  contentType: string;
  score: number;
  grade: 'good' | 'needs-work' | 'poor';
  findings: AuditFinding[];
  platforms: PlatformAudit[];
}

export type VariantStyle = 'short' | 'long' | 'formal' | 'social';

export interface CopyVariant {
  style: VariantStyle;
  label: string;
  body: string;
}

export interface VariantGenerateResult {
  contentType: string;
  locale: 'zh' | 'en';
  variants: CopyVariant[];
}

const CJK = /[一-鿿]/;
function hasCjk(text: string): boolean {
  return CJK.test(text);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`~`>-]/g, ' ')
    .replace(/[\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function coreSnippet(text: string, max = 14): string {
  const cleaned = stripMarkdown(text);
  if (!cleaned) return '';
  const first = cleaned.split(/[。.!?！？\n]+/)[0].trim();
  const base = first || cleaned;
  return base.length > max ? `${base.slice(0, max)}…` : base;
}

const ZH_TEMPLATES = (core: string, n: number) => [
  { title: `如何掌握${core}？这${n}个要点必看`, strategy: 'how-to' },
  { title: `${core}的${n}个实用技巧`, strategy: 'list' },
  { title: `为什么大家都在讨论${core}？`, strategy: 'question' },
  { title: `${core}：完整指南`, strategy: 'guide' },
  { title: `从入门到精通：${core}`, strategy: 'journey' },
  { title: `${n}分钟读懂${core}`, strategy: 'time-box' },
  { title: `别再误解${core}了`, strategy: 'myth' },
  { title: `${core}，你真的了解吗？`, strategy: 'curiosity' },
];

const EN_TEMPLATES = (core: string, n: number) => [
  { title: `${core}: A Complete Guide`, strategy: 'guide' },
  { title: `How to Master ${core} in ${n} Steps`, strategy: 'how-to' },
  { title: `Why ${core} Matters`, strategy: 'question' },
  { title: `${n} Tips for ${core}`, strategy: 'list' },
  { title: `The Truth About ${core}`, strategy: 'myth' },
  { title: `${core} Explained`, strategy: 'explain' },
  { title: `Getting Started with ${core}`, strategy: 'journey' },
  { title: `${core}: What You Need to Know`, strategy: 'curiosity' },
];

function seedFrom(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function optimizeTitles(dto: TitleOptimizeDto): TitleOptimizeResult {
  const body = dto.body ?? '';
  const contentType = dto.contentType ?? 'TEXT';
  const count = Math.min(Math.max(dto.count ?? 5, 1), 10);
  const locale = hasCjk(body) || hasCjk(dto.title ?? '') ? 'zh' : 'en';
  const core = coreSnippet(body) || (locale === 'zh' ? '内容创作' : 'Content');
  const n = 3 + (seedFrom(body || core) % 6);
  const templates = locale === 'zh' ? ZH_TEMPLATES(core, n) : EN_TEMPLATES(core, n);
  const start = seedFrom(body || core) % templates.length;
  const variants: TitleVariant[] = [];
  for (let i = 0; i < Math.min(count, templates.length); i++) {
    variants.push(templates[(start + i) % templates.length]);
  }
  return { contentType, locale, variants };
}

const EN_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
  'from', 'as', 'into', 'about', 'between', 'through', 'during', 'before',
  'after', 'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your',
  'we', 'our', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'i', 'my',
  'me', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'may',
  'might', 'have', 'has', 'had', 'not', 'no', 'so', 'than', 'too', 'very',
  'just', 'some', 'any', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'such', 'only', 'own', 'same', 'there', 'which', 'what', 'when',
  'where', 'who', 'how', 'then', 'also', 'new', 'one', 'two',
]);

const CJK_STOPWORDS = new Set(
  '的 了 是 在 我 你 他 她 它 们 就 不 也 都 还 很 会 要 能 可以 和 与 及 或 但 而 这 那 有 个 上 下 中 对 为 之 等 把 被 从 到 给 让 向 将 又 只 最 更 非常 已经 因为 所以 如果 虽然 但是 然后 而且 或者 就是 不是 还是 那个 这个 什么 怎么 怎样 如何 为什么 哪里 人们 大家 我们 你们 他们 自己 其中 一直 应该 需要 必须 可能 一定 之间 方面 部分 问题 情况 工作 生活 时间 时候 今天 现在 目前 真的 知道 觉得 认为 发现 使用 进行 提供 包括 通过 关于 对于 能够 得到 成为 作为 出现 产生 形成 完成 实现 建立 开发 制作 创作 写 作'.split(' '),
);

export function extractTagsFromBody(body: string, count: number): string[] {
  const cleaned = stripMarkdown(body);
  if (!cleaned) return [];
  const tokens: string[] = [];
  const en = cleaned.toLowerCase().match(/[a-z][a-z0-9']{2,}/g);
  if (en) tokens.push(...en);
  const cjkRuns = cleaned.match(/[一-鿿]+/g);
  if (cjkRuns) {
    for (const run of cjkRuns) {
      if (run.length >= 2 && run.length <= 5) {
        tokens.push(run);
      } else if (run.length > 5) {
        for (let i = 0; i < run.length - 1; i++) {
          tokens.push(run.slice(i, i + 2));
        }
      }
    }
  }
  const freq = new Map<string, number>();
  for (const t of tokens) {
    const stop = /^[a-z]/.test(t) ? EN_STOPWORDS.has(t) : CJK_STOPWORDS.has(t);
    if (stop) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([t]) => t);
}

export function extractTags(dto: TagExtractDto): TagExtractResult {
  const count = Math.min(Math.max(dto.count ?? 8, 1), 20);
  return { tags: extractTagsFromBody(dto.body ?? '', count) };
}

export function auditContent(dto: ContentAuditDto): ContentAuditResult {
  const body = dto.body ?? '';
  const contentType = dto.contentType ?? 'TEXT';
  const findings: AuditFinding[] = [];
  const cleaned = stripMarkdown(body);
  const bodyLength = cleaned.length;
  const zh = hasCjk(cleaned);

  if (bodyLength === 0) {
    findings.push({
      code: 'EMPTY_BODY',
      severity: 'error',
      message: zh ? '正文为空，请先撰写内容。' : 'Body is empty.',
    });
  } else {
    const MIN_LENGTH = 20;
    if (bodyLength < MIN_LENGTH) {
      findings.push({
        code: 'BODY_TOO_SHORT',
        severity: 'warning',
        message: zh
          ? `正文过短（${bodyLength}字），建议至少${MIN_LENGTH}字以提升深度。`
          : `Body is short (${bodyLength} chars).`,
      });
    }
    if (bodyLength > 20000) {
      findings.push({
        code: 'BODY_TOO_LONG',
        severity: 'warning',
        message: zh
          ? `正文过长（${bodyLength}字），考虑拆分为系列内容。`
          : `Body is very long (${bodyLength} chars); consider a series.`,
      });
    }
  }

  const hashtagCount = (body.match(/#[一-鿿a-zA-Z0-9_]+/g) ?? []).length;
  if (hashtagCount > 10) {
    findings.push({
      code: 'TOO_HASHTAGS',
      severity: 'warning',
      message: zh
        ? `使用了${hashtagCount}个话题标签，建议精简到10个以内。`
        : `${hashtagCount} hashtags used; consider trimming to under 10.`,
    });
  }

  const upperCaseChars = (body.match(/[A-Z]/g) ?? []).length;
  const totalChars = body.length;
  if (totalChars > 20 && upperCaseChars / totalChars > 0.5) {
    findings.push({
      code: 'ALL_CAPS',
      severity: 'warning',
      message: zh
        ? '过多大写字母，建议适当使用以提升可读性。'
        : 'Excessive uppercase letters; consider mixed case for readability.',
    });
  }

  const repeatedPunctuation = (body.match(/([！!？?]){2,}/g) ?? []);
  if (repeatedPunctuation.length > 0) {
    findings.push({
      code: 'EXCESSIVE_PUNCTUATION',
      severity: 'warning',
      message: zh
        ? '存在重复标点符号（如 !!!!、????），建议精简以提升专业感。'
        : 'Repeated punctuation marks (e.g. !!!!, ????); consider trimming for professionalism.',
    });
  }

  const imageCount = (dto.images?.length ?? 0) || (body.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length;
  const videoCount = (dto.videos?.length ?? 0) || (body.match(/(youtube\.com\/watch|vimeo\.com\/[0-9]+|bilibili\.com\/video\/[A-Za-z0-9]+)/g) ?? []).length;
  const videoDurationSec = dto.videoDurationSec ?? 0;

  const requestedPlatforms = dto.platforms?.length
    ? [...dto.platforms].sort((a, b) => PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b))
    : PLATFORM_ORDER;

  const platforms = requestedPlatforms.map((p) => {
    const rule: PlatformRule = getRule(p) ?? {
      platform: p,
      label: p,
      maxLength: 2000,
      imageMax: 0,
      videoMax: 0,
      minDurationSec: 0,
      hints: [],
    };
    const truncated = bodyLength > rule.maxLength;
    const imagesUsed = Math.min(imageCount, rule.imageMax);
    const imagesDropped = imageCount - imagesUsed;
    const videosUsed = Math.min(videoCount, rule.videoMax);
    const videosDropped = videoCount - videosUsed;
    const warnings: string[] = [];

    if (truncated) {
      warnings.push(
        zh
          ? `${rule.label}最多${rule.maxLength}字（当前${bodyLength}字），超出部分将被截断。`
          : `${rule.label} keeps ${rule.maxLength} chars (${bodyLength} used).`,
      );
    }
    if (imagesDropped > 0) {
      warnings.push(
        zh
          ? `${rule.label}最多${rule.imageMax}张图，将丢弃${imagesDropped}张。`
          : `${rule.label} keeps ${rule.imageMax} images; ${imagesDropped} dropped.`,
      );
    }
    if (videosDropped > 0) {
      warnings.push(
        zh
          ? `${rule.label}最多${rule.videoMax}条视频，将丢弃${videosDropped}条。`
          : `${rule.label} keeps ${rule.videoMax} videos; ${videosDropped} dropped.`,
      );
    }
    let durationOk = true;
    if (videoCount > 0 && rule.minDurationSec > 0 && videoDurationSec < rule.minDurationSec) {
      durationOk = false;
      warnings.push(
        zh
          ? `${rule.label}要求视频≥${rule.minDurationSec}秒（当前${videoDurationSec}秒），可能被限流。`
          : `${rule.label} requires ≥${rule.minDurationSec}s video (${videoDurationSec}s).`,
      );
    }

    return {
      platform: p,
      label: rule?.label ?? p,
      fits: !truncated && imagesDropped === 0 && videosDropped === 0 && durationOk,
      bodyLength,
      maxLength: rule?.maxLength ?? 0,
      truncated,
      imagesUsed,
      imagesDropped,
      imageMax: rule?.imageMax ?? 0,
      videosUsed,
      videosDropped,
      videoMax: rule?.videoMax ?? 0,
      durationOk,
      minDurationSec: rule?.minDurationSec ?? 0,
      warnings,
    };
  });

  for (const pa of platforms) {
    if (pa.warnings.length) {
      findings.push({
        code: `PLATFORM_${pa.platform}`,
        severity: pa.fits ? 'info' : 'warning',
        message: `${pa.label}: ${pa.warnings[0]}`,
        platform: pa.platform,
      });
    }
  }

  let score = 100;
  for (const f of findings) {
    score -= f.severity === 'error' ? 25 : f.severity === 'warning' ? 10 : 3;
  }
  score = Math.max(0, Math.min(100, score));
  const grade: ContentAuditResult['grade'] =
    score >= 80 ? 'good' : score >= 50 ? 'needs-work' : 'poor';

  return { contentType, score, grade, findings, platforms };
}

function firstSentence(text: string, cap: number): string {
  const parts = stripMarkdown(text).split(/[。.!?！？\n]+/).filter(Boolean);
  const first = (parts[0] ?? '').trim();
  if (!first) return '';
  return first.length > cap ? `${first.slice(0, cap)}…` : first;
}

const EMOJI_BY_TYPE: Record<string, string[]> = {
  TEXT: ['✍️', '📝', '💡'],
  IMAGE: ['📸', '🖼️', '🎨'],
  VIDEO: ['🎬', '📹', '▶️'],
  CAROUSEL: ['🎞️', '📚', '🔖'],
  THREAD: ['🧵', '💬', '🗂️'],
  ARTICLE: ['📰', '📖', '🔍'],
};
const FALLBACK_EMOJI = ['✨', '🚀', '🎯'];

function pickEmoji(contentType: string, seed: number): string {
  const set = EMOJI_BY_TYPE[contentType] ?? FALLBACK_EMOJI;
  return set[seed % set.length];
}

export function generateVariants(dto: VariantGenerateDto): VariantGenerateResult {
  const body = dto.body ?? '';
  const contentType = dto.contentType ?? 'TEXT';
  const style = dto.style ?? 'all';
  const locale = hasCjk(body) ? 'zh' : 'en';
  const cleaned = stripMarkdown(body);
  const seed = seedFrom(body);
  const tags = extractTagsFromBody(body, 3);

  const make = (s: VariantStyle): CopyVariant => {
    switch (s) {
      case 'short': {
        const text = firstSentence(cleaned, locale === 'zh' ? 90 : 120);
        return {
          style: s,
          label: locale === 'zh' ? '简短版' : 'Short',
          body: text || cleaned.slice(0, locale === 'zh' ? 90 : 120),
        };
      }
      case 'long': {
        const text = cleaned.slice(0, locale === 'zh' ? 350 : 500);
        return {
          style: s,
          label: locale === 'zh' ? '详细版' : 'Long',
          body: text,
        };
      }
      case 'formal': {
        const emoji = pickEmoji(contentType, seed);
        const tagStr = tags.length ? ` ${tags.map(t => `#${t}`).join(' ')}` : '';
        const text = locale === 'zh'
          ? `${emoji} ${cleaned.slice(0, 200)}${tagStr}`
          : `${emoji} ${cleaned.slice(0, 280)}${tagStr}`;
        return {
          style: s,
          label: locale === 'zh' ? '正式版' : 'Formal',
          body: text,
        };
      }
      case 'social': {
        const emoji = pickEmoji(contentType, seed + 1);
        const tagStr = tags.length ? `\n\n${tags.map(t => `#${t}`).join(' ')}` : '';
        const text = locale === 'zh'
          ? `${emoji} ${cleaned.slice(0, 140)}${tagStr}`
          : `${emoji} ${cleaned.slice(0, 200)}${tagStr}`;
        return {
          style: s,
          label: locale === 'zh' ? '社交版' : 'Social',
          body: text,
        };
      }
    }
  };

  const styles: VariantStyle[] =
    style === 'all' ? ['short', 'long', 'formal', 'social'] : [style];

  return {
    contentType,
    locale,
    variants: styles.map(make),
  };
}

@Injectable()
export class ContentAssistantService {
  private readonly logger = new Logger(ContentAssistantService.name);

  constructor(private readonly llmFactory: LlmProviderFactory) {}

  async optimizeTitles(dto: TitleOptimizeDto): Promise<TitleOptimizeResult> {
    const heuristic = optimizeTitles(dto);
    const provider = this.llmFactory.getProvider();
    if (provider.name === 'heuristic') return heuristic;

    try {
      const resp = await provider.generate({
        system: 'You are a social media title optimization expert. Generate engaging, click-worthy titles in the same language as the input. Return one title per line, no numbering, no quotes.',
        user: `Content type: ${dto.contentType || 'TEXT'}\nDraft body:\n${(dto.body ?? '').slice(0, 2000)}\n\nGenerate ${dto.count || 5} title variants.`,
        maxTokens: 512,
        temperature: 0.8,
      });
      if (resp.text) {
        const lines = resp.text.split('\n').map(l => l.trim()).filter(l => l && !l.match(/^\d+[\.\)\-]/));
        if (lines.length >= 3) {
          return {
            ...heuristic,
            variants: lines.slice(0, dto.count || 5).map(title => ({ title, strategy: 'llm' })),
          };
        }
      }
    } catch (err) {
      this.logger.warn(`LLM title optimization failed, using heuristic: ${err instanceof Error ? err.message : err}`);
    }
    return heuristic;
  }

  async extractTags(dto: TagExtractDto): Promise<TagExtractResult> {
    const heuristic = extractTags(dto);
    const provider = this.llmFactory.getProvider();
    if (provider.name === 'heuristic') return heuristic;

    try {
      const resp = await provider.generate({
        system: 'You are a keyword extraction expert. Extract relevant tags/keywords from the content. Return comma-separated tags, no explanations.',
        user: `Content:\n${(dto.body ?? '').slice(0, 2000)}\n\nExtract ${dto.count || 8} tags.`,
        maxTokens: 256,
        temperature: 0.5,
      });
      if (resp.text) {
        const tags = resp.text.split(/[,，\n]/).map(t => t.trim()).filter(t => t && t.length >= 2);
        if (tags.length >= 3) return { tags: tags.slice(0, dto.count || 8) };
      }
    } catch (err) {
      this.logger.warn(`LLM tag extraction failed, using heuristic: ${err instanceof Error ? err.message : err}`);
    }
    return heuristic;
  }

  async audit(dto: ContentAuditDto): Promise<ContentAuditResult> {
    return auditContent(dto);
  }

  async generateVariants(dto: VariantGenerateDto): Promise<VariantGenerateResult> {
    const heuristic = generateVariants(dto);
    const provider = this.llmFactory.getProvider();
    if (provider.name === 'heuristic') return heuristic;

    try {
      const resp = await provider.generate({
        system: 'You are a copywriting expert. Generate platform-aware copy variants from the draft. Return JSON: [{"style":"short","label":"Short","body":"..."},...]',
        user: `Content type: ${dto.contentType || 'TEXT'}\nDraft body:\n${(dto.body ?? '').slice(0, 2000)}\n\nGenerate ${dto.style === 'all' ? 'short, long, formal, social' : dto.style} variants.`,
        maxTokens: 1024,
        temperature: 0.7,
      });
      if (resp.text) {
        try {
          const parsed = JSON.parse(resp.text);
          if (Array.isArray(parsed) && parsed.length >= 2) {
            return { ...heuristic, variants: parsed };
          }
        } catch {
          // fall through to heuristic
        }
      }
    } catch (err) {
      this.logger.warn(`LLM variant generation failed, using heuristic: ${err instanceof Error ? err.message : err}`);
    }
    return heuristic;
  }
}
