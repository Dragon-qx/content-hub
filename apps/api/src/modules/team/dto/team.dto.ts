import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddMemberDto {
  @IsString()
  userId: string;

  @IsString()
  role: string;
}

export class UpdateMemberDto {
  @IsString()
  role: string;
}
