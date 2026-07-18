import { Prisma } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsJSON,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAuditDto {
  @ApiProperty({ description: 'Action verb', example: 'CREATE', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  action: string;

  @ApiProperty({ description: 'Acting user id' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Resource type', example: 'Content', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  resourceType: string;

  @ApiProperty({ description: 'Resource id' })
  @IsString()
  resourceId: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON metadata' })
  @IsOptional()
  @IsJSON()
  details?: Prisma.InputJsonValue;

  @ApiPropertyOptional({ description: 'Client IP address', maxLength: 45 })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;
}

export class ListAuditQueryDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  skip?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  take?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by acting user id' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by action verb' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by resource type' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Filter by resource id' })
  @IsOptional()
  @IsString()
  resourceId?: string;

  /** Lower bound (inclusive) of thecreatedAt timestamp, ISO 8601. */
  @ApiPropertyOptional({ description: 'Lower bound (inclusive) ISO 8601' })
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Upper bound (inclusive) of the createdAt timestamp, ISO 8601. */
  @ApiPropertyOptional({ description: 'Upper bound (inclusive) ISO 8601' })
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Free-text search matched against the acting user's name or email. */
  @ApiPropertyOptional({ description: 'Free-text search on operator name/email' })
  @IsOptional()
  @IsString()
  operator?: string;
}
