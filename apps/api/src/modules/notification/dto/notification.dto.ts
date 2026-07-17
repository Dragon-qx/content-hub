import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsInt,
  IsJSON,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsEnum(['info', 'success', 'warning', 'error'])
  type?: 'info' | 'success' | 'warning' = 'info';

  @IsOptional()
  @IsEnum(['in_app', 'email', 'webhook'])
  channel?: 'in_app' | 'email' | 'webhook' = 'in_app';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsJSON()
  metadata?: Prisma.InputJsonValue;
}

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number = 20;

  @IsOptional()
  @IsBooleanString()
  unreadOnly?: boolean;
}
