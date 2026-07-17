import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

export class SchedulePublishDto {
  @IsString()
  @MinLength(1)
  contentId: string;

  @IsString()
  platform: Platform;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
