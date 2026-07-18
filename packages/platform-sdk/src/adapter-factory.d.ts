import { Platform } from './types';
import { DouyinAdapter } from './adapters/douyin';
import { XiaoHongShuAdapter } from './adapters/xiaohongshu';
import { BilibiliAdapter } from './adapters/bilibili';
import { WeiboAdapter } from './adapters/weibo';
import { TwitterAdapter } from './adapters/twitter';
import { YouTubeAdapter } from './adapters/youtube';
import { WechatVideoAdapter } from './adapters/wechat-video';
import { WechatOfficialAdapter } from './wechat-official';
export type AdapterConfig = Record<string, unknown>;
export declare class PlatformAdapterFactory {
    /**
     * Build the adapter responsible for a given platform. Returns null when the
     * platform has no supported adapter yet, so callers can show a clean
     * "not supported" state rather than throwing.
     */
    static create(platform: Platform | string, config?: AdapterConfig): WechatOfficialAdapter | DouyinAdapter | XiaoHongShuAdapter | BilibiliAdapter | WeiboAdapter | TwitterAdapter | YouTubeAdapter | WechatVideoAdapter | null;
}
