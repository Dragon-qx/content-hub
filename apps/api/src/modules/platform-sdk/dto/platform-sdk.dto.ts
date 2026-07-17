import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

export class PublishContentDto {
  @IsString()
  @MinLength(1)
  contentId: string;

  @IsString()
  platform: Platform;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;
}

export class ValidateCredentialsDto {
  @IsString()
  platform: Platform;

  @IsObject()
  credentials: Record<string, unknown>;
}
