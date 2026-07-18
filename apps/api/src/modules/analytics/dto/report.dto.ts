import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Fields that can be dragged onto a report canvas (PRD §3.5). */
export const REPORT_FIELD_IDS = [
  // Account metrics
  'followerCount',
  'followingCount',
  'postCount',
  // Content metrics
  'impressions',
  'engagements',
  'likes',
  'comments',
  'shares',
  'views',
  // Computed
  'engagementRate',
  // Time
  'snapshotDate',
  'publishedAt',
  // Dimensions
  'platform',
  'accountName',
  'contentTitle',
] as const;

export type ReportFieldId = (typeof REPORT_FIELD_IDS)[number];

/** Allowed filter operators. */
export const REPORT_FILTER_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
export type ReportFilterOperator = (typeof REPORT_FILTER_OPERATORS)[number];

/** Allowed sort directions. */
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const METRIC_FILTER_KEYS = [
  'followerCount',
  'followingCount',
  'postCount',
  'impressions',
  'engagements',
  'likes',
  'comments',
  'shares',
  'views',
  'engagementRate',
] as const;

export const DIMENSION_FILTER_KEYS = ['platform'] as const;

/**
 * Single filter condition for a custom report.
 */
export class ReportFilterDto {
  @ApiProperty({ description: 'Field to filter on', example: 'platform' })
  @IsString()
  @MinLength(1)
  field!: string;

  @ApiProperty({ description: 'Comparison operator', enum: REPORT_FILTER_OPERATORS, default: 'eq' })
  @IsOptional()
  @IsIn(REPORT_FILTER_OPERATORS)
  operator?: ReportFilterOperator = 'eq';

  @ApiProperty({ description: 'Filter value (string, number, or string[] when operator=in)' })
  value!: string | number | string[];
}

/**
 * Generate or save a custom report (PRD §3.5).
 */
export class ReportConfigDto {
  @ApiProperty({ description: 'Report name (optional for one-off generation)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Report description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Selected field ids in display order',
    enum: REPORT_FIELD_IDS,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  fieldIds!: ReportFieldId[];

  @ApiPropertyOptional({
    description: 'Optional filters to apply',
    type: [ReportFilterDto],
  })
  @IsOptional()
  @IsArray()
  filters?: ReportFilterDto[];

  @ApiPropertyOptional({
    description: 'Field to group by',
    enum: REPORT_FIELD_IDS,
  })
  @IsOptional()
  @IsIn(REPORT_FIELD_IDS)
  groupBy?: string;

  @ApiPropertyOptional({
    description: 'Field to sort by (defaults to first selected field)',
    enum: REPORT_FIELD_IDS,
  })
  @IsOptional()
  @IsIn(REPORT_FIELD_IDS)
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SORT_DIRECTIONS,
    default: 'desc',
  })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDir?: SortDirection = 'desc';

  @ApiPropertyOptional({
    description: 'Number of rows to return',
    default: 100,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @IsInt()
  limit?: number = 100;
}
