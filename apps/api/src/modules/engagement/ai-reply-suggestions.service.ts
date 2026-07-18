import { Injectable, Logger } from '@nestjs/common';
import { Sentiment } from '@prisma/client';

export interface CommentSignal {
  sentiment: Sentiment;
  sentimentScore: number;
  content: string;
  likeCount: number;
  replied: boolean;
  /** Platform-specific extras (e.g. verified badge, isPurchaser). */
  isVerified?: boolean;
  isPurchaser?: boolean;
}

export interface SuggestedReply {
  variant: 'empathetic' | 'grateful' | 'enrolling' | 'helpful' | 'professional';
  /** 0-1 confidence; how appropriate the variant is for the signal. */
  confidence: number;
  text: string;
}

export interface ReplySuggestionsResult {
  commentId: string;
  signal: {
    sentiment: Sentiment;
    score: number;
    topics: string[];
    intent: 'praise' | 'complaint' | 'question' | 'neutral';
  };
  suggestions: SuggestedReply[];
}

/**
 * AI reply-suggestions engine — deterministic, dependency-free, matching the
 * project's heuristic-services style (ContentAssistant, scheduling-recommend).
 *
 * Strategy:
 *   1. Classify the comment's intent from its content + sentiment score.
 *   2. Pick a primary variant (the intent's canonical tone) plus a fallback.
 *   3. Render the matched template, lightly personalised with the author's name
 *      and the comment's first sentence.
 *
 * Stateless: every call is an isolated pure function, trivially testable, and
 * branches entirely on data we already store (sentiment, score, replied).
 */
@Injectable()
export class AiReplySuggestionsService {
  private readonly logger = new Logger(AiReplySuggestionsService.name);

  /**
   * Generate up to 2 reply drafts for a comment. The first suggestion is the
   * best-fit tone; the second is a softer fallback so the user can choose
   * a different voice.
   */
  suggest(commentId: string, signal: CommentSignal): ReplySuggestionsResult {
    const intent = this.classifyIntent(signal);
    const topics = this.extractTopics(signal.content);

    const primaryVariant = this.variantFor(intent, signal);
    const fallbackVariant = this.fallbackFor(primaryVariant);

    const seen = new Set<string>();
    const suggestions: SuggestedReply[] = [];

    for (const v of [primaryVariant, fallbackVariant]) {
      if (seen.has(v)) continue;
      seen.add(v);
      suggestions.push({
        variant: v,
        confidence: this.scoreVariant(v, intent, signal),
        text: this.render(v, signal),
      });
    }

    return {
      commentId,
      signal: {
        sentiment: signal.sentiment,
        score: signal.sentimentScore,
        topics,
        intent,
      },
      suggestions,
    };
  }

  // ── Intent classification ────────────────────────────────────────────
  private classifyIntent(signal: CommentSignal): ReplySuggestionsResult['signal']['intent'] {
    const trimmedLength = signal.content.trim().length;

    // Strong negative sentiment dominates short rants → complaint.
    const isComplaint =
      signal.sentiment === Sentiment.NEGATIVE && signal.sentimentScore < -0.25;
    if (isComplaint) return 'complaint';

    // Otherwise, look for interrogative cues (shorter bodies only — long
    // rhetorical questions are handled as their sentiment).
    const text = signal.content.toLowerCase();
    const questionMarks = (text.match(/\？|\?|吗|呢|么|如何|怎么|是否|有没有/g) ?? []).length;
    if (questionMarks > 0 && trimmedLength < 100) return 'question';

    if (signal.sentiment === Sentiment.POSITIVE) return 'praise';
    return 'neutral';
  }

  // ── Topic extraction ─────────────────────────────────────────────────
  private extractTopics(content: string): string[] {
    const topics: string[] = [];
    const haystack = content.toLowerCase();
    const topicMap: Array<[string, string]> = [
      ['质量', 'quality'], ['quality', 'quality'],
      ['服务', 'service'], ['service', 'service'],
      ['发货', 'shipping'], ['快递', 'shipping'], ['shipping', 'shipping'],
      ['退款', 'refund'], ['退货', 'refund'], ['refund', 'refund'],
      ['物流', 'delivery'], ['delivery', 'delivery'],
      ['bug', 'bug'], ['崩溃', 'bug'],
      ['价格', 'pricing'], ['价格', 'pricing'], ['贵', 'pricing'], ['pricing', 'pricing'],
      ['客服', 'support'], ['support', 'support'],
    ];
    const seen = new Set<string>();
    for (const [needle, topic] of topicMap) {
      if (haystack.includes(needle) && !seen.has(topic)) {
        seen.add(topic);
        topics.push(topic);
      }
    }
    return topics.slice(0, 3);
  }

  private variantFor(
    intent: ReplySuggestionsResult['signal']['intent'],
    signal: CommentSignal,
  ): SuggestedReply['variant'] {
    if (signal.sentiment === Sentiment.NEGATIVE) {
      // Empathetic for most complaints; professional for verified/purchaser-heavy.
      if (signal.isPurchaser || signal.likeCount >= 5) return 'professional';
      return 'empathetic';
    }
    if (intent === 'praise') return 'grateful';
    if (intent === 'question') return 'helpful';
    if (signal.isVerified) return 'professional';
    return 'enrolling';
  }

  private fallbackFor(v: SuggestedReply['variant']): SuggestedReply['variant'] {
    const table: Record<SuggestedReply['variant'], SuggestedReply['variant']> = {
      empathetic: 'helpful',
      grateful: 'enrolling',
      enrolling: 'professional',
      helpful: 'enrolling',
      professional: 'empathetic',
    };
    return table[v];
  }

  private scoreVariant(
    variant: SuggestedReply['variant'],
    intent: ReplySuggestionsResult['signal']['intent'],
    signal: CommentSignal,
  ): number {
    // Heuristic 0-1 score that roughly correlates with fit.
    const base: Record<SuggestedReply['variant'], number> = {
      empathetic: 0.6,
      grateful: 0.6,
      enrolling: 0.55,
      helpful: 0.55,
      professional: 0.5,
    };
    let score = base[variant];

    // Boost when variant matches the canon variant for this intent.
    const primary = this.variantFor(intent, signal);
    if (variant === primary) score += 0.3;

    // High-engagement negative comments deserve a more formal tone than empathy alone.
    if (signal.likeCount > 10 && signal.sentiment === Sentiment.NEGATIVE) {
      score += variant === 'professional' ? 0.05 : -0.05;
    }

    return +(Math.max(0.2, Math.min(0.99, score))).toFixed(3);
  }

  // ── Template rendering ───────────────────────────────────────────────
  private firstSentence(content: string): string {
    const cleaned = content.replace(/\s+/g, ' ').trim();
    const cut = cleaned.split(/(?<=[。！？!?.])/)[0] ?? cleaned;
    return cut.length > 40 ? cut.slice(0, 37) + '...' : cut;
  }

  private render(variant: SuggestedReply['variant'], signal: CommentSignal): string {
    const subject = signal.isPurchaser ? '亲爱的买家' : '朋友';
    const praiseHook = signal.sentimentScore > 0.5
      ? '非常感谢你的认可！'
      : '谢谢你分享的想法。';
    const complaintLead = signal.sentimentScore < -0.4
      ? '非常抱歉给你带来了不好的体验 — 你的反馈我们会认真处理。'
      : '感谢你的反馈，我们很在意你的感受。';
    const isChinese = /[一-龥]/.test(signal.content);

    switch (variant) {
      case 'empathetic':
        return isChinese
          ? `${complaintLead}关于你提到的「${this.firstSentence(signal.content)}」，我们的客服会尽快和你联系，一起把问题解决好。`
          : `I'm really sorry to hear that — your experience matters to us. Could you share a bit more about "${this.firstSentence(signal.content)}" so we can make it right?`;

      case 'grateful':
        return isChinese
          ? `${signal.isVerified ? '' : ''}${praiseHook} 因为有你这样的人支持，我们会继续努力。如果有任何需要，随时 @ 我们。`
          : `Thank you so much! Glad you enjoyed it. Let us know if there's anything else we can do for you.`;

      case 'enrolling':
        return isChinese
          ? `${signal.isVerified ? '' : ''}嗨${subject}！对我们来说你的建议很重要 — ${this.firstSentence(signal.content)} 这个点我们记下了，后续进展会跟你同步。`
          : `Hi ${subject}! Thanks for sharing that. We're looking into "${this.firstSentence(signal.content)}" and will keep you posted when we have an update.`;

      case 'helpful':
        return isChinese
          ? `关于你问到的「${this.firstSentence(signal.content)}」，你可以参考帮助中心的说明；如果还有疑问，私信我们，我们来帮你解决。`
          : `On "${this.firstSentence(signal.content)}" — here's a quick pointer from our help centre: [link]. If that doesn't clear things up, just DM us and we'll dig in together.`;

      case 'professional':
        return isChinese
          ? `尊敬的客户，感谢你的反馈。针对你提及的问题，我们已经安排专人跟进，预计 24 小时内会通过私信联系你。如需进一步协助，可拨打客服热线 400-xxxx。`
          : `Dear customer, thank you for reaching out. We've assigned a specialist who will follow up with you via DM within 24 hours. For urgent matters, please call our support line at 400-XXXX.`;

      default:
        return isChinese ? '谢谢你的留言，我们已收到你的反馈。' : 'Thanks for your note — we hear you!';
    }
  }
}
