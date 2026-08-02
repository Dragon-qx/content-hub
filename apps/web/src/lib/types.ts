// Frontend data shapes that mirror the API resources.
// Re-export shared types from @content-hub/shared-types for cross-package consistency.

import type {
  AuthTeam,
  AuthUser,
  Paginated,
  Content,
  ContentVersion,
  ContentStatus,
  Platform,
  ContentType,
  SocialAccount,
  AccountHealthStatus,
  AccountHealthSignal,
  AccountHealth,
  TeamHealthSummary,
  MediaAsset,
  AuditLog,
  AuditLogUser,
  Notification,
  NotificationType,
  NotificationChannel,
  AnalyticsMetric,
  Sentiment,
  EngagementComment,
  EngagementStats,
  EngagementMessage,
  PlatformAdaptation,
  AnomalyType,
  AnomalySeverity,
  Anomaly,
  Team,
  Member,
} from '@content-hub/shared-types';
import { CONTENT_STATUSES, CONTENT_TYPES, PLATFORMS as SHARED_PLATFORMS } from '@content-hub/shared-types';

export type {
  AuthTeam,
  AuthUser,
  Paginated,
  Content,
  ContentVersion,
  ContentStatus,
  Platform,
  ContentType,
  SocialAccount,
  AccountHealthStatus,
  AccountHealthSignal,
  AccountHealth,
  TeamHealthSummary,
  MediaAsset,
  AuditLog,
  AuditLogUser,
  Notification,
  NotificationType,
  NotificationChannel,
  AnalyticsMetric,
  Sentiment,
  EngagementComment,
  EngagementStats,
  EngagementMessage,
  PlatformAdaptation,
  AnomalyType,
  AnomalySeverity,
  Anomaly,
  Team,
  Member,
};
export { CONTENT_STATUSES, CONTENT_TYPES };

/** A variable definition on a template (placeholders `{{key}}`). */
export interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
  defaultValue?: string;
  required?: boolean;
}

/** A reusable content template scoped to a team (PRD §3.3 内容模板). */
export interface ContentTemplate {
  id: string;
  teamId: string;
  title: string;
  body?: string | null;
  contentType: ContentType;
  tags: string[];
  variables?: TemplateVariable[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Draft seed returned by POST /templates/:id/apply — input for creating content. */
export interface TemplateDraftSeed {
  title: string;
  body?: string;
  contentType: ContentType;
  teamId: string;
  tags: string[];
}

/** Human-friendly status labels for badges and filters.
 *  Localised at the source so both zhCn and en share the same key space. */
export const STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: 'status.DRAFT',
  IN_REVIEW: 'status.IN_REVIEW',
  APPROVED: 'status.APPROVED',
  SCHEDULED: 'status.SCHEDULED',
  PUBLISHING: 'status.PUBLISHING',
  PUBLISHED: 'status.PUBLISHED',
  FAILED: 'status.FAILED',
  ARCHIVED: 'status.ARCHIVED',
};

/**
 * Workflow actions available from a given content status. Each maps to a
 * backend endpoint on the content controller (`POST /contents/:id/<action>`).
 * `needsNote` surfaces an inline text field (reason / comment) before submit.
 */
export interface StatusAction {
  action: 'submit' | 'approve' | 'reject' | 'archive' | 'retry' | 'publish';
  label: string;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  needsNote?: boolean;
}

export const STATUS_ACTIONS: Record<ContentStatus, StatusAction[]> = {
  DRAFT: [{ action: 'submit', label: 'content.action.submit', variant: 'primary' }],
  IN_REVIEW: [
    { action: 'approve', label: 'content.action.approve', variant: 'primary', needsNote: true },
    { action: 'reject', label: 'content.action.reject', variant: 'danger', needsNote: true },
  ],
  APPROVED: [
    { action: 'publish', label: 'content.action.publish', variant: 'primary' },
    { action: 'archive', label: 'content.action.archive', variant: 'ghost' },
  ],
  SCHEDULED: [{ action: 'archive', label: 'content.action.archive', variant: 'ghost' }],
  PUBLISHING: [],
  PUBLISHED: [{ action: 'archive', label: 'content.action.archive', variant: 'ghost' }],
  FAILED: [
    { action: 'retry', label: 'content.action.retry', variant: 'primary' },
    { action: 'archive', label: 'content.action.archive', variant: 'ghost' },
  ],
  ARCHIVED: [],
};



/** Map a health status to the UI tone used by <StatusBadge />. */
export const HEALTH_TONE: Record<AccountHealthStatus, 'success' | 'warning' | 'danger'> = {
  HEALTHY: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

export interface Workflow {
  id: string;
  contentId?: string;
  approverId: string;
  status: string;
  comment?: string;
  createdAt: string;
}

export interface PublishJob {
  id: string;
  contentId: string;
  status: string;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
}

// ── Content Calendar (PRD §3.3) ────────────────────────────────────────

/** A single scheduled item rendered on the content calendar. */
export interface CalendarEvent {
  id: string;
  title: string;
  type: 'content' | 'job';
  platform?: string;
  status: string;
  scheduledAt: string;
}

/** One calendar day in a month grid: its ISO date (YYYY-MM-DD) and events. */
export interface CalendarDay {
  date: string;
  events: CalendarEvent[];
}

/** Response of GET /contents/calendar?year=&month=. */
export interface CalendarResponse {
  year: number;
  month: number;
  days: CalendarDay[];
}

/** Map a content/job status to the UI tone used by <StatusBadge />. */
export const CALENDAR_EVENT_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  SCHEDULED: 'neutral',
  PUBLISHING: 'warning',
  QUEUED: 'neutral',
  RETRYING: 'warning',
};

export interface PlatformOption {
  value: string;
  label: string;
}

/** Platform options for select inputs — maps shared PLATFORMS to UI labels. */
export const PLATFORMS: PlatformOption[] = SHARED_PLATFORMS.map((p) => ({
  value: p,
  label: `accounts.platform.${p}`,
}));

export const ANALYTICS_METRICS: AnalyticsMetric[] = [
  'followerCount',
  'followingCount',
  'postCount',
  'impressions',
  'engagements',
  'likes',
  'comments',
  'shares',
  'views',
];

export const METRIC_LABELS: Record<AnalyticsMetric, string> = {
  followerCount: 'dashboard.followers',
  followingCount: 'dashboard.following',
  postCount: 'dashboard.posts',
  impressions: 'dashboard.impressions',
  engagements: 'dashboard.engagements',
  likes: 'dashboard.likes',
  comments: 'dashboard.comments',
  shares: 'dashboard.shares',
  views: 'dashboard.views',
};

export const TREND_PERIODS = ['7d', '30d', '90d'] as const;
export type TrendPeriod = (typeof TREND_PERIODS)[number];

// ── Content ranking: Top / Bottom auto-marking (PRD §3.5) ──────────────

/** Performance tier a post is auto-assigned relative to the cohort mean. */
export type ContentTier = 'TOP' | 'MID' | 'BOTTOM';

/** Which end of the ranking a caller requests. */
export type TopContentView = 'top' | 'bottom';

export interface RankedContentItem {
  contentId: string;
  title: string;
  platform: string;
  publishedAt: string | null;
  impressions: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: string;
  rank: number;
  tier: ContentTier;
}

export interface ContentRankingSummary {
  total: number;
  top: number;
  mid: number;
  bottom: number;
}

export interface ContentRanking {
  sortBy: AnalyticsMetric;
  view: TopContentView;
  summary: ContentRankingSummary;
  items: RankedContentItem[];
}

export const CONTENT_TIER_LABELS: Record<ContentTier, string> = {
  TOP: 'analytics.top',
  MID: 'common.all',
  BOTTOM: 'analytics.bottom',
};

export const CONTENT_TIER_TONE: Record<ContentTier, 'success' | 'neutral' | 'danger'> = {
  TOP: 'success',
  MID: 'neutral',
  BOTTOM: 'danger',
};

// ── Anomaly detection (PRD §3.5) ───────────────────────────────────────

export const ANOMALY_TYPE_LABELS: Record<import('@content-hub/shared-types').AnomalyType, string> = {
  DROP_SPIKE: 'anomaly.DROP_SPIKE',
  SURGE: 'anomaly.SURGE',
  SUSTAINED_DECLINE: 'anomaly.SUSTAINED_DECLINE',
  CLIFF_DROP: 'anomaly.CLIFF_DROP',
  FOLLOWER_LOSS: 'anomaly.FOLLOWER_LOSS',
};

export const ANOMALY_SEVERITY_TONE: Record<import('@content-hub/shared-types').AnomalySeverity, 'danger' | 'warning'> = {
  critical: 'danger',
  warning: 'warning',
};

export const NOTIFICATION_TONE: Record<import('@content-hub/shared-types').NotificationType, 'neutral' | 'success' | 'warning' | 'danger'> = {
  info: 'neutral',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

// ── Engagement Hub ─────────────────────────────────────────────────

export const SENTIMENT_TONE: Record<Sentiment, 'success' | 'neutral' | 'danger'> = {
  POSITIVE: 'success',
  NEUTRAL: 'neutral',
  NEGATIVE: 'danger',
};

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  POSITIVE: 'engagement.positive',
  NEUTRAL: 'engagement.neutral',
  NEGATIVE: 'engagement.negative',
};

/** A team-owned watch keyword that triggers a sentiment alert. */
export interface SentimentKeyword {
  id: string;
  teamId: string;
  keyword: string;
  createdBy: string;
  createdAt: string;
}

export interface CommentTemplate {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}



/** Adaptation preview response from POST /adaptation/preview. */
export interface AdaptationResult {
  contentType: string;
  platforms: PlatformAdaptation[];
}

/** A single platform's static rule from GET /adaptation/rules. */
export interface PlatformRule {
  platform: Platform;
  label: string;
  maxLength: number;
  imageMax: number;
  videoMax: number;
  minDurationSec: number;
  hints: string[];
}

// ── Content Assistant: AI writing helpers (PRD §3.3 V1.1) ────────────────

/** One generated title variant from POST /assistant/titles. */
export interface TitleVariant {
  title: string;
  strategy: string;
}

/** Response of POST /assistant/titles. */
export interface TitleOptimizeResult {
  contentType: string;
  locale: 'zh' | 'en';
  variants: TitleVariant[];
}

/** Response of POST /assistant/tags. */
export interface TagExtractResult {
  tags: string[];
}

export type AuditSeverity = 'info' | 'warning' | 'error';

/** A single quality/platform finding from POST /assistant/audit. */
export interface AuditFinding {
  code: string;
  severity: AuditSeverity;
  message: string;
  platform?: string;
}

/** Per-platform projection from POST /assistant/audit. */
export interface PlatformAudit {
  platform: Platform;
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

/** Response of POST /assistant/audit. */
export interface ContentAuditResult {
  contentType: string;
  score: number;
  grade: 'good' | 'needs-work' | 'poor';
  findings: AuditFinding[];
  platforms: PlatformAudit[];
}

export type VariantStyle = 'short' | 'long' | 'formal' | 'social';

/** One generated copy variant from POST /assistant/variants. */
export interface CopyVariant {
  style: VariantStyle;
  label: string;
  body: string;
}

/** Response of POST /assistant/variants. */
export interface VariantGenerateResult {
  contentType: string;
  locale: 'zh' | 'en';
  variants: CopyVariant[];
}

export const VARIANT_STYLE_LABELS: Record<VariantStyle, string> = {
  short: 'variant.short',
  long: 'variant.long',
  formal: 'variant.formal',
  social: 'variant.social',
};

export const AUDIT_GRADE_LABELS: Record<string, string> = {
  good: 'audit.grade.good',
  'needs-work': 'audit.grade.needsWork',
  poor: 'audit.grade.poor',
};

export const AUDIT_GRADE_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  good: 'success',
  'needs-work': 'warning',
  poor: 'danger',
};
