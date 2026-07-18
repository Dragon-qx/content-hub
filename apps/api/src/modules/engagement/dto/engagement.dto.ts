import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Platform, Sentiment } from '@prisma/client';

/** Query filters for GET /engagement/comments. */
export class ListCommentsQueryDto {
  @ApiPropertyOptional({ description: 'Override the acting team id' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Filter by platform', enum: Platform })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({ description: 'Filter by sentiment', enum: Sentiment })
  @IsOptional()
  @IsEnum(Sentiment)
  sentiment?: Sentiment;

  @ApiPropertyOptional({ description: 'Only comments with no reply yet' })
  @IsOptional()
  @Type(() => Boolean)
  unreplied?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  skip?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  take?: number = 20;
}

/** Which account to ingest comments for. */
export class IngestCommentsDto {
  @ApiProperty({ description: 'Social account id to pull comments for' })
  @IsString()
  @MinLength(1)
  accountId: string;

  @ApiPropertyOptional({ description: 'Optional post external id to scope the ingest', maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  postExternalId?: string;
}

/** Reply to a single comment. */
export class ReplyCommentDto {
  @ApiProperty({ description: 'Reply text', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

/** Create a quick-reply template. */
export class CreateTemplateDto {
  @ApiProperty({ description: 'Template label', maxLength: 80, example: 'Thanks!' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title: string;

  @ApiProperty({ description: 'Template body', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

/** Add a watch keyword for sentiment alerts. */
export class CreateKeywordDto {
  @ApiProperty({ description: 'Keyword to watch for', maxLength: 100, example: 'refund' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  keyword: string;
}

/** Manually trigger a comment sync for the acting team. */
export class SyncTeamDto {
  @ApiPropertyOptional({ description: 'Team id (defaults to the callers first team)' })
  @IsOptional()
  @IsString()
  teamId?: string;
}

/** Query filters for GET /engagement/messages. */
export class ListMessagesQueryDto {
  @ApiPropertyOptional({ description: 'Override the acting team id' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Filter by platform', enum: Platform })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({ description: 'Filter by conversation id' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Only messages sent by the team accounts' })
  @IsOptional()
  @Type(() => Boolean)
  sentByMe?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  skip?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  take?: number = 20;
}

/** Ingest messages for a single social account. */
export class IngestMessagesDto {
  @ApiProperty({ description: 'Social account id to pull messages for' })
  @IsString()
  @MinLength(1)
  accountId: string;
}
