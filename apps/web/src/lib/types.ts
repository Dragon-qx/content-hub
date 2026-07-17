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
  status: string;
  teamId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  scheduledAt?: string;
  publishedAt?: string;
  tags?: { id: string; name: string }[];
}

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

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: unknown;
  ipAddress?: string;
  createdAt: string;
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

export const CONTENT_TYPES = ['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL', 'THREAD', 'ARTICLE'];
