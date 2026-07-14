import { Injectable } from '@nestjs/common';

export enum PlatformType {
  TWITTER = 'TWITTER',
  WEIBO = 'WEIBO',
  XIAOHONGSHU = 'XIAOHONGSHU',
  DOUYIN = 'DOUYIN',
  BILIBILI = 'BILIBILI',
  ZHIHU = 'ZHIHU',
}

@Injectable()
export class PlatformSdkService {
  constructor() {}

  async publish(contentId: string, platform: string, payload: any) {
    return {
      id: `pp-${Date.now()}`,
      contentId,
      platform,
      status: 'PENDING',
      externalId: null,
      createdAt: new Date(),
    };
  }

  async getStatus(externalId: string, platform: string) {
    return { externalId, platform, status: 'PUBLISHED', metrics: {} };
  }

  async getMetrics(externalId: string, platform: string) {
    return {
      externalId,
      platform,
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };
  }

  async validate(platform: string, credentials: any) {
    return { platform, valid: true, message: 'Credentials validated' };
  }
}
