import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

export class SchedulePublishDto {
  @ApiProperty({ description: 'Content id to publish' })
  @IsString()
  @MinLength(1)
  contentId: string;

  @ApiProperty({ description: 'Target platform', enum: Platform })
  @IsString()
  platform: Platform;

  @ApiPropertyOptional({ description: 'ISO 8601 time to publish at (omit for ASAP)' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
