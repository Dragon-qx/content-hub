import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkflowDto {
  @IsOptional()
  @IsString()
  contentId?: string;

  @IsString()
  @MinLength(1)
  approverId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;
}

export class WorkflowActionDto {
  @IsString()
  @MinLength(1)
  approverId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ListWorkflowQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  skip?: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  take?: number = 20;

  @IsOptional()
  @IsString()
  contentId?: string;

  @IsOptional()
  @IsString()
  approverId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
