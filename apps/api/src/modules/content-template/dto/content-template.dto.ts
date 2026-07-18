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

/** Create a reusable content template scoped to the caller's team. */
export class CreateContentTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  teamId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** Patch fields of an existing template. All fields optional. */
export class UpdateContentTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** Query params for listing templates (team-scoped, paginated, searchable). */
export class ListTemplatesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Apply a template to seed a new draft. Returns the input shape for
 * `ContentService.create` so the caller can persist or further edit it.
 */
export class ApplyTemplateDto {
  @IsString()
  @MinLength(1)
  teamId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}
