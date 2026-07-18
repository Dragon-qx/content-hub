import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ description: 'Team name', example: 'Marketing' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ description: 'Team description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTeamDto {
  @ApiPropertyOptional({ description: 'Updated team name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class AddMemberDto {
  @ApiProperty({ description: 'User id to add to the team' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Role to assign', example: 'EDITOR' })
  @IsString()
  role: string;
}

export class UpdateMemberDto {
  @ApiProperty({ description: 'New role', example: 'ADMIN' })
  @IsString()
  role: string;
}
