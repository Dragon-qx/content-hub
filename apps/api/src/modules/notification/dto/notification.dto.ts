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

  @ApiProperty({ description: 'Notification title', maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  title: string;

  @ApiProperty({ description: 'Notification body', maxLength: 4096 })
  @IsString()
  @MaxLength(4096)
  body: string;

  @ApiPropertyOptional({ description: 'Deep-link URL' })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({ description: 'Email recipient override (defaults to user.email)' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Webhook URL override (defaults to WEBHOOK_URL env)' })
  @IsOptional()
  @IsString()
  webhookUrl?: string;

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
