import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TopUpWalletDto {
  @ApiProperty({ description: 'Amount (minor units) to add — must be positive', example: 1000 })
  @IsInt()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: 'Optional note', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ListTransactionsQuery {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class DebitWalletDto {
  @ApiProperty({
    description: 'Operation type being charged',
    enum: ['TOPUP', 'REFUND', 'PUBLISH', 'SCHEDULE', 'SYNC', 'MEDIA_PROCESS', 'AI_ASSIST'],
  })
  @IsString()
  @MinLength(1)
  type: string;

  @ApiPropertyOptional({ description: 'Optional reference id (content / job)' })
  @IsOptional()
  @IsString()
  refId?: string;

  @ApiPropertyOptional({ description: 'Optional note' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
