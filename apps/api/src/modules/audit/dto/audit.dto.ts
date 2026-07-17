import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsJSON,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAuditDto {
  @IsString()
  @MaxLength(200)
  action: string;

  @IsString()
  userId: string;

  @IsString()
  @MaxLength(100)
  resourceType: string;

  @IsString()
  resourceId: string;

  @IsOptional()
  @IsJSON()
  details?: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;
}

export class ListAuditQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  skip?: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  take?: number = 20;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  /** Lower bound (inclusive) of thecreatedAt timestamp, ISO 8601. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Upper bound (inclusive) of the createdAt timestamp, ISO 8601. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Free-text search matched against the acting user's name or email. */
  @IsOptional()
  @IsString()
  operator?: string;
}
