import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const TIMEOUT_ACTIONS = ['APPROVE', 'REJECT', 'ESCALATE'] as const;
export type TimeoutAction = (typeof TIMEOUT_ACTIONS)[number];

export class CreateWorkflowDto {
  @ApiPropertyOptional({ description: 'Content id to submit for approval' })
  @IsOptional()
  @IsString()
  contentId?: string;

  @ApiProperty({ description: 'User id of the assigned approver' })
  @IsString()
  @MinLength(1)
  approverId: string;

  @ApiPropertyOptional({ description: 'Summary / change note for the reviewer', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;
}

export class WorkflowActionDto {
  @ApiProperty({ description: 'User id of the acting approver' })
  @IsString()
  @MinLength(1)
  approverId: string;

  @ApiPropertyOptional({ description: 'Comment attached to the approval/rejection', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class WorkflowTimeoutConfigDto {
  @ApiProperty({ description: 'Timeout window in hours (null = no timeout)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  timeoutHours?: number | null;

  @ApiProperty({ description: 'Action to take when timeout fires', enum: TIMEOUT_ACTIONS })
  @IsOptional()
  @IsIn(TIMEOUT_ACTIONS)
  timeoutAction?: TimeoutAction;

  @ApiPropertyOptional({ description: 'User id to escalate to (required when action=ESCALATE)' })
  @IsOptional()
  @IsString()
  escalateTo?: string;
}

export class TimeoutSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Hours before timeout to flag as approaching (default: 24)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  windowHours?: number = 24;
}

export class ListWorkflowQueryDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  skip?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  take?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by content id' })
  @IsOptional()
  @IsString()
  contentId?: string;

  @ApiPropertyOptional({ description: 'Filter by approver id' })
  @IsOptional()
  @IsString()
  approverId?: string;

  @ApiPropertyOptional({ description: 'Filter by workflow status' })
  @IsOptional()
  @IsString()
  status?: string;
}
