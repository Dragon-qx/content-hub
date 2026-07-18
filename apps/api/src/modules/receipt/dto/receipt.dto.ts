import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

export class GenerateReceiptDto {
  @ApiProperty({ description: 'Content id that was published' })
  @IsString()
  @MinLength(1)
  contentId: string;

  @ApiProperty({ description: 'Target platform', enum: Platform })
  @IsEnum(Platform)
  platform: Platform;

  @ApiPropertyOptional({ description: 'External id assigned by the platform' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;

  @ApiPropertyOptional({ description: 'External URL of the published post' })
  @IsOptional()
  @IsString()
  externalUrl?: string;

  @ApiPropertyOptional({ description: 'Owning PlatformPost id (when known)' })
  @IsOptional()
  @IsString()
  platformPostId?: string;

  @ApiPropertyOptional({ description: 'Social account that performed the publish' })
  @IsOptional()
  @IsString()
  accountId?: string;
}

export class ListReceiptsQueryDto {
  @ApiProperty({ description: 'Content id to filter receipts by' })
  @IsString()
  @MinLength(1)
  contentId: string;
}
