// packages/platform-sdk/src/types.ts

export interface PlatformAdapter {
  platform: Platform;

  // 认证
  getAuthUrl(state: string): string;
  handleCallback(code: string): Promise<Credentials>;
  refreshToken(refreshToken: string): Promise<Credentials>;

  // 内容发布
  publish(post: PublishRequest): Promise<PublishResult>;

  // 数据抓取
  fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult>;

  // 互动管理
  fetchComments(accountId: string, postId: string): Promise<Comment[]>;
  replyToComment(
    accountId: string,
    commentId: string,
    content: string,
  ): Promise<void>;
}

export interface PublishRequest {
  content: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
  extra?: Record<string, any>; // 平台特定参数
}

export interface PublishResult {
  externalId: string;
  externalUrl: string;
  publishedAt: Date;
}

export interface MetricsResult {
  impressions: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  followerCount: number;
}

export interface Credentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  replyToId?: string;
}

export enum Platform {
  WECHAT_OFFICIAL = 'WECHAT_OFFICIAL',
  WECHAT_VIDEO = 'WECHAT_VIDEO',
  DOUYIN = 'DOUYIN',
  XIAOHONGSHU = 'XIAOHONGSHU',
  BILIBILI = 'BILIBILI',
  WEIBO = 'WEIBO',
  TWITTER = 'TWITTER',
  YOUTUBE = 'YOUTUBE',
}
