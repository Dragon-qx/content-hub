import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Query params for `GET /scheduler/recommendations`. */
export class RecommendQueryDto {
  @ApiPropertyOptional({
    description: 'Team id scopes the history analysed (defaults to the caller\'s single team when omitted)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  teamId?: string;

  @ApiPropertyOptional({
    description: 'Restrict analysis to a single account (must belong to the team)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  accountId?: string;

  @ApiPropertyOptional({ description: 'How many slots to recommend (1-10)', default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  slots?: number;

  @ApiPropertyOptional({ description: 'Planning horizon in days (1-30)', default: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  horizonDays?: number;
}
