import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsDateString } from 'class-validator';

/**
 * 手动快照创建 DTO
 */
export class SnapshotCreateDto {
  @ApiPropertyOptional({ description: 'Snapshot date (ISO 8601, defaults to today)' })
  @IsOptional()
  @IsDateString()
  snapshotDate?: string;

  @ApiPropertyOptional({ description: 'Follower count' })
  @IsOptional()
  @IsInt()
  followerCount?: number;

  @ApiPropertyOptional({ description: 'Following count' })
  @IsOptional()
  @IsInt()
  followingCount?: number;

  @ApiPropertyOptional({ description: 'Post count' })
  @IsOptional()
  @IsInt()
  postCount?: number;

  @ApiPropertyOptional({ description: 'Impressions' })
  @IsOptional()
  @IsInt()
  impressions?: number;

  @ApiPropertyOptional({ description: 'Engagements' })
  @IsOptional()
  @IsInt()
  engagements?: number;

  @ApiPropertyOptional({ description: 'Likes' })
  @IsOptional()
  @IsInt()
  likes?: number;

  @ApiPropertyOptional({ description: 'Comments' })
  @IsOptional()
  @IsInt()
  comments?: number;

  @ApiPropertyOptional({ description: 'Shares' })
  @IsOptional()
  @IsInt()
  shares?: number;

  @ApiPropertyOptional({ description: 'Views' })
  @IsOptional()
  @IsInt()
  views?: number;
}
