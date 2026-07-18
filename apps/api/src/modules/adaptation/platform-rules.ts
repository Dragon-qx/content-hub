/**
 * Platform content-adaptation rules.
 *
 * The PRD (§3.4 "内容适配") gives concrete limits for the four V1.0 platforms.
 * The V1.1 platforms (Weibo / Twitter / YouTube / WeChat Video) are filled in
 * from their public documentation so the engine covers the full eight-adapter
 * matrix with the same shape. These are soft editorial limits — the engine
 * truncates copy and culls media to fit, and surfaces warnings so authors can
 * adjust. Nothing here makes network calls, so the rules are trivial to unit
 * test and safe to run inside the synchronous publish pipeline.
 */

export interface PlatformRule {
  platform: string;
  /** Human-readable label for UI display. */
  label: string;
  /** Maximum body length in characters. */
  maxLength: number;
  /** Maximum number of images a post may carry. */
  imageMax: number;
  /** Maximum number of videos a post may carry. */
  videoMax: number;
  /**
   * Minimum primary-video duration in seconds. 0 means the platform has no
   * enforced floor (text/image-only posts are fine).
   */
  minDurationSec: number;
  /**
   * Free-form platform-specific hints surfaced to the author — things the
   * engine cannot auto-fix, like Douyin topic tags or Bilibili category.
   */
  hints: string[];
}

export const PLATFORM_RULES: Record<string, PlatformRule> = {
  WECHAT_OFFICIAL: {
    platform: 'WECHAT_OFFICIAL',
    label: '微信公众号',
    maxLength: 20000,
    imageMax: 50,
    videoMax: 1,
    minDurationSec: 0,
    hints: ['正文支持富文本/Markdown转排版', '最多插入1个视频（需上传至素材库）'],
  },
  WECHAT_VIDEO: {
    platform: 'WECHAT_VIDEO',
    label: '微信视频号',
    maxLength: 1500,
    imageMax: 0,
    videoMax: 1,
    minDurationSec: 1,
    hints: ['以视频为主，可配≤1500字描述', '时长建议1s–30min'],
  },
  DOUYIN: {
    platform: 'DOUYIN',
    label: '抖音开放平台',
    maxLength: 500,
    imageMax: 35,
    videoMax: 1,
    minDurationSec: 15,
    hints: ['视频最短15s', '可添加话题#标签提升分发', '图集模式最多35张'],
  },
  XIAOHONGSHU: {
    platform: 'XIAOHONGSHU',
    label: '小红书专业号',
    maxLength: 1000,
    imageMax: 18,
    videoMax: 1,
    minDurationSec: 0,
    hints: ['图文笔记最多18张图', '标题建议包含关键词利于搜索'],
  },
  BILIBILI: {
    platform: 'BILIBILI',
    label: 'Bilibili',
    maxLength: 2000,
    imageMax: 18,
    videoMax: 1,
    minDurationSec: 0,
    hints: ['投稿需选分区', '图文动态最多18张'],
  },
  WEIBO: {
    platform: 'WEIBO',
    label: '微博开放平台',
    maxLength: 5000,
    imageMax: 18,
    videoMax: 1,
    minDurationSec: 0,
    hints: ['默认长文本上限5000字（短微博140字）', '可同时发图+视频'],
  },
  TWITTER: {
    platform: 'TWITTER',
    label: 'Twitter / X',
    maxLength: 280,
    imageMax: 4,
    videoMax: 1,
    minDurationSec: 0,
    hints: ['单帖280字符', '最多4张图或1条视频', '线程模式可用@split适配'],
  },
  YOUTUBE: {
    platform: 'YOUTUBE',
    label: 'YouTube',
    maxLength: 5000,
    imageMax: 0,
    videoMax: 1,
    minDurationSec: 0,
    hints: ['标题≤100字、描述≤5000字', 'Shorts竖屏≤60s', '需选择公开/不公开/私享'],
  },
};

/** Stable display order mirroring the PRD platform matrix. */
export const PLATFORM_ORDER: string[] = [
  'WECHAT_OFFICIAL',
  'WECHAT_VIDEO',
  'DOUYIN',
  'XIAOHONGSHU',
  'BILIBILI',
  'WEIBO',
  'TWITTER',
  'YOUTUBE',
];

export function getRule(platform: string): PlatformRule | undefined {
  return PLATFORM_RULES[platform];
}

export function listRules(): PlatformRule[] {
  return PLATFORM_ORDER.map((p) => PLATFORM_RULES[p]).filter(Boolean);
}
