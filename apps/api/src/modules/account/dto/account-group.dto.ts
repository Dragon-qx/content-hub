import { IsHexColor, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccountGroupDto {
  @ApiProperty({ description: 'Group name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Hex color for UI chip (e.g. "#3b82f6")' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateAccountGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class AssignAccountDto {
  @ApiProperty({ description: 'Account id to assign' })
  @IsString()
  accountId!: string;
}
