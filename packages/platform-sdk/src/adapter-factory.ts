import { Platform } from './types';
import { DouyinAdapter } from './adapters/douyin';
import { XiaoHongShuAdapter } from './adapters/xiaohongshu';
import { BilibiliAdapter } from './adapters/bilibili';
import { WeiboAdapter } from './adapters/weibo';
import { WechatVideoAdapter } from './adapters/wechat-video';
import { WechatOfficialAdapter } from './wechat-official';

export type AdapterConfig = Record<string, unknown>;

export class PlatformAdapterFactory {
  /**
   * Build the adapter responsible for a given platform. Returns null when the
   * platform has no supported adapter yet, so callers can show a clean
   * "not supported" state rather than throwing.
   */
  static create(platform: Platform | string, config: AdapterConfig = {}) {
    switch (platform) {
      case Platform.WECHAT_OFFICIAL:
        return new WechatOfficialAdapter({
          appid: String(config.appid ?? ''),
          secret: String(config.secret ?? ''),
          rawId: String(config.rawId ?? config.accountId ?? ''),
        });
      case Platform.WECHAT_VIDEO:
        return new WechatVideoAdapter({
          clientKey: String(config.clientKey ?? config.appid ?? ''),
          clientSecret: String(config.clientSecret ?? config.secret ?? ''),
          accountId: String(config.accountId ?? ''),
        });
      case Platform.DOUYIN:
        return new DouyinAdapter({
          clientKey: String(config.clientKey ?? config.appKey ?? ''),
          clientSecret: String(config.clientSecret ?? config.appSecret ?? ''),
          openId: String(config.openId ?? config.accountId ?? ''),
        });
      case Platform.XIAOHONGSHU:
        return new XiaoHongShuAdapter({
          appKey: String(config.appKey ?? config.appid ?? ''),
          appSecret: String(config.appSecret ?? config.secret ?? ''),
          accountId: String(config.accountId ?? ''),
        });
      case Platform.BILIBILI:
        return new BilibiliAdapter({
          accessKey: String(config.accessKey ?? config.appKey ?? ''),
          secretKey: String(config.secretKey ?? config.appSecret ?? config.secret ?? ''),
          accountId: String(config.accountId ?? ''),
        });
      case Platform.WEIBO:
        return new WeiboAdapter({
          appKey: String(config.appKey ?? config.appid ?? ''),
          appSecret: String(config.appSecret ?? config.secret ?? ''),
          uid: String(config.uid ?? config.accountId ?? ''),
        });
      default:
        return null;
    }
  }
}
