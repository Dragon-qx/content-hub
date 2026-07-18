import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { AnalyticsMetric, TopContentView } from '../analytics.service';

const METRICS_EXAMPLE = [
  'followerCount',
  'followingCount',
  'postCount',
  'impressions',
  'engagements',
  'likes',
  'comments',
  'shares',
  'views',
];

/**
 * 时间范围查询 DTO
 */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to aggregate', default: 30, example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;
}

/**
 * 历史趋势查询 DTO
 */
export class HistoryQueryDto {
  @ApiProperty({ description: 'Metric to chart', enum: METRICS_EXAMPLE })
  @IsIn(METRICS_EXAMPLE)
  metric: AnalyticsMetric;

  @ApiProperty({ description: 'Time period bucket', example: 'daily' })
  @IsString()
  period: string;
}

/**
 * 内容排行榜查询 DTO（Top / Bottom 自动标记）
 */
export class TopContentQueryDto {
  @ApiPropertyOptional({ description: 'Metric to rank by', enum: METRICS_EXAMPLE, default: 'impressions' })
  @IsOptional()
  @IsIn(METRICS_EXAMPLE)
  sortBy?: AnalyticsMetric = 'impressions';

  @ApiPropertyOptional({ description: 'How many items to return', default: 10, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  /** Which end of the ranking to surface: 'top' (default) or 'bottom'. */
  @ApiPropertyOptional({ description: 'top performers or bottom performers', enum: ['top', 'bottom'], default: 'top' })
  @IsOptional()
  @IsIn(['top', 'bottom'])
  view?: TopContentView = 'top';
}
