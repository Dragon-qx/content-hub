import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

/**
 * A single pre-parsed record, produced client-side (or by the batch import
 * service) before validation. Mirrors `BindAccountDto` minus `teamId`, which is
 * supplied once at the batch level.
 */
export class AccountImportRecord {
  @ApiProperty({ enum: Platform, description: 'Platform the account belongs to' })
  @IsString()
  @MinLength(1)
  platform: Platform;

  @ApiProperty({ description: 'External id of the account on the platform' })
  @IsString()
  @MinLength(1)
  accountId: string;

  @ApiProperty({ description: 'Human-friendly account name' })
  @IsString()
  @MinLength(1)
  accountName: string;

  @ApiPropertyOptional({ description: '@handle of the account' })
  @IsOptional()
  @IsString()
  accountHandle?: string;

  @ApiPropertyOptional({
    description: 'Structured credential object — per-platform keys (appid, secret, clientKey, …)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;
}

/**
 * Body DTO for the JSON batch import endpoint (`POST /accounts/import/json`).
 * The team is supplied once; every record is bound under it.
 */
export class ImportAccountsDto {
  @ApiProperty({ description: 'Team that owns the imported accounts' })
  @IsString()
  @MinLength(1)
  teamId: string;

  @ApiProperty({
    description: 'Rows to import — at least one, at most 200 per batch',
    type: [AccountImportRecord],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  records: AccountImportRecord[];
}

/** Query-param DTO for the CSV upload endpoint (`POST /accounts/import`). */
export class ImportAccountsQueryDto {
  @ApiProperty({ description: 'Team that owns the imported accounts' })
  @IsString()
  @MinLength(1)
  teamId: string;

  @ApiPropertyOptional({
    description: 'Skip the header row (default true)',
    default: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  skipHeader?: number;
}
