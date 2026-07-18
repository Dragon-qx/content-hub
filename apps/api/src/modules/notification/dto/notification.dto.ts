import { Prisma } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Recipient user id' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ description: 'Severity', enum: ['info', 'success', 'warning', 'error'], default: 'info' })
  @IsOptional()
  @IsEnum(['info', 'success', 'warning', 'error'])
  type?: 'info' | 'success' | 'warning' = 'info';

  @ApiPropertyOptional({ description: 'Delivery channel', enum: ['in_app', 'email', 'webhook'], default: 'in_app' })
  @IsOptional()
  @IsEnum(['in_app', 'email', 'webhook'])
  channel?: 'in_app' | 'email' | 'webhook' = 'in_app';

  @ApiProperty({ description: 'Notification title', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Notification body', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({ description: 'Deep-link URL' })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON metadata' })
  @IsOptional()
  @IsJSON()
  metadata?: Prisma.InputJsonValue;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number = 20;

  @ApiPropertyOptional({ description: 'Only unread notifications' })
  @IsOptional()
  @IsBooleanString()
  unreadOnly?: boolean;
}
