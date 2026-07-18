// Frontend data shapes that mirror the API resources.

/** The authenticated user object returned by /users/me and /auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  mfaEnabled: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}

export interface Content {
  id: string;
  title: string;
  body?: string;
  contentType: string;
  status: ContentStatus;
  teamId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  scheduledAt?: string;
  publishedAt?: string;
  version?: number;
  tags?: { id: string; name: string }[];
  versions?: ContentVersion[];
}

export interface ContentVersion {
  id: string;
  contentId: string;
  version: number;
  title: string;
  body?: string;
  contentType: string;
  changedBy: string;
  changeNote?: string;
  createdAt: string;
}

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

/** Statuses a content item may be in — mirrors the backend ContentStatus enum. */
export type ContentStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'ARCHIVED';

export const CONTENT_STATUSES: ContentStatus[] = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'ARCHIVED',
];

/** Human-friendly status labels for badges and filters. */
export const STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHING: 'Publishing',
  PUBLISHED: 'Published',
  FAILED: 'Failed',
  ARCHIVED: 'Archived',
};

/**
 * Workflow actions available from a given content status. Each maps to a
 * backend endpoint on the content controller (`POST /contents/:id/<action>`).
 * `needsNote` surfaces an inline text field (reason / comment) before submit.
 */
export interface StatusAction {
  action: 'submit' | 'approve' | 'reject' | 'archive' | 'retry';
  label: string;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  needsNote?: boolean;
}

export const STATUS_ACTIONS: Record<ContentStatus, StatusAction[]> = {
  DRAFT: [{ action: 'submit', label: 'Submit for review', variant: 'primary' }],
  IN_REVIEW: [
    { action: 'approve', label: 'Approve', variant: 'primary', needsNote: true },
    { action: 'reject', label: 'Reject', variant: 'danger', needsNote: true },
  ],
  APPROVED: [{ action: 'archive', label: 'Archive', variant: 'ghost' }],
  SCHEDULED: [{ action: 'archive', label: 'Archive', variant: 'ghost' }],
  PUBLISHING: [],
  PUBLISHED: [{ action: 'archive', label: 'Archive', variant: 'ghost' }],
  FAILED: [
    { action: 'retry', label: 'Retry', variant: 'primary' },
    { action: 'archive', label: 'Archive', variant: 'ghost' },
  ],
  ARCHIVED: [],
};

export interface SocialAccount {
  id: string;
  teamId: string;
  platform: string;
  accountId: string;
  accountName: string;
  accountHandle?: string;
  status: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  lastSyncedAt?: string;
}

/** Overall health of a social account — mirrors HealthService rollup. */
export type AccountHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface AccountHealthSignal {
  signal: string;
  severity: 'warning' | 'critical';
  message: string;
}

/** Per-account health report returned by the health-monitor API. */
export interface AccountHealth {
  accountId: string;
  accountName: string;
  platform: string;
  status: string;
  health: AccountHealthStatus;
  signals: AccountHealthSignal[];
  lastSyncedAt?: string | null;
  tokenExpiresAt?: string | null;
  evaluatedAt: string;
}

/** Team-wide rollup. */
export interface TeamHealthSummary {
  teamId: string;
  evaluatedAt: string;
  totals: { total: number; healthy: number; warning: number; critical: number };
  accounts: AccountHealth[];
}

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

export interface AuditLogUser {
  id: string;
  name: string;
  email: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: unknown;
  ipAddress?: string;
  createdAt: string;
  user?: AuditLogUser;
}

export interface MediaAsset {
  id: string;
  contentId?: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  fileSize: number;
  mimeType: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
}

export interface Member {
  id: string;
  teamId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

export interface PlatformOption {
  value: string;
  label: string;
}

export const PLATFORMS: PlatformOption[] = [
  { value: 'WECHAT_OFFICIAL', label: 'WeChat Official' },
  { value: 'WECHAT_VIDEO', label: 'WeChat Video' },
  { value: 'DOUYIN', label: 'Douyin' },
  { value: 'XIAOHONGSHU', label: 'XiaoHongShu' },
  { value: 'BILIBILI', label: 'Bilibili' },
  { value: 'WEIBO', label: 'Weibo' },
  { value: 'TWITTER', label: 'Twitter / X' },
  { value: 'YOUTUBE', label: 'YouTube' },
];

export const CONTENT_TYPES = ['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL', 'THREAD', 'ARTICLE'] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationChannel = 'in_app' | 'email' | 'webhook';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

/** Analytics metrics the history/trend API accepts. */
export type AnalyticsMetric =
  | 'followerCount'
  | 'followingCount'
  | 'postCount'
  | 'impressions'
  | 'engagements'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'views';

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
  followerCount: 'Followers',
  followingCount: 'Following',
  postCount: 'Posts',
  impressions: 'Impressions',
  engagements: 'Engagements',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  views: 'Views',
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
  TOP: 'Top',
  MID: 'Mid',
  BOTTOM: 'Bottom',
};

export const CONTENT_TIER_TONE: Record<ContentTier, 'success' | 'neutral' | 'danger'> = {
  TOP: 'success',
  MID: 'neutral',
  BOTTOM: 'danger',
};

// ── Anomaly detection (PRD §3.5) ───────────────────────────────────────

/** An anomaly type mirrors the backend Anomaly.type for the dashboard badge. */
export type AnomalyType =
  | 'DROP_SPIKE'
  | 'SURGE'
  | 'SUSTAINED_DECLINE'
  | 'CLIFF_DROP'
  | 'FOLLOWER_LOSS';

export type AnomalySeverity = 'critical' | 'warning';

export interface Anomaly {
  type: AnomalyType;
  metric: string;
  severity: AnomalySeverity;
  message: string;
  currentValue: number;
  baselineValue: number;
  changePercent: number;
  date: string;
}

export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  DROP_SPIKE: 'Drop spike',
  SURGE: 'Surge',
  SUSTAINED_DECLINE: 'Sustained decline',
  CLIFF_DROP: 'Cliff drop',
  FOLLOWER_LOSS: 'Follower loss',
};

export const ANOMALY_SEVERITY_TONE: Record<AnomalySeverity, 'danger' | 'warning'> = {
  critical: 'danger',
  warning: 'warning',
};

export const NOTIFICATION_TONE: Record<NotificationType, 'neutral' | 'success' | 'warning' | 'danger'> = {
  info: 'neutral',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};

// ── Engagement Hub ─────────────────────────────────────────────────

/** Platform identifiers — mirrors the backend Platform enum. */
export type Platform =
  | 'WECHAT_OFFICIAL'
  | 'WECHAT_VIDEO'
  | 'DOUYIN'
  | 'XIAOHONGSHU'
  | 'BILIBILI'
  | 'WEIBO'
  | 'TWITTER'
  | 'YOUTUBE';

export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export const SENTIMENT_TONE: Record<Sentiment, 'success' | 'neutral' | 'danger'> = {
  POSITIVE: 'success',
  NEUTRAL: 'neutral',
  NEGATIVE: 'danger',
};

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  POSITIVE: 'Positive',
  NEUTRAL: 'Neutral',
  NEGATIVE: 'Negative',
};

export interface EngagementComment {
  id: string;
  externalId: string;
  platform: Platform;
  postExternalId?: string | null;
  authorName: string;
  authorId?: string | null;
  content: string;
  likeCount: number;
  parentId?: string | null;
  sentiment: Sentiment;
  sentimentScore: number;
  replied: boolean;
  replyContent?: string | null;
  repliedAt?: string | null;
  commentDate: string;
  fetchedAt: string;
  account?: { platform: Platform; accountName: string };
}

export interface EngagementStats {
  total: number;
  unreplied: number;
  positive: number;
  neutral: number;
  negative: number;
  byPlatform: { platform: Platform; total: number; unreplied: number }[];
}

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

export interface EngagementMessage {
  id: string;
  externalId: string;
  platform: Platform;
  conversationId?: string | null;
  authorName: string;
  authorId?: string | null;
  content: string;
  sentByMe: boolean;
  messageDate: string;
  fetchedAt: string;
  account?: { platform: Platform; accountName: string };
}

/** Result of projecting draft content against one platform (PRD §3.4 平台适配). */
export interface PlatformAdaptation {
  platform: Platform;
  label: string;
  fits: boolean;
  truncated: boolean;
  adaptedBody: string;
  bodyLength: number;
  maxLength: number;
  imagesUsed: number;
  imagesDropped: number;
  imageMax: number;
  videosUsed: number;
  videosDropped: number;
  videoMax: number;
  durationOk: boolean;
  minDurationSec: number;
  warnings: string[];
  hints: string[];
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
  short: 'Short',
  long: 'Long',
  formal: 'Formal',
  social: 'Social',
};

export const AUDIT_GRADE_LABELS: Record<string, string> = {
  good: 'Good',
  'needs-work': 'Needs work',
  poor: 'Poor',
};

export const AUDIT_GRADE_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  good: 'success',
  'needs-work': 'warning',
  poor: 'danger',
};
