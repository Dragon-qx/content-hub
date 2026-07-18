import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO for listing /anomaly-alerts (admin/audit surface).
 */
export class AnomalyAlertsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by team id' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Filter by account id' })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Max records', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number = 50;
}

/**
 * Response shape for a single detected anomaly (mirrors Anomaly in the
 * detector, expressed as plain DTO fields for Swagger/docs).
 */
export interface AnomalyResponse {
  type: string;
  metric: string;
  severity: 'critical' | 'warning';
  message: string;
  currentValue: number;
  baselineValue: number;
  changePercent: number;
  date: string;
}

/** Response for an on-demand scan. */
export interface ScanAnomalyResponse {
  accountId: string;
  anomalies: AnomalyResponse[];
  notified: boolean;
}

/**
 * On-demand scan request: omit `accountId` to scan every active account.
 */
export class ScanAnomalyDto {
  @ApiPropertyOptional({ description: 'Account to scan (omit for all active accounts)' })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Whether to broadcast alerts (default true)', default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  notify?: boolean = true;
}
