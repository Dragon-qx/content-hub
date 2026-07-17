import { Platform } from '../types';
import { PlatformAdapterFactory } from '../adapter-factory';
import { WechatVideoAdapter } from './wechat-video';
import { DouyinAdapter } from './douyin';
import { XiaoHongShuAdapter } from './xiaohongshu';
import { BilibiliAdapter } from './bilibili';
import { WeiboAdapter } from './weibo';

// Minimal global.fetch mock so adapters can be exercised without IO.
const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as Response;

afterEach(() => {
  // Restore any fetch spy so a stale mocked value can't leak into the next test.
  if (typeof (global as any).fetch?.mockRestore === 'function') {
    (global as any).fetch.mockRestore();
  }
});

describe('PlatformAdapterFactory', () => {
  it('creates an adapter for every supported platform', () => {
    for (const p of [Platform.WECHAT_VIDEO, Platform.DOUYIN, Platform.XIAOHONGSHU, Platform.BILIBILI, Platform.WEIBO]) {
      const adapter = PlatformAdapterFactory.create(p, { clientKey: 'k', clientSecret: 's', accountId: 'a' });
      expect(adapter).not.toBeNull();
      expect(adapter!.platform).toBe(p);
    }
  });

  it('returns null for unsupported platforms', () => {
    expect(PlatformAdapterFactory.create('NOT_A_REAL_PLATFORM' as Platform)).toBeNull();
  });

  it('routes WeChat Official credentials into the existing adapter', () => {
    const adapter = PlatformAdapterFactory.create(Platform.WECHAT_OFFICIAL, { appid: 'a', secret: 's' });
    expect(adapter).toBeDefined();
    expect(adapter!.platform).toBe(Platform.WECHAT_OFFICIAL);
  });
});

describe('WechatVideoAdapter auth', () => {
  it('builds an OAuth URL containing the client key', () => {
    const adapter = new WechatVideoAdapter({ clientKey: 'KEY', clientSecret: 'SEC', accountId: 'acct' });
    const url = adapter.getAuthUrl('xyz');
    expect(url).toContain('KEY');
    expect(url).toContain('xyz');
  });

  it('exchanges a code for tokens', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 7200 }),
    );
    const adapter = new WechatVideoAdapter({ clientKey: 'KEY', clientSecret: 'SEC', accountId: 'acct' });
    const creds = await adapter.handleCallback('code-123');
    expect(creds.accessToken).toBe('AT');
    expect(creds.refreshToken).toBe('RT');
    spy.mockRestore();
  });
});

describe('DouyinAdapter auth', () => {
  it('unwraps the nested data envelope on callback', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, open_id: 'oid' } }),
    );
    const adapter = new DouyinAdapter({ clientKey: 'KEY', clientSecret: 'SEC', openId: 'oid' });
    const creds = await adapter.handleCallback('code');
    expect(creds.accessToken).toBe('AT');
    spy.mockRestore();
  });

  it('requests a token refresh when expired', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: { access_token: 'T1', refresh_token: 'R1', expires_in: 10, open_id: 'o' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { access_token: 'T2', expires_in: 3600, refresh_token: 'R2' } }),
      );
    const adapter = new DouyinAdapter({ clientKey: 'K', clientSecret: 'S', openId: 'o' });
    await adapter.handleCallback('code');
    // expire the cached token so refreshToken re-fetches
    (adapter as unknown as { tokenExpire: number }).tokenExpire = 0;
    const creds = await adapter.refreshToken();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(creds.accessToken).toBe('T2');
    spy.mockRestore();
  });
});

describe('XiaoHongShuAdapter signing', () => {
  it('signs requests and parses a token callback', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'XAT', expires_in: 3600 }),
    );
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    const creds = await adapter.handleCallback('code');
    expect(creds.accessToken).toBe('XAT');
    // The HMAC signature header must be present on the request.
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Signature']).toMatch(/^[0-9a-f]{64}$/);
    spy.mockRestore();
  });
});

describe('BilibiliAdapter', () => {
  it('fetches comments and maps them', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ data: { replies: [{ rpid: 1, member: { uname: 'alice' }, content: { message: 'hi' }, ctime: 1700000000 }] } }),
    );
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    const comments = await adapter.fetchComments('a', 'BV123');
    expect(comments).toHaveLength(1);
    expect(comments[0].authorName).toBe('alice');
    spy.mockRestore();
  });

  it('supports replying to comments', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({}));
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    await adapter.handleCallback('code');
    await adapter.replyToComment('BV123', 'c-1', 'thanks');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('fetches private messages and maps them', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ data: { messages: [
        { id: 10, talker_id: 99, talker_name: 'bob', content: 'hello', session_ts: 1700000000, is_sender: 0 },
        { id: 11, talker_id: 99, talker_name: 'bob', content: 'my reply', session_ts: 1700000100, is_sender: 1 },
      ] } }),
    );
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    const messages = await adapter.fetchMessages('a');
    expect(messages).toHaveLength(2);
    expect(messages[0].authorName).toBe('bob');
    expect(messages[0].sentByMe).toBe(false);
    expect(messages[1].sentByMe).toBe(true);
    expect(messages[0].conversationId).toBe('99');
    spy.mockRestore();
  });
});

describe('WeiboAdapter', () => {
  it('builds an OAuth URL containing the app key', () => {
    const adapter = new WeiboAdapter({ appKey: 'KEY', appSecret: 'SEC', uid: 'u1' });
    const url = adapter.getAuthUrl('xyz');
    expect(url).toContain('KEY');
    expect(url).toContain('xyz');
  });

  it('exchanges a code for tokens and captures the uid', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 7200, uid: 'uid-9' }),
    );
    const adapter = new WeiboAdapter({ appKey: 'KEY', appSecret: 'SEC', uid: 'tmp' });
    const creds = await adapter.handleCallback('code-123');
    expect(creds.accessToken).toBe('AT');
    expect((adapter as unknown as { uid: string }).uid).toBe('uid-9');
    spy.mockRestore();
  });

  it('publishes a status and returns the post id + url', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, uid: 'u1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 100, idstr: 's100', url: 'https://weibo.com/u1/s100' }));
    const adapter = new WeiboAdapter({ appKey: 'KEY', appSecret: 'SEC', uid: 'u1' });
    await adapter.handleCallback('code');
    const result = await adapter.publish({ content: 'hello world' });
    expect(result.externalId).toBe('s100');
    expect(result.externalUrl).toBe('https://weibo.com/u1/s100');
    spy.mockRestore();
  });

  it('fetches user metrics (follower count)', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, uid: 'u1' }))
      .mockResolvedValueOnce(jsonResponse({ followers_count: 1234, friends_count: 56, statuses_count: 78 }));
    const adapter = new WeiboAdapter({ appKey: 'KEY', appSecret: 'SEC', uid: 'u1' });
    await adapter.handleCallback('code');
    const metrics = await adapter.fetchMetrics('u1', { start: new Date(), end: new Date() });
    expect(metrics.followerCount).toBe(1234);
    spy.mockRestore();
  });
});

describe('fetchMessages unsupported degradation', () => {
  it('throws a clear error on adapters without a messages API', async () => {
    const adapter = new DouyinAdapter({ clientKey: 'K', clientSecret: 'S', openId: 'o' });
    await expect(adapter.fetchMessages('a')).rejects.toThrow(/does not expose a messages API/);
  });
});
