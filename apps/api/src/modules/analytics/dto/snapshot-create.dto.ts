import { IsInt, IsOptional, IsDateString } from 'class-validator';

/**
 * 手动快照创建 DTO
 */
export class SnapshotCreateDto {
  @IsOptional()
  @IsDateString()
  snapshotDate?: string;

  @IsOptional()
  @IsInt()
  followerCount?: number;

  @IsOptional()
  @IsInt()
  followingCount?: number;

  @IsOptional()
  @IsInt()
  postCount?: number;

  @IsOptional()
  @IsInt()
  impressions?: number;

  @IsOptional()
  @IsInt()
  engagements?: number;

  @IsOptional()
  @IsInt()
  likes?: number;

  @IsOptional()
  @IsInt()
  comments?: number;

  @IsOptional()
  @IsInt()
  shares?: number;

  @IsOptional()
  @IsInt()
  views?: number;
}
