import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsJSON,
  IsObject,
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
}
