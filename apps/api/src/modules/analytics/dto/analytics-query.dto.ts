import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsString()
  metric: string;

  @IsString()
  period: string;
}

/**
 * 热门内容查询 DTO
 */
export class TopContentQueryDto {
  @IsOptional()
  @IsString()
  sortBy?: string = 'impressions';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
