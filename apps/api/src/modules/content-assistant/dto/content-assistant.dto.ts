import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ContentType } from '@prisma/client';

/** Accepted analysis targets — analyzing a platform blank is meaningless. */
const PLATFORMS = [
  'WECHAT_OFFICIAL',
  'WECHAT_VIDEO',
  'DOUYIN',
  'XIAOHONGSHU',
  'BILIBILI',
  'WEIBO',
  'TWITTER',
  'YOUTUBE',
] as const;

/**
 * Shared base: every assistant request operates on a draft body + content
 * type, optionally scoped to one or more platforms. Keeping the shape in one
 * place means the four endpoints can't drift apart.
 */
export class AssistantDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(60000)
  body?: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  videoDurationSec?: number;

  /** Restrict the analysis to a subset of platforms (defaults to all). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];
}

/** Generate engagement-optimized title variants from a draft. */
export class TitleOptimizeDto extends AssistantDraftDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  count?: number;
}

/** Extract keyword tags from a draft body. */
export class TagExtractDto extends AssistantDraftDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  count?: number;
}

/** Audit a draft against platform rules + cross-cutting quality heuristics. */
export class ContentAuditDto extends AssistantDraftDto {}

/** Produce platform-aware copy variants (short/long/formal/social). */
export class VariantGenerateDto extends AssistantDraftDto {
  @IsOptional()
  @IsString()
  @IsEnum(['short', 'long', 'formal', 'social', 'all'])
  style?: 'short' | 'long' | 'formal' | 'social' | 'all';
}
