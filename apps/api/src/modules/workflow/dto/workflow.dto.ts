import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
