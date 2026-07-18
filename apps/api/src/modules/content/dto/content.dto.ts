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
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsString()
  @MinLength(1)
  teamId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateContentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;

  @IsOptional()
  @Type(() => Date)
  publishedAt?: Date;
}

export class CreateContentVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

/** Body for POST /contents/:id/submit — optional override of the approver. */
export class SubmitContentDto {
  @IsOptional()
  @IsString()
  approverId?: string;
}

/** Body for POST /contents/:id/approve. */
export class ApproveContentDto {
  @IsOptional()
  @IsString()
  approverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** Body for POST /contents/:id/reject. */
export class RejectContentDto {
  @IsOptional()
  @IsString()
  approverId?: string;

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
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month: number;
}

export class ListContentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number = 20;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
