import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class InitiateTransferDto {
  @ApiProperty({ description: 'Destination team id that will receive the account' })
  @IsString()
  @MinLength(1)
  toTeamId: string;

  @ApiPropertyOptional({ description: 'Optional note for the destination team', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DecideTransferDto {
  @ApiProperty({ description: 'Approve or reject the handover', enum: ['accept', 'reject'] })
  @IsIn(['accept', 'reject'] as const)
  decision: 'accept' | 'reject';
}

export class ListTransfersQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by the caller-participating direction',
    enum: ['incoming', 'outgoing', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['incoming', 'outgoing', 'all'] as const)
  direction?: 'incoming' | 'outgoing' | 'all';

  @ApiPropertyOptional({
    description: 'Filter by transfer status',
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const)
  status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
}
