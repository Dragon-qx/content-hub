"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformAdapterFactory = void 0;
const types_1 = require("./types");
const douyin_1 = require("./adapters/douyin");
const xiaohongshu_1 = require("./adapters/xiaohongshu");
const bilibili_1 = require("./adapters/bilibili");
const weibo_1 = require("./adapters/weibo");
const twitter_1 = require("./adapters/twitter");
const youtube_1 = require("./adapters/youtube");
const wechat_video_1 = require("./adapters/wechat-video");
const wechat_official_1 = require("./wechat-official");
class PlatformAdapterFactory {
    /**
     * Build the adapter responsible for a given platform. Returns null when the
     * platform has no supported adapter yet, so callers can show a clean
     * "not supported" state rather than throwing.
     */
    static create(platform, config = {}) {
        switch (platform) {
            case types_1.Platform.WECHAT_OFFICIAL:
                return new wechat_official_1.WechatOfficialAdapter({
                    appid: String(config.appid ?? ''),
                    secret: String(config.secret ?? ''),
                    rawId: String(config.rawId ?? config.accountId ?? ''),
                });
            case types_1.Platform.WECHAT_VIDEO:
                return new wechat_video_1.WechatVideoAdapter({
                    clientKey: String(config.clientKey ?? config.appid ?? ''),
                    clientSecret: String(config.clientSecret ?? config.secret ?? ''),
                    accountId: String(config.accountId ?? ''),
                });
            case types_1.Platform.DOUYIN:
                return new douyin_1.DouyinAdapter({
                    clientKey: String(config.clientKey ?? config.appKey ?? ''),
                    clientSecret: String(config.clientSecret ?? config.appSecret ?? ''),
                    openId: String(config.openId ?? config.accountId ?? ''),
                });
            case types_1.Platform.XIAOHONGSHU:
                return new xiaohongshu_1.XiaoHongShuAdapter({
                    appKey: String(config.appKey ?? config.appid ?? ''),
                    appSecret: String(config.appSecret ?? config.secret ?? ''),
                    accountId: String(config.accountId ?? ''),
                });
            case types_1.Platform.BILIBILI:
                return new bilibili_1.BilibiliAdapter({
                    accessKey: String(config.accessKey ?? config.appKey ?? ''),
                    secretKey: String(config.secretKey ?? config.appSecret ?? config.secret ?? ''),
                    accountId: String(config.accountId ?? ''),
                });
            case types_1.Platform.WEIBO:
                return new weibo_1.WeiboAdapter({
                    appKey: String(config.appKey ?? config.appid ?? ''),
                    appSecret: String(config.appSecret ?? config.secret ?? ''),
                    uid: String(config.uid ?? config.accountId ?? ''),
                });
            case types_1.Platform.TWITTER:
                return new twitter_1.TwitterAdapter({
                    clientKey: String(config.clientKey ?? config.appKey ?? config.appid ?? ''),
                    clientSecret: String(config.clientSecret ?? config.appSecret ?? config.secret ?? ''),
                    userId: String(config.userId ?? config.accountId ?? ''),
                });
            case types_1.Platform.YOUTUBE:
                return new youtube_1.YouTubeAdapter({
                    clientId: String(config.clientId ?? config.clientKey ?? config.appKey ?? config.appid ?? ''),
                    clientSecret: String(config.clientSecret ?? config.appSecret ?? config.secret ?? ''),
                    channelId: String(config.channelId ?? config.accountId ?? ''),
                });
            default:
                return null;
        }
    }
}
exports.PlatformAdapterFactory = PlatformAdapterFactory;
//# sourceMappingURL=adapter-factory.js.map