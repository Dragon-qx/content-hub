import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { ContentType, ContentStatus } from '@prisma/client';

export class CreateContentDto {
  @ApiProperty({ description: 'Content title', example: 'Spring campaign launch' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({ description: 'Raw body copy (Markdown supported)' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Type of content', enum: ContentType, default: 'TEXT' })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiProperty({ description: 'Owning team id' })
  @IsString()
  @MinLength(1)
  teamId: string;

  @ApiPropertyOptional({ description: 'Tag labels', type: [String], example: ['news', 'launch'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateContentDto {
  @ApiPropertyOptional({ description: 'Updated title' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated body copy' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Updated content type', enum: ContentType })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiPropertyOptional({ description: 'Status override (service rules usually govern this)', enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({ description: 'Schedule publish time (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;

  @ApiPropertyOptional({ description: 'Manual published-at timestamp (ISO 8601)' })
  @IsOptional()
  @Type(() => Date)
  publishedAt?: Date;
}

export class CreateContentVersionDto {
  @ApiPropertyOptional({ description: 'Title for the new version snapshot' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ description: 'Body for the new version snapshot' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Content type for the snapshot', enum: ContentType })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiPropertyOptional({ description: 'Why this version was created', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

/**
 * Body for POST /contents/:id/rollback. Restores a prior version's field values
 * onto the live content and records the restore as a new version snapshot.
 */
export class RollbackVersionDto {
  @ApiProperty({ description: 'Version number to restore (1-based)', minimum: 1, example: 3 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  version: number;

  @ApiPropertyOptional({ description: 'Optional note for the audit trail', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

/** Body for POST /contents/:id/submit — optional override of the approver. */
export class SubmitContentDto {
  @ApiPropertyOptional({ description: 'User id of the approver to assign' })
  @IsOptional()
  @IsString()
  approverId?: string;
}

/** Body for POST /contents/:id/approve. */
export class ApproveContentDto {
  @ApiPropertyOptional({ description: 'Approver user id (defaults to caller)' })
  @IsOptional()
  @IsString()
  approverId?: string;

  @ApiPropertyOptional({ description: 'Approval comment', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** Body for POST /contents/:id/reject. */
export class RejectContentDto {
  @ApiPropertyOptional({ description: 'Approver user id (defaults to caller)' })
  @IsOptional()
  @IsString()
  approverId?: string;

  @ApiPropertyOptional({ description: 'Reason for rejection', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/**
 * Query the content calendar for a given month. Returns every day in the
 * month with its scheduled content + publish jobs, so the UI can render a
 * month grid without a second round-trip.
 */
export class CalendarQueryDto {
  @ApiProperty({ description: 'Year (2000-2100)', example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year: number;

  @ApiProperty({ description: 'Month (1-12)', example: 7 })
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month: number;
}

export class ListContentQueryDto {
  @ApiPropertyOptional({ description: 'Records to skip', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ description: 'Max records', default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by status', enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({ description: 'Filter by team id' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Title/body search term' })
  @IsOptional()
  @IsString()
  search?: string;
}
