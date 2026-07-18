import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsInt, Min, Max, IsOptional } from 'class-validator';

/** Path param DTO for targeting a single account. */
export class AccountIdParam {
  @ApiProperty({ description: 'Account id to evaluate' })
  @IsString()
  @MinLength(1)
  id: string;
}

/** Path param DTO for targeting a team. */
export class TeamIdParam {
  @ApiProperty({ description: 'Team id to evaluate' })
  @IsString()
  @MinLength(1)
  teamId: string;
}

/**
 * Partial threshold config override for `PATCH /threshold-config`. Both
 * fields optional; when supplied they override the process-env defaults for
 * the duration of the worker's lifecycle (in-memory override, per-team
 * persistence deferred to future persistence layer).
 */
export class ThresholdConfigDto {
  @ApiPropertyOptional({ description: 'Critical level (score < this → CRITICAL)', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  critical?: number;

  @ApiPropertyOptional({ description: 'Warning level (score < this → WARNING)', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  warning?: number;
}
