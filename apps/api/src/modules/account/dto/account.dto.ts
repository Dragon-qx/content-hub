import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

export class BindAccountDto {
  @IsString()
  @MinLength(1)
  teamId: string;

  @IsString()
  platform: Platform;

  @IsString()
  @MinLength(1)
  accountId: string;

  @IsString()
  accountName: string;

  @IsOptional()
  @IsString()
  accountHandle?: string;

  // ========== 微信公众号 / 视频号 ==========
  @IsOptional()
  @IsString()
  appid?: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsString()
  rawId?: string;

  // ========== 抖音 ==========
  @IsOptional()
  @IsString()
  clientKey?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  // ========== 小红书 / 微博 ==========
  @IsOptional()
  @IsString()
  appKey?: string;

  @IsOptional()
  @IsString()
  appSecret?: string;

  // ========== B站 ==========
  @IsOptional()
  @IsString()
  accessKey?: string;

  // ========== Twitter/X ==========
  @IsOptional()
  @IsString()
  bearerToken?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  // ========== YouTube ==========
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecretYouTube?: string;

  @IsOptional()
  @IsString()
  channelId?: string;

  // ========== 通用 ==========
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  // 原始凭证对象（如果前端直接传入结构化 JSON）
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;
}

export class ListAccountsQuery {
  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
