import { Platform } from '../types';
import { PlatformAdapterFactory } from '../adapter-factory';
import { WechatOfficialAdapter } from '../wechat-official';
import { WechatVideoAdapter } from './wechat-video';
import { DouyinAdapter } from './douyin';
import { XiaoHongShuAdapter } from './xiaohongshu';
import { BilibiliAdapter } from './bilibili';
import { WeiboAdapter } from './weibo';
import { TwitterAdapter } from './twitter';
import { YouTubeAdapter } from './youtube';

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
    for (const p of [
      Platform.WECHAT_VIDEO,
      Platform.DOUYIN,
      Platform.XIAOHONGSHU,
      Platform.BILIBILI,
      Platform.WEIBO,
      Platform.TWITTER,
      Platform.YOUTUBE,
    ]) {
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

describe('XiaoHongShuAdapter refreshToken', () => {
  it('captures a refresh token returned by the token endpoint', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
    );
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    const creds = await adapter.handleCallback('code');
    expect(creds.refreshToken).toBe('RT');
    // The captured refresh token must be held internally for later rotation.
    expect((adapter as unknown as { refreshTokenValue: string | null }).refreshTokenValue).toBe('RT');
    spy.mockRestore();
  });

  it('rotates the access token using the refresh grant + HMAC signature', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'T1', refresh_token: 'R1', expires_in: 10 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'T2', refresh_token: 'R2', expires_in: 3600 }),
      );
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    await adapter.handleCallback('code');
    // Expire the cached access token so refreshToken() is forced to rotate.
    (adapter as unknown as { tokenExpire: number }).tokenExpire = 0;
    const creds = await adapter.refreshToken();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(creds.accessToken).toBe('T2');
    // Second call must target the token endpoint with the refresh grant.
    const init = spy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse((init.headers as Record<string, string>)['X-Signature'] ? (init.body as string) : '{}');
    expect(body.grant_type).toBe('refresh_token');
    expect(body.refresh_token).toBe('R1');
    spy.mockRestore();
  });

  it('throws when no refresh token is held', async () => {
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    await expect(adapter.refreshToken()).rejects.toThrow(/No refresh token for XiaoHongShu/);
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

describe('replyToMessage', () => {
  it('Bilibili replies to a private message via the web_im send_msg endpoint', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({}));
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    await adapter.handleCallback('code');
    await adapter.replyToMessage('a', 'msg-1', 'got it');
    expect(spy).toHaveBeenCalledTimes(2);
    const replyUrl = spy.mock.calls[1][0];
    expect(String(replyUrl)).toContain('/web_im/v1/web_im/send_msg');
    const init = spy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse((init.body as string) ?? '{}');
    expect(body.reply_mid).toBe('msg-1');
    expect(body.receiver_id).toBe('a');
    spy.mockRestore();
  });

  it('degrades on adapters without a message-reply surface', async () => {
    const adapter = new DouyinAdapter({ clientKey: 'K', clientSecret: 'S', openId: 'o' });
    await expect(
      adapter.replyToMessage('a', 'msg-1', 'hi'),
    ).rejects.toThrow(/does not support replying to private messages/);
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

describe('TwitterAdapter', () => {
  it('builds an OAuth2 URL containing the client key', () => {
    const adapter = new TwitterAdapter({ clientKey: 'CK', clientSecret: 'CS', userId: 'u1' });
    const url = adapter.getAuthUrl('xyz');
    expect(url).toContain('CK');
    expect(url).toContain('xyz');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('tweet.write');
  });

  it('exchanges a code for tokens', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 7200 }),
    );
    const adapter = new TwitterAdapter({ clientKey: 'CK', clientSecret: 'CS', userId: 'u1' });
    const creds = await adapter.handleCallback('code-123');
    expect(creds.accessToken).toBe('AT');
    // The token endpoint must be called with HTTP Basic auth.
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toMatch(/^Basic /);
    spy.mockRestore();
  });

  it('refreshes an expired token', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'T1', refresh_token: 'R1', expires_in: 10 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'T2', refresh_token: 'R2', expires_in: 7200 }),
      );
    const adapter = new TwitterAdapter({ clientKey: 'CK', clientSecret: 'CS', userId: 'u1' });
    await adapter.handleCallback('code');
    (adapter as unknown as { tokenExpire: number }).tokenExpire = 0;
    const creds = await adapter.refreshToken();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(creds.accessToken).toBe('T2');
    spy.mockRestore();
  });

  it('publishes a tweet and returns the id + url', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'tid-42', text: 'hi' } }));
    const adapter = new TwitterAdapter({ clientKey: 'CK', clientSecret: 'CS', userId: 'u1' });
    await adapter.handleCallback('code');
    const result = await adapter.publish({ content: 'hi' });
    expect(result.externalId).toBe('tid-42');
    expect(result.externalUrl).toContain('u1');
    expect(result.externalUrl).toContain('tid-42');
    spy.mockRestore();
  });

  it('fetches follower metrics from the users lookup', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: 'u1', public_metrics: { followers_count: 1500 } } }),
      );
    const adapter = new TwitterAdapter({ clientKey: 'CK', clientSecret: 'CS', userId: 'u1' });
    await adapter.handleCallback('code');
    const metrics = await adapter.fetchMetrics('u1', { start: new Date(), end: new Date() });
    expect(metrics.followerCount).toBe(1500);
    spy.mockRestore();
  });
});

describe('YouTubeAdapter', () => {
  it('builds an OAuth2 URL containing the client id and YouTube scopes', () => {
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    const url = adapter.getAuthUrl('xyz');
    expect(url).toContain('CID');
    expect(url).toContain('xyz');
    expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/youtube'));
    expect(url).toContain('access_type=offline');
  });

  it('exchanges a code for tokens', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
    );
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    const creds = await adapter.handleCallback('code');
    expect(creds.accessToken).toBe('AT');
    spy.mockRestore();
  });

  it('refreshes an expired token with the refresh_token grant', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'T1', refresh_token: 'R1', expires_in: 10 }),
      )
      .mockResolvedValueOnce(jsonResponse({ access_token: 'T2', expires_in: 3600 }));
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    await adapter.handleCallback('code');
    (adapter as unknown as { tokenExpire: number }).tokenExpire = 0;
    const creds = await adapter.refreshToken();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(creds.accessToken).toBe('T2');
    spy.mockRestore();
  });

  it('registers upload metadata and returns a video id + url', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'yt-123' }));
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    await adapter.handleCallback('code');
    const result = await adapter.publish({ content: 'description text', extra: { title: 'My Vid' } });
    expect(result.externalId).toBe('yt-123');
    expect(result.externalUrl).toContain('yt-123');
    spy.mockRestore();
  });

  it('fetches channel metrics (subs + views)', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ statistics: { subscriberCount: '9999', viewCount: '50000' } }] }),
      );
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    await adapter.handleCallback('code');
    const metrics = await adapter.fetchMetrics('UC1', { start: new Date(), end: new Date() });
    expect(metrics.followerCount).toBe(9999);
    expect(metrics.views).toBe(50000);
    spy.mockRestore();
  });

  it('fetches comment threads and maps them', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'thread-1',
              snippet: {
                authorChannelId: { value: 'UC-author' },
                authorDisplayName: 'fan',
                textDisplay: 'great video',
                publishedAt: '2026-01-01T00:00:00Z',
              },
            },
          ],
        }),
      );
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    await adapter.handleCallback('code');
    const comments = await adapter.fetchComments('UC1', 'yt-123');
    expect(comments).toHaveLength(1);
    expect(comments[0].authorName).toBe('fan');
    expect(comments[0].content).toBe('great video');
    spy.mockRestore();
  });

  it('replies to a comment via the comments.insert endpoint', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({}));
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    await adapter.handleCallback('code');
    await adapter.replyToComment('UC1', 'thread-1', 'thanks!');
    // Second call targets the comments insert endpoint.
    const replyUrl = spy.mock.calls[1][0];
    expect(String(replyUrl)).toContain('/youtube/v3/comments');
    const replyBody = JSON.parse(((spy.mock.calls[1][1] as RequestInit).body as string) ?? '{}');
    expect(replyBody.snippet.parentId).toBe('thread-1');
    expect(replyBody.snippet.textOriginal).toBe('thanks!');
    spy.mockRestore();
  });
});

describe('XiaoHongShuAdapter publish + fetchMetrics', () => {
  it('publishes a note with a signed body and returns its id + url', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ note_id: 'nh-42' }));
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    await adapter.handleCallback('code');
    const result = await adapter.publish({ content: 'hello red', mediaUrls: ['https://img/x.jpg'] });
    expect(result.externalId).toBe('nh-42');
    expect(result.externalUrl).toContain('nh-42');
    // The create call must carry the HMAC signature header.
    const init = spy.mock.calls[1][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Signature']).toMatch(/^[0-9a-f]{64}$/);
    spy.mockRestore();
  });

  it('fetches insights and maps them to the normalised shape', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: { exposure: 100, like: 5, collect: 3, comment: 2, share: 1, view: 90, fans: 50 } }));
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    await adapter.handleCallback('code');
    const metrics = await adapter.fetchMetrics('a', { start: new Date(), end: new Date() });
    expect(metrics.impressions).toBe(100);
    expect(metrics.likes).toBe(5);
    expect(metrics.engagements).toBe(10); // like + collect + comment
    expect(metrics.followerCount).toBe(50);
    spy.mockRestore();
  });
});

describe('DouyinAdapter publish + fetchMetrics', () => {
  it('creates a video item and returns its id + share url', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, open_id: 'oid' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { item_id: 'it-99', share_url: 'https://v.douyin.it/99' } }));
    const adapter = new DouyinAdapter({ clientKey: 'K', clientSecret: 'S', openId: 'oid' });
    await adapter.handleCallback('code');
    const result = await adapter.publish({ content: 'caption' });
    expect(result.externalId).toBe('it-99');
    expect(result.externalUrl).toBe('https://v.douyin.it/99');
    spy.mockRestore();
  });

  it('fetches fan statistics and maps them', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, open_id: 'oid' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { statistics: { total_play: 200, total_like: 10, total_comment: 4, total_share: 2, total_fans: 80 } } }));
    const adapter = new DouyinAdapter({ clientKey: 'K', clientSecret: 'S', openId: 'oid' });
    await adapter.handleCallback('code');
    const metrics = await adapter.fetchMetrics('a', { start: new Date(), end: new Date() });
    expect(metrics.impressions).toBe(200);
    expect(metrics.views).toBe(200);
    expect(metrics.engagements).toBe(16); // like + comment + share
    expect(metrics.followerCount).toBe(80);
    spy.mockRestore();
  });
});

describe('WechatOfficialAdapter publish + fetchMetrics + refreshToken', () => {
  it('creates a draft then submits it for publishing', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ media_id: 'mid-1' }))
      .mockResolvedValueOnce(jsonResponse({ publish_id: 'pub-1' }));
    const adapter = new WechatOfficialAdapter({ appid: 'APP', secret: 'SEC', rawId: 'raw' });
    const result = await adapter.publish({ content: 'article body', extra: { title: 'T' } });
    expect(result.externalId).toBe('pub-1');
    expect(result.externalUrl).toContain('pub-1');
    // draft/add then freepublish/submit in order.
    expect(String(spy.mock.calls[1][0])).toContain('draft/add');
    expect(String(spy.mock.calls[2][0])).toContain('freepublish/submit');
    spy.mockRestore();
  });

  it('fetches the follower count as its primary metric', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ total: 12345 }));
    const adapter = new WechatOfficialAdapter({ appid: 'APP', secret: 'SEC', rawId: 'raw' });
    // WechatOfficial's fetchMetrics ignores the date range (no public impression
    // endpoint) and reports the follower count as the primary metric.
    const metrics = await adapter.fetchMetrics();
    expect(metrics.followerCount).toBe(12345);
    expect(metrics.impressions).toBe(0);
    spy.mockRestore();
  });

  it('degrades for refreshToken (client-credential grant has no refresh)', async () => {
    const adapter = new WechatOfficialAdapter({ appid: 'APP', secret: 'SEC', rawId: 'raw' });
    await expect(adapter.refreshToken()).rejects.toThrow(/WECHAT_OFFICIAL does not support token refresh/);
  });
});

describe('WechatVideoAdapter publish + fetchMetrics + refreshToken', () => {
  it('submits content and returns the publish id + url', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ publish_id: 'wvid-7' }));
    const adapter = new WechatVideoAdapter({ clientKey: 'K', clientSecret: 'S', accountId: 'a' });
    await adapter.handleCallback('code');
    const result = await adapter.publish({ content: 'video caption', extra: { title: 'V' } });
    expect(result.externalId).toBe('wvid-7');
    expect(result.externalUrl).toContain('wvid-7');
    spy.mockRestore();
  });

  it('fetches channel basics and maps them', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ play_cnt: 300, like_cnt: 20, comment_cnt: 6, share_cnt: 3, fans_cnt: 60 }));
    const adapter = new WechatVideoAdapter({ clientKey: 'K', clientSecret: 'S', accountId: 'a' });
    await adapter.handleCallback('code');
    const metrics = await adapter.fetchMetrics('a', { start: new Date(), end: new Date() });
    expect(metrics.views).toBe(300);
    expect(metrics.impressions).toBe(300);
    expect(metrics.likes).toBe(20);
    expect(metrics.followerCount).toBe(60);
    spy.mockRestore();
  });

  it('rotates the token by re-running the code exchange with the refresh token', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'T1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'T2', refresh_token: 'R2', expires_in: 3600 }));
    const adapter = new WechatVideoAdapter({ clientKey: 'K', clientSecret: 'S', accountId: 'a' });
    await adapter.handleCallback('code');
    (adapter as unknown as { tokenExpire: number }).tokenExpire = 0;
    const creds = await adapter.refreshToken();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(creds.accessToken).toBe('T2');
    // Refresh reuses the code/pass_token exchange endpoint with the refresh token.
    expect(String(spy.mock.calls[1][0])).toContain('sns/oauth2/access_token');
    spy.mockRestore();
  });
});

describe('fetchMessages unsupported degradation', () => {
  it('throws a clear error on adapters without a messages API', async () => {
    const adapter = new DouyinAdapter({ clientKey: 'K', clientSecret: 'S', openId: 'o' });
    await expect(adapter.fetchMessages('a')).rejects.toThrow(/does not expose a messages API/);
  });
});
