import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ContentType } from '@prisma/client';

/** A single variable definition on a template. */
export class TemplateVariableDto {
  @ApiProperty({ description: 'Variable key (used in placeholders)', example: 'productName' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key: string;

  @ApiProperty({ description: 'Human-readable label', example: 'Product Name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @ApiProperty({ description: 'Variable type', enum: ['text', 'number', 'date'], default: 'text' })
  @IsOptional()
  @IsIn(['text', 'number', 'date'])
  type?: 'text' | 'number' | 'date';

  @ApiPropertyOptional({ description: 'Default value when not provided', example: 'Untitled' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  defaultValue?: string;

  @ApiPropertyOptional({ description: 'Whether this variable is required', default: false })
  @IsOptional()
  required?: boolean;
}

/** Create a reusable content template scoped to the caller's team. */
export class CreateContentTemplateDto {
  @ApiProperty({ description: 'Template title', maxLength: 200, example: 'Weekly post' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Template body copy (Markdown)' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Content type', enum: ContentType })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiPropertyOptional({ description: 'Owning team id (defaults to caller team)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  teamId?: string;

  @ApiPropertyOptional({ description: 'Tag labels', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Variable definitions for placeholders', type: [TemplateVariableDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  variables?: TemplateVariableDto[];
}

/** Patch fields of an existing template. All fields optional. */
export class UpdateContentTemplateDto {
  @ApiPropertyOptional({ description: 'Updated title', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated body copy' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Updated content type', enum: ContentType })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiPropertyOptional({ description: 'Updated tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Updated variable definitions', type: [TemplateVariableDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  variables?: TemplateVariableDto[];
}

/** Query params for listing templates (team-scoped, paginated, searchable). */
export class ListTemplatesQueryDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiPropertyOptional({ description: 'Filter by team id' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Title/body search term' })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Apply a template to seed a new draft. Returns the input shape for
 * `ContentService.create` so the caller can persist or further edit it.
 */
export class ApplyTemplateDto {
  @ApiProperty({ description: 'Owning team id for the seeded draft' })
  @IsString()
  @MinLength(1)
  teamId: string;

  @ApiPropertyOptional({ description: 'Override the seeded title' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ description: 'Variable values keyed by variable `key`' })
  @IsOptional()
  values?: Record<string, string>;
}

/**
 * Resolve placeholders in a template's body and title. Returns the resolved
 * title and body strings so the frontend can preview the result.
 */
export class ResolveTemplateDto {
  @ApiPropertyOptional({ description: 'Variable values keyed by variable `key`' })
  @IsOptional()
  values?: Record<string, string>;
}
