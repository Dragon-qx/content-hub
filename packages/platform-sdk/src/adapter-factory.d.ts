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
    static create(platform: Platform | string, config?: AdapterConfig): WechatOfficialAdapter | DouyinAdapter | XiaoHongShuAdapter | BilibiliAdapter | WeiboAdapter | TwitterAdapter | YouTubeAdapter | WechatVideoAdapter | null;
}
