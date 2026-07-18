import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

export class PublishContentDto {
  @ApiProperty({ description: 'Content id to publish' })
  @IsString()
  @MinLength(1)
  contentId: string;

  @ApiProperty({ description: 'Target platform', enum: Platform })
  @IsString()
  platform: Platform;

  @ApiPropertyOptional({ description: 'Adapter-specific payload overrides', type: 'object' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Optional publish-at override (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;
}

export class ValidateCredentialsDto {
  @ApiProperty({ description: 'Platform to validate against', enum: Platform })
  @IsString()
  platform: Platform;

  @ApiProperty({ description: 'Credentials object to validate', type: 'object' })
  @IsObject()
  credentials: Record<string, unknown>;
}

/** Query for GET /platform-sdk/comments — fetch an account's recent comments. */
export class FetchCommentsQueryDto {
  @ApiProperty({ description: 'Social account id to fetch comments for' })
  @IsString()
  @MinLength(1)
  accountId: string;

  @ApiProperty({ description: 'Platform', enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiPropertyOptional({ description: 'Optional post external id to scope the fetch' })
  @IsOptional()
  @IsString()
  postExternalId?: string;
}

/** Body for POST /platform-sdk/comments/reply — reply to a single comment. */
export class ReplyCommentDto {
  @ApiProperty({ description: 'Social account id that owns the comment' })
  @IsString()
  @MinLength(1)
  accountId: string;

  @ApiProperty({ description: 'Platform', enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({ description: 'Comment id to reply to' })
  @IsString()
  @MinLength(1)
  commentId: string;

  @ApiProperty({ description: 'Reply text', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

/** Body for POST /platform-sdk/messages/reply — reply to a private message. */
export class ReplyMessageDto {
  @ApiProperty({ description: 'Social account id that received the message' })
  @IsString()
  @MinLength(1)
  accountId: string;

  @ApiProperty({ description: 'Platform', enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({ description: 'Message id to reply to' })
  @IsString()
  @MinLength(1)
  messageId: string;

  @ApiProperty({ description: 'Reply text', maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

/** Query for GET /platform-sdk/messages — fetch an account's private messages. */
export class FetchMessagesQueryDto {
  @ApiProperty({ description: 'Social account id to fetch messages for' })
  @IsString()
  @MinLength(1)
  accountId: string;

  @ApiProperty({ description: 'Platform', enum: Platform })
  @IsEnum(Platform)
  platform: Platform;
}
