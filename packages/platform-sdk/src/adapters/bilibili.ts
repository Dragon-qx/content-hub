import { BaseAdapter } from '../adapter-base';
import {
  Comment,
  Credentials,
  DateRange,
  Message,
  MetricsResult,
  Platform,
  PublishRequest,
  PublishResult,
} from '../types';

export interface BilibiliConfig {
  accessKey: string;
  secretKey: string;
  accountId: string;
}

/**
 * B站 (Bilibili) 开放平台 adapter — 创作姬 / 个人空间发布能力。
 * See: https://open.bilibili.com/doc
 */
export class BilibiliAdapter extends BaseAdapter {
  platform = Platform.BILIBILI;
  private accessToken: string | null = null;
  private tokenExpire = 0;
  private refreshTokenValue: string | null = null;

  constructor(private config: BilibiliConfig) {
    super();
  }

  getAuthUrl(state: string): string {
    const redirect = encodeURIComponent('https://your-domain.com/callback/bilibili');
    return `https://passport.bilibili.com/register/pc_oauth2.html#/?client_id=${encodeURIComponent(this.config.accessKey)}&return_url=${redirect}&state=${encodeURIComponent(state)}`;
  }

  async handleCallback(code: string): Promise<Credentials> {
    const data = await this.call<{ access_token: string; refresh_token: string; expires_in: number }>(
      'https://api.bilibili.com/x/account-oauth2/v1/token',
      { method: 'POST', body: JSON.stringify({ client_id: this.config.accessKey, client_secret: this.config.secretKey, code, grant_type: 'authorization_code' }) },
    );
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(this.tokenExpire) };
  }

  async refreshToken(): Promise<Credentials> {
    if (!this.refreshTokenValue) throw new Error('No refresh token for Bilibili');
    const data = await this.call<{ access_token: string; refresh_token: string; expires_in: number }>(
      'https://api.bilibili.com/x/account-oauth2/v1/token/refresh',
      { method: 'POST', body: JSON.stringify({ client_id: this.config.accessKey, client_secret: this.config.secretKey, refresh_token: this.refreshTokenValue }) },
    );
    this.accessToken = data.access_token;
    this.tokenExpire = Date.now() + data.expires_in * 1000;
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(this.tokenExpire) };
  }

  private async getToken(): Promise<string> {
    const injected = this.getInjectedAccessToken();
    if (injected) return injected;
    if (this.accessToken && Date.now() < this.tokenExpire - 60000) return this.accessToken;
    if (this.refreshTokenValue) return (await this.refreshToken()).accessToken;
    throw new Error('Bilibili adapter is not authenticated');
  }

  async publish(post: PublishRequest): Promise<PublishResult> {
    const token = await this.getToken();
    const data = await this.call<{ aid: number; bvid: string }>(
      'https://member.bilibili.com/x/web/archive/post/add',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: post.content.slice(0, 80), content: post.content, type: 2 }),
      },
    );
    return { externalId: data.bvid, externalUrl: `https://www.bilibili.com/video/${data.bvid}`, publishedAt: new Date() };
  }

  async fetchMetrics(accountId: string, dateRange: DateRange): Promise<MetricsResult> {
    const token = await this.getToken();
    const data = await this.call<{ data: { view: string; like: string; reply: string; share: string; fans: string } }>(
      `https://member.bilibili.com/x/web/archive/stats/overview`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    );
    return {
      impressions: Number(data.data.view ?? 0),
      engagements: Number((data.data.like ?? 0) + (data.data.reply ?? 0) + (data.data.share ?? 0)),
      likes: Number(data.data.like ?? 0),
      comments: Number(data.data.reply ?? 0),
      shares: Number(data.data.share ?? 0),
      views: Number(data.data.view ?? 0),
      followerCount: Number(data.data.fans ?? 0),
    };
  }

  async fetchComments(accountId: string, postId: string): Promise<Comment[]> {
    const data = await this.call<{ data: { replies: Array<{ rpid: number; member: { uname: string }; content: { message: string }; ctime: number }> } }>(
      `https://api.bilibili.com/x/v2/reply?type=1&oid=${encodeURIComponent(postId)}&sort=0`,
    );
    return (data.data?.replies ?? []).map((r) => ({
      id: String(r.rpid),
      authorId: r.member.uname,
      authorName: r.member.uname,
      content: r.content.message,
      createdAt: new Date(r.ctime * 1000),
    }));
  }

  async replyToComment(accountId: string, commentId: string, message: string): Promise<void> {
    const token = await this.getToken();
    await this.call<unknown>('https://api.bilibili.com/x/v2/reply/add', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 1, oid: accountId, rpid: commentId, message }),
    });
  }

  async fetchMessages(accountId: string): Promise<Message[]> {
    const data = await this.call<{ data: { messages: Array<{ id: number; talker_id: number; talker_name: string; content: string; session_ts: number; is_sender: number }> } }>(
      `https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions?session_type=1&mid=${encodeURIComponent(accountId)}`,
    );
    return (data.data?.messages ?? []).map((m) => ({
      id: String(m.id),
      authorId: String(m.talker_id),
      authorName: m.talker_name,
      content: m.content,
      createdAt: new Date(m.session_ts * 1000),
      conversationId: String(m.talker_id),
      sentByMe: m.is_sender === 1,
    }));
  }
}
