// Frontend data shapes that mirror the API resources.

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

export const NOTIFICATION_TONE: Record<NotificationType, 'neutral' | 'success' | 'warning' | 'danger'> = {
  info: 'neutral',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};
