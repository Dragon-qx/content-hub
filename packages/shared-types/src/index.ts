// Shared TypeScript types & constants for ContentHub
// Re-exported across apps/* and packages/*

export const API_VERSION = 'v1' as const;

// ── API Response Types ─────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

// ── Pagination (offset-based, Prisma-style) ────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}

// ── Platform Types ─────────────────────────────────────────────────────

export const PLATFORMS = [
  'WECHAT_OFFICIAL',
  'WECHAT_VIDEO',
  'DOUYIN',
  'XIAOHONGSHU',
  'BILIBILI',
  'WEIBO',
  'TWITTER',
  'YOUTUBE',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const CONTENT_TYPES = ['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL', 'THREAD', 'ARTICLE'] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

// ── Content Status ─────────────────────────────────────────────────────

export const CONTENT_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'ARCHIVED',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

// ── User & Auth ────────────────────────────────────────────────────────

export interface AuthTeam {
  id: string;
  name: string;
  description?: string | null;
  ownerId?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  mfaEnabled: boolean;
  teamId?: string | null;
}

// ── Team & Member ──────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  description?: string | null;
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

// ── Content ────────────────────────────────────────────────────────────

export interface Content {
  id: string;
  title: string;
  body?: string;
  contentType: ContentType | string;
  status: ContentStatus | string;
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

// ── Social Account ─────────────────────────────────────────────────────

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

// ── Health Monitoring ──────────────────────────────────────────────────

export type AccountHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface AccountHealthSignal {
  signal: string;
  severity: 'warning' | 'critical';
  message: string;
}

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

export interface TeamHealthSummary {
  teamId: string;
  evaluatedAt: string;
  totals: { total: number; healthy: number; warning: number; critical: number };
  accounts: AccountHealth[];
}

// ── Media ──────────────────────────────────────────────────────────────

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

// ── Audit Log ──────────────────────────────────────────────────────────

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

// ── Notification ───────────────────────────────────────────────────────

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

// ── Analytics ──────────────────────────────────────────────────────────

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

// ── Engagement ─────────────────────────────────────────────────────────

export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

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

// ── Platform Adaptation ────────────────────────────────────────────────

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

// ── Anomaly Detection ──────────────────────────────────────────────────

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

// ── Re-export helper type utilities ────────────────────────────────────

export type Nullable<T> = T | null | undefined;
export type Optional<T> = T | undefined;
