import { IsInt, IsOptional, IsString, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { AnalyticsMetric } from '../analytics.service';

/**
 * 时间范围查询 DTO
 */
export class AnalyticsQueryDto {
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
  @IsIn([
    'followerCount',
    'followingCount',
    'postCount',
    'impressions',
    'engagements',
    'likes',
    'comments',
    'shares',
    'views',
  ])
  metric: AnalyticsMetric;

  @IsString()
  period: string;
}

/**
 * 热门内容查询 DTO
 */
export class TopContentQueryDto {
  @IsOptional()
  @IsIn([
    'followerCount',
    'followingCount',
    'postCount',
    'impressions',
    'engagements',
    'likes',
    'comments',
    'shares',
    'views',
  ])
  sortBy?: AnalyticsMetric = 'impressions';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
