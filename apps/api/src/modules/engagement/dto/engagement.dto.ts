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
  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsEnum(Sentiment)
  sentiment?: Sentiment;

  @IsOptional()
  @Type(() => Boolean)
  unreplied?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  skip?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  take?: number = 20;
}

/** Which account to ingest comments for. */
export class IngestCommentsDto {
  @IsString()
  @MinLength(1)
  accountId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  postExternalId?: string;
}

/** Reply to a single comment. */
export class ReplyCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

/** Create a quick-reply template. */
export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

/** Add a watch keyword for sentiment alerts. */
export class CreateKeywordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  keyword: string;
}

/** Manually trigger a comment sync for the acting team. */
export class SyncTeamDto {
  @IsOptional()
  @IsString()
  teamId?: string;
}
