import { ApiPropertyOptional } from '@nestjs/swagger';
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

/**
 * Shared base: every assistant request operates on a draft body + content
 * type, optionally scoped to one or more platforms. Keeping the shape in one
 * place means the four endpoints can't drift apart.
 */
export class AssistantDraftDto {
  @ApiPropertyOptional({ description: 'Draft body copy', maxLength: 60000 })
  @IsOptional()
  @IsString()
  @MaxLength(60000)
  body?: string;

  @ApiPropertyOptional({ description: 'Content type', enum: ContentType })
  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @ApiPropertyOptional({ description: 'Draft title', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Attached image URLs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ description: 'Attached video URLs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];

  @ApiPropertyOptional({ description: 'Primary video length (seconds)', maximum: 300 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  videoDurationSec?: number;

  /** Restrict the analysis to a subset of platforms (defaults to all). */
  @ApiPropertyOptional({ description: 'Subset of platforms to analyze', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];
}

/** Generate engagement-optimized title variants from a draft. */
export class TitleOptimizeDto extends AssistantDraftDto {
  @ApiPropertyOptional({ description: 'How many titles to generate', default: 3, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  count?: number;
}

/** Extract keyword tags from a draft body. */
export class TagExtractDto extends AssistantDraftDto {
  @ApiPropertyOptional({ description: 'How many tags to extract', default: 5, maximum: 20 })
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
  @ApiPropertyOptional({ description: 'Variant style', enum: ['short', 'long', 'formal', 'social', 'all'], default: 'all' })
  @IsOptional()
  @IsString()
  @IsEnum(['short', 'long', 'formal', 'social', 'all'])
  style?: 'short' | 'long' | 'formal' | 'social' | 'all';
}
