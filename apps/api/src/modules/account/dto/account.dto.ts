import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

export class BindAccountDto {
  @IsString()
  @MinLength(1)
  teamId: string;

  @IsString()
  platform: Platform;

  @IsString()
  @MinLength(1)
  accountId: string;

  @IsString()
  accountName: string;

  @IsOptional()
  @IsString()
  accountHandle?: string;

  @IsObject()
  credentials: Record<string, unknown>;
}

export class ListAccountsQuery {
  @IsOptional()
  @IsString()
  teamId?: string;
}
