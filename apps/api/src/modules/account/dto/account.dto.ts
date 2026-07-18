import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Team that owns this account' })
  @IsString()
  @MinLength(1)
  teamId: string;

  @ApiProperty({ description: 'Platform the account belongs to', enum: Platform })
  @IsString()
  platform: Platform;

  @ApiProperty({ description: 'External id of the account on the platform' })
  @IsString()
  @MinLength(1)
  accountId: string;

  @ApiProperty({ description: 'Human-friendly account name', example: 'Brand Official' })
  @IsString()
  accountName: string;

  @ApiPropertyOptional({ description: '@handle of the account, when applicable' })
  @IsOptional()
  @IsString()
  accountHandle?: string;

  // ========== 微信公众号 / 视频号 ==========
  @ApiPropertyOptional({ description: '[WeChat] App ID' })
  @IsOptional()
  @IsString()
  appid?: string;

  @ApiPropertyOptional({ description: '[WeChat] App secret' })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiPropertyOptional({ description: '[WeChat] rawId / authorizer id' })
  @IsOptional()
  @IsString()
  rawId?: string;

  // ========== 抖音 ==========
  @ApiPropertyOptional({ description: '[Douyin] Client key' })
  @IsOptional()
  @IsString()
  clientKey?: string;

  @ApiPropertyOptional({ description: '[Douyin] Client secret' })
  @IsOptional()
  @IsString()
  clientSecret?: string;

  // ========== 小红书 / 微博 ==========
  @ApiPropertyOptional({ description: '[Xiaohongshu / Weibo] App key' })
  @IsOptional()
  @IsString()
  appKey?: string;

  @ApiPropertyOptional({ description: '[Xiaohongshu / Weibo] App secret' })
  @IsOptional()
  @IsString()
  appSecret?: string;

  // ========== B站 ==========
  @ApiPropertyOptional({ description: '[Bilibili] Access key' })
  @IsOptional()
  @IsString()
  accessKey?: string;

  // ========== Twitter/X ==========
  @ApiPropertyOptional({ description: '[Twitter] Bearer token' })
  @IsOptional()
  @IsString()
  bearerToken?: string;

  @ApiPropertyOptional({ description: '[Twitter] API key' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ description: '[Twitter] API secret' })
  @IsOptional()
  @IsString()
  apiSecret?: string;

  // ========== YouTube ==========
  @ApiPropertyOptional({ description: '[YouTube] OAuth client id' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: '[YouTube] OAuth client secret' })
  @IsOptional()
  @IsString()
  clientSecretYouTube?: string;

  @ApiPropertyOptional({ description: '[YouTube] Channel id' })
  @IsOptional()
  @IsString()
  channelId?: string;

  // ========== 通用 ==========
  @ApiPropertyOptional({ description: 'Optional OAuth callback URL override' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  // 原始凭证对象（如果前端直接传入结构化 JSON）
  @ApiPropertyOptional({ description: 'Structured credential object fallback (JSON)' })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;
}

export class ListAccountsQuery {
  @ApiPropertyOptional({ description: 'Filter by team id' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
