import { Injectable } from '@nestjs/common';
import { ContentType } from '@prisma/client';
import {
  getRule,
  PLATFORM_ORDER,
} from '../adaptation/platform-rules';
import {
  AssistantDraftDto,
  ContentAuditDto,
  TagExtractDto,
  TitleOptimizeDto,
  VariantGenerateDto,
} from './dto/content-assistant.dto';

// ── AI Content Assistant (PRD §3.3 V1.1 AI 辅助写作) ─────────────────────
//
// There is no external LLM wired into this deployment, so the four assistant
// operations are implemented as deterministic, locale-aware heuristic engines
// — the same "pure function" shape as the anomaly detector and the adaptation
// engine. They are fully synchronous, side-effect free, and trivial to unit
// test. Swapping any of these for a real model later means replacing the pure
// helper; the DTO surfaces and controller wiring stay identical.

export interface TitleVariant {
  /** The generated title text. */
  title: string;
  /** Which template strategy produced it (useful for tests + the UI). */
  strategy: string;
}

export interface TitleOptimizeResult {
  contentType: string;
  /** Whether the source body was primarily Chinese (drove template choice). */
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
  /** When the finding is scoped to a specific platform. */
  platform?: string;
}

/** Per-platform projection of the draft against a platform's hard limits. */
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
  /** 0-100 quality score derived from the findings. */
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

// ── Locale detection ──────────────────────────────────────────────────────

const CJK = /[一-鿿]/;
function hasCjk(text: string): boolean {
  return CJK.test(text);
}

/** Strip markdown syntax so heuristics operate on readable copy. */
function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → label
    .replace(/[#*_`~`>-]/g, ' ') // emphasis / headings / code
    .replace(/[\[\]()]/g, ' ') // stray brackets / parens
    .replace(/\s+/g, ' ')
    .trim();
}

/** A short, meaningful snippet of the draft to thread through title templates. */
function coreSnippet(text: string, max = 14): string {
  const cleaned = stripMarkdown(text);
  if (!cleaned) return '';
  // First "sentence": split on sentence terminators (zh + en) and newlines.
  const first = cleaned.split(/[。.!?！？\n]+/)[0].trim();
  const base = first || cleaned;
  return base.length > max ? `${base.slice(0, max)}…` : base;
}

// ── Title optimization ────────────────────────────────────────────────────

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

/** Build a deterministic prime-ish number from the body so variants feel varied. */
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
  const n = 3 + (seedFrom(body || core) % 6); // 3..8, deterministic per draft
  const templates = locale === 'zh' ? ZH_TEMPLATES(core, n) : EN_TEMPLATES(core, n);

  // Deterministically pick `count` distinct templates based on the seed.
  const start = seedFrom(body || core) % templates.length;
  const variants: TitleVariant[] = [];
  for (let i = 0; i < Math.min(count, templates.length); i++) {
    variants.push(templates[(start + i) % templates.length]);
  }

  return { contentType, locale, variants };
}

// ── Tag extraction ────────────────────────────────────────────────────────

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
  'where', 'who', 'how', 'then', 'also', 'new', 'one', 'two', 'been',
]);

const CJK_STOPWORDS = new Set(
  '的 了 是 在 我 你 他 她 它 们 就 不 也 都 都 还 很 会 要 能 可以 和 与 及 或 但 而 这 那 有 个 上 下 中 对 为 之 等 把 被 从 到 给 让 向 将 就 又 只 最 更 非常 已经 因为 所以 如果 虽然 但是 然后 而且 或者 就是 不是 还是 而且 那个 这个 什么 怎么 怎样 如何 为什么 哪里 哪里 人们 大家 我们 你们 他们 自己 其实 其中 其中 一直 应该 需要 必须 可能 一定 之间 方面 部分 问题 情况 工作 生活 时间 时候 今天 现在 目前 已经 一直 真的 知道 觉得 认为 发现 使用 进行 提供 包括 通过 关于 对于 关于 能够 得到 成为 作为 出现 产生 形成 完成 实现 建立 开发 制作 创作 写 作'.split(
    ' ',
  ),
);

export function extractTagsFromBody(
  body: string,
  count: number,
): string[] {
  const cleaned = stripMarkdown(body);
  if (!cleaned) return [];

  const tokens: string[] = [];

  // English tokens: lowercase words of length >= 3.
  const en = cleaned.toLowerCase().match(/[a-z][a-z0-9']{2,}/g);
  if (en) tokens.push(...en);

  // CJK tokens: contiguous CJK runs → emit whole runs (2-5 chars) and bigrams.
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

  // Count frequencies, dropping stopwords.
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

// ── Content audit ─────────────────────────────────────────────────────────

export function auditContent(dto: ContentAuditDto): ContentAuditResult {
  const body = dto.body ?? '';
  const contentType = dto.contentType ?? 'TEXT';
  const findings: AuditFinding[] = [];
  const cleaned = stripMarkdown(body);
  const bodyLength = cleaned.length;
  const zh = hasCjk(cleaned);

  // --- Cross-cutting quality heuristics ----------------------------------
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

    // ALL-CAPS shouting (Latin text only).
    const alpha = cleaned.match(/[a-zA-Z]/g) ?? [];
    const upper = cleaned.match(/[A-Z]/g) ?? [];
    if (alpha.length >= 10 && upper.length / alpha.length > 0.7) {
      findings.push({
        code: 'ALL_CAPS',
        severity: 'warning',
        message: zh ? '过多大写字母，观感像在“喊叫”。' : 'Excessive ALL-CAPS.',
      });
    }

    // Repeated punctuation (!!!, ???).
    if (/[!？！!？]{3,}/.test(cleaned)) {
      findings.push({
        code: 'EXCESSIVE_PUNCTUATION',
        severity: 'warning',
        message: zh ? '存在连续重复标点，建议精简。' : 'Repeated punctuation detected.',
      });
    }

    // One giant block with no paragraph breaks.
    if (bodyLength > 800 && !/\n/.test(cleaned)) {
      findings.push({
        code: 'WALL_OF_TEXT',
        severity: 'info',
        message: zh ? '长文本缺少段落拆分，建议分段提升可读性。' : 'Break long text into paragraphs.',
      });
    }
  }

  // --- Per-platform hard-limit projection --------------------------------
  const imageCount = Math.max(0, dto.images?.length ?? 0);
  const videoCount = Math.max(0, dto.videos?.length ?? 0);
  const videoDurationSec = Math.max(0, dto.videoDurationSec ?? 0);

  const targets = dto.platforms?.length
    ? PLATFORM_ORDER.filter((p) => (dto.platforms ?? []).includes(p))
    : PLATFORM_ORDER;

  const platforms: PlatformAudit[] = targets.map((p) => {
    const rule = getRule(p)!;
    const warnings: string[] = [];

    const truncated = bodyLength > rule.maxLength;
    if (truncated) {
      warnings.push(
        zh
          ? `超出${rule.label}${rule.maxLength}字上限（当前${bodyLength}字），发布将截断。`
          : `Exceeds ${rule.label} ${rule.maxLength}-char limit (${bodyLength}).`,
      );
    }
    const imagesUsed = Math.min(imageCount, rule.imageMax);
    const imagesDropped = imageCount - imagesUsed;
    if (imagesDropped > 0) {
      warnings.push(
        zh
          ? `${rule.label}最多${rule.imageMax}张图，将丢弃${imagesDropped}张。`
          : `${rule.label} keeps ${rule.imageMax} images; ${imagesDropped} dropped.`,
      );
    }
    const videosUsed = Math.min(videoCount, rule.videoMax);
    const videosDropped = videoCount - videosUsed;
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
      label: rule.label,
      fits: !truncated && imagesDropped === 0 && videosDropped === 0 && durationOk,
      bodyLength,
      maxLength: rule.maxLength,
      truncated,
      imagesUsed,
      imagesDropped,
      imageMax: rule.imageMax,
      videosUsed,
      videosDropped,
      videoMax: rule.videoMax,
      durationOk,
      minDurationSec: rule.minDurationSec,
      warnings,
    };
  });

  // Attach per-platform warnings as info-level findings too.
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

  // --- Score + grade ------------------------------------------------------
  let score = 100;
  for (const f of findings) {
    score -= f.severity === 'error' ? 25 : f.severity === 'warning' ? 10 : 3;
  }
  score = Math.max(0, Math.min(100, score));
  const grade: ContentAuditResult['grade'] =
    score >= 80 ? 'good' : score >= 50 ? 'needs-work' : 'poor';

  return { contentType, score, grade, findings, platforms };
}

// ── Variant generation ────────────────────────────────────────────────────

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
          body: text || cleaned,
        };
      }
      case 'long': {
        const closer =
          locale === 'zh'
            ? '\n\n觉得有帮助？欢迎收藏、转发给需要的朋友。'
            : '\n\nFound this helpful? Save it and share.';
        return { style: s, label: locale === 'zh' ? '扩写版' : 'Long', body: cleaned + closer };
      }
      case 'formal': {
        const stripped = cleaned
          .replace(/[#＃]\S+/g, '')
          .replace(/\p{Emoji_Presentation}/gu, '')
          .replace(/[!？！]{2,}/g, '.')
          .trim();
        const opener = locale === 'zh' ? '【前言】' : 'Note: ';
        return { style: s, label: locale === 'zh' ? '正式版' : 'Formal', body: opener + stripped };
      }
      case 'social': {
        const emoji = pickEmoji(contentType, seed);
        const hashtags = tags.map((t) => `#${t}`).slice(0, 2).join(' ');
        const tail = hashtags
          ? `\n\n${emoji} ${hashtags}`
          : `\n\n${emoji}`;
        return { style: s, label: locale === 'zh' ? '社交版' : 'Social', body: cleaned + tail };
      }
    }
  };

  const order: VariantStyle[] = ['short', 'long', 'formal', 'social'];
  const variants = style === 'all' ? order.map(make) : [make(style)];

  return { contentType, locale, variants };
}

// ── NestJS service wrapper ────────────────────────────────────────────────

@Injectable()
export class ContentAssistantService {
  optimizeTitles(dto: TitleOptimizeDto): TitleOptimizeResult {
    return optimizeTitles(dto);
  }

  extractTags(dto: TagExtractDto): TagExtractResult {
    return extractTags(dto);
  }

  audit(dto: ContentAuditDto): ContentAuditResult {
    return auditContent(dto);
  }

  generateVariants(dto: VariantGenerateDto): VariantGenerateResult {
    return generateVariants(dto);
  }
}
