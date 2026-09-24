import { createHash } from 'node:crypto';
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
    text: async () => JSON.stringify(body),
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  }) as Response;

// The base adapter resolves hostnames to block DNS-rebinding to private IPs.
// Tests use fake hostnames that don't resolve, so stub lookup to return a public
// IP. The private-IP rejection itself is covered by unit tests on isPrivateIP.
jest.mock('node:dns', () => {
  const actual = jest.requireActual('node:dns');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      lookup: jest.fn(async () => [{ address: '142.250.80.46', family: 4 }]),
    },
  };
});

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
  it('parses a token callback', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'XAT', expires_in: 3600 }),
    );
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    const creds = await adapter.handleCallback('code');
    expect(creds.accessToken).toBe('XAT');
    spy.mockRestore();
  });

  it('computes the official v3 sign — MD5(method?appId&timestamp&version + appSecret)', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ error_code: 0, data: { note_id: 'nh-1' }, success: true }));
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    await adapter.handleCallback('code');
    await adapter.publish({ content: 'hi' });
    // The request must go to the official common gateway.
    expect(String(spy.mock.calls[1][0])).toBe(
      'https://ark.xiaohongshu.com/ark/open_api/v3/common_controller',
    );
    const init = spy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.method).toBe('note.publish');
    expect(body.appId).toBe('AK');
    expect(body.accessToken).toBe('AT');
    expect(body.version).toBe('2.0');
    expect(typeof body.timestamp).toBe('number');
    // Recompute the documented signature and compare against the sent sign.
    const expected = createHash('md5')
      .update(`note.publish?appId=AK&timestamp=${body.timestamp}&version=2.0AS`)
      .digest('hex');
    expect(body.sign).toBe(expected);
    expect(body.sign).toMatch(/^[0-9a-f]{32}$/);
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

  it('rotates the access token using the refresh grant', async () => {
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
    const body = JSON.parse(init.body as string);
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

  it('rejects comment replies — they need a web-session cookie, not a token', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }));
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    await adapter.handleCallback('code');
    await expect(adapter.replyToComment('BV123', 'c-1', 'thanks')).rejects.toThrow(/web-session cookie/);
    expect(spy).toHaveBeenCalledTimes(1); // no request was fired
    spy.mockRestore();
  });

  it('rejects private messages — they need a web-session cookie, not a token', async () => {
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    await expect(adapter.fetchMessages('a')).rejects.toThrow(/web-session cookie/);
  });

  it('builds official 签名 2.0 headers on an arcopen call', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { upload_token: 'tok-1' }, message: '0' }));
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    await adapter.handleCallback('code');
    // Drive the arcopen gateway through the private helper by publishing...
    // (publish throws before any call; exercise signArcOpen via a direct cast.)
    const body = JSON.stringify({ name: 'v.mp4', utype: 1 });
    const headers = (adapter as unknown as {
      signArcOpen: (t: string, b: string) => Record<string, string>;
    }).signArcOpen('AT', body);
    expect(headers['x-bili-signature-method']).toBe('HMAC-SHA256');
    expect(headers['x-bili-signature-version']).toBe('2.0');
    expect(headers['x-bili-accesskeyid']).toBe('AK');
    expect(headers['Access-Token']).toBe('AT');
    expect(headers['x-bili-content-md5']).toBe(createHash('md5').update(body).digest('hex'));
    expect(headers.Authorization).toMatch(/^[0-9a-f]{64}$/);
    spy.mockRestore();
  });

  it('refuses to publish — binary upload pipeline not yet wired', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }));
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    await adapter.handleCallback('code');
    await expect(
      adapter.publish({ content: 'my video', mediaUrls: ['https://cdn.example/v.mp4'] }),
    ).rejects.toThrow(/not yet wired/);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('replyToMessage', () => {
  it('Bilibili rejects message replies — they need a web-session cookie, not a token', async () => {
    const adapter = new BilibiliAdapter({ accessKey: 'AK', secretKey: 'SK', accountId: 'a' });
    await expect(
      adapter.replyToMessage('a', 'msg-1', 'got it'),
    ).rejects.toThrow(/web-session cookie/);
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
      jsonResponse({ access_token: 'AT', expires_in: 7200, uid: 'uid-9' }),
    );
    const adapter = new WeiboAdapter({ appKey: 'KEY', appSecret: 'SEC', uid: 'tmp' });
    const creds = await adapter.handleCallback('code-123');
    expect(creds.accessToken).toBe('AT');
    expect((adapter as unknown as { uid: string }).uid).toBe('uid-9');
    // Weibo's OAuth token endpoint demands form-urlencoded, not JSON.
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-123');
    spy.mockRestore();
  });

  it('rejects refresh — Weibo has no refresh_token grant', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'AT', expires_in: 7200, uid: 'uid-9' }),
    );
    const adapter = new WeiboAdapter({ appKey: 'KEY', appSecret: 'SEC', uid: 'u1' });
    await adapter.handleCallback('code');
    await expect(adapter.refreshToken()).rejects.toThrow(/refresh_token grant/);
    // No refresh request should ever be fired.
    expect(spy).toHaveBeenCalledTimes(1);
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
  it('builds an OAuth2 URL with a real S256 PKCE challenge', () => {
    const adapter = new TwitterAdapter({ clientKey: 'CK', clientSecret: 'CS', userId: 'u1' });
    const url = adapter.getAuthUrl('xyz');
    expect(url).toContain('CK');
    expect(url).toContain('xyz');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('tweet.write');
    // A real S256 challenge is base64url(SHA-256(verifier)) = 43 chars, never the
    // old placeholder `challenge`.
    const challenge = new URL(url).searchParams.get('code_challenge') ?? '';
    expect(challenge).not.toBe('challenge');
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('exchanges a code for tokens using the PKCE verifier for the state', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 7200 }),
    );
    const adapter = new TwitterAdapter({ clientKey: 'CK', clientSecret: 'CS', userId: 'u1' });
    const url = adapter.getAuthUrl('state-1');
    const challenge = new URL(url).searchParams.get('code_challenge') ?? '';
    const creds = await adapter.handleCallback('code-123', 'state-1');
    expect(creds.accessToken).toBe('AT');
    // The token endpoint must be called with HTTP Basic auth.
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toMatch(/^Basic /);
    // The submitted code_verifier must hash to the challenge sent in the URL —
    // this is what makes the handshake succeed against the real API.
    const body = new URLSearchParams(init.body as string);
    const verifier = body.get('code_verifier') ?? '';
    expect(verifier.length).toBeGreaterThanOrEqual(64);
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
    spy.mockRestore();
  });

  it('rejects a code exchange with no matching verifier', async () => {
    const adapter = new TwitterAdapter({ clientKey: 'CK', clientSecret: 'CS', userId: 'u1' });
    await expect(adapter.handleCallback('code', 'unknown-state')).rejects.toThrow(
      /No PKCE verifier/,
    );
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
    adapter.getAuthUrl('s');
    await adapter.handleCallback('code', 's');
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
    adapter.getAuthUrl('s');
    await adapter.handleCallback('code', 's');
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
    adapter.getAuthUrl('s');
    await adapter.handleCallback('code', 's');
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

  it('publishes via the resumable upload protocol and returns a video id + url', async () => {
    const spy = jest.spyOn(global, 'fetch')
      // 1. token exchange
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      // 2. media bytes fetch
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) } as unknown as Response)
      // 3. resumable init — empty body, upload URL lives in the Location header
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ location: 'https://upload.example/session-1' }),
        text: async () => '',
      } as unknown as Response)
      // 4. PUT the bytes — returns the created video resource
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: 'yt-123' }),
      } as unknown as Response);
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    await adapter.handleCallback('code');
    const result = await adapter.publish({
      content: 'description text',
      extra: { title: 'My Vid' },
      mediaUrls: ['https://cdn.example/vid.mp4'],
    });
    expect(result.externalId).toBe('yt-123');
    expect(result.externalUrl).toContain('yt-123');
    // The PUT must target the session URL taken from the Location header.
    expect(String(spy.mock.calls[3][0])).toBe('https://upload.example/session-1');
    expect((spy.mock.calls[3][1] as RequestInit).method).toBe('PUT');
    spy.mockRestore();
  });

  it('throws when publishing without a video media URL', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }));
    const adapter = new YouTubeAdapter({ clientId: 'CID', clientSecret: 'CS', channelId: 'UC1' });
    await adapter.handleCallback('code');
    await expect(adapter.publish({ content: 'no video' })).rejects.toThrow(/media URL/);
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
  it('publishes a note via the common gateway and returns its id + url', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ error_code: 0, data: { note_id: 'nh-42' }, success: true }));
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    await adapter.handleCallback('code');
    const result = await adapter.publish({ content: 'hello red', mediaUrls: ['https://img/x.jpg'] });
    expect(result.externalId).toBe('nh-42');
    expect(result.externalUrl).toContain('nh-42');
    expect(String(spy.mock.calls[1][0])).toContain('ark.xiaohongshu.com');
    const body = JSON.parse((spy.mock.calls[1][1] as RequestInit).body as string);
    expect(body.method).toBe('note.publish');
    expect(body.media_urls).toEqual(['https://img/x.jpg']);
    spy.mockRestore();
  });

  it('throws when the gateway returns a non-zero error_code', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ error_code: 40001, error_msg: 'invalid signature', success: false }));
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    await adapter.handleCallback('code');
    await expect(adapter.publish({ content: 'hi' })).rejects.toThrow(/40001/);
    spy.mockRestore();
  });

  it('refuses to fetch metrics — official method name not yet wired', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 3600 }));
    const adapter = new XiaoHongShuAdapter({ appKey: 'AK', appSecret: 'AS', accountId: 'a' });
    await adapter.handleCallback('code');
    await expect(
      adapter.fetchMetrics('a', { start: new Date(), end: new Date() }),
    ).rejects.toThrow(/not yet wired/);
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
  it('uploads cover image, creates a draft, then submits for publishing', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 7200 })) // getAccessToken
      .mockResolvedValueOnce(jsonResponse({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) // fetchMediaBytes
      .mockResolvedValueOnce(jsonResponse({ media_id: 'thumb-1', url: 'https://mmbiz.qpic.cn/thumb-1' })) // add_material
      .mockResolvedValueOnce(jsonResponse({ media_id: 'mid-1' })) // draft/add
      .mockResolvedValueOnce(jsonResponse({ publish_id: 'pub-1' })); // freepublish/submit
    const adapter = new WechatOfficialAdapter({ appid: 'APP', secret: 'SEC', rawId: 'raw' });
    const result = await adapter.publish({
      content: 'article body',
      extra: { title: 'T' },
      mediaUrls: ['https://img/cover.jpg'],
    });
    expect(result.externalId).toBe('pub-1');
    expect(result.externalUrl).toContain('pub-1');
    // fetchMediaBytes → add_material → draft/add → freepublish/submit in order.
    expect(String(spy.mock.calls[1][0])).toContain('https://img/cover.jpg');
    expect(String(spy.mock.calls[2][0])).toContain('add_material');
    expect(String(spy.mock.calls[3][0])).toContain('draft/add');
    expect(String(spy.mock.calls[4][0])).toContain('freepublish/submit');
    spy.mockRestore();
  });

  it('throws when no cover image is provided (WeChat requires thumb)', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', expires_in: 7200 }));
    const adapter = new WechatOfficialAdapter({ appid: 'APP', secret: 'SEC', rawId: 'raw' });
    await expect(
      adapter.publish({ content: 'article body', extra: { title: 'T' } }),
    ).rejects.toThrow(/cover image/);
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
  it('refuses to publish — 视频号 has no official content-publish API', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }));
    const adapter = new WechatVideoAdapter({ clientKey: 'K', clientSecret: 'S', accountId: 'a' });
    await adapter.handleCallback('code');
    // A clear error, not a request fired at the wrong endpoint family.
    await expect(
      adapter.publish({ content: 'video caption', mediaUrls: ['https://cdn.example/v.mp4'] }),
    ).rejects.toThrow(/does not yet expose an open API/);
    expect(spy).toHaveBeenCalledTimes(1); // no publish request was made
    spy.mockRestore();
  });

  it('refuses to fetch metrics — no official content-metrics API', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }));
    const adapter = new WechatVideoAdapter({ clientKey: 'K', clientSecret: 'S', accountId: 'a' });
    await adapter.handleCallback('code');
    await expect(
      adapter.fetchMetrics('a', { start: new Date(), end: new Date() }),
    ).rejects.toThrow(/does not yet expose an open API/);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('rotates the token via the dedicated refresh_token endpoint', async () => {
    const spy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ access_token: 'T1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'T2', refresh_token: 'R2', expires_in: 3600 }));
    const adapter = new WechatVideoAdapter({ clientKey: 'K', clientSecret: 'S', accountId: 'a' });
    await adapter.handleCallback('code');
    (adapter as unknown as { tokenExpire: number }).tokenExpire = 0;
    const creds = await adapter.refreshToken();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(creds.accessToken).toBe('T2');
    // The refresh uses the dedicated refresh_token endpoint with the stored refresh token.
    expect(String(spy.mock.calls[1][0])).toContain('sns/oauth2/refresh_token');
    expect(String(spy.mock.calls[1][0])).toContain('grant_type=refresh_token');
    expect(String(spy.mock.calls[1][0])).toContain(encodeURIComponent('R1'));
    spy.mockRestore();
  });
});

describe('fetchMessages unsupported degradation', () => {
  it('throws a clear error on adapters without a messages API', async () => {
    const adapter = new DouyinAdapter({ clientKey: 'K', clientSecret: 'S', openId: 'o' });
    await expect(adapter.fetchMessages('a')).rejects.toThrow(/does not expose a messages API/);
  });
});
