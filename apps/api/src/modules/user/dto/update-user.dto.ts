import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Updated display name', example: 'Alice' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ description: 'Avatar image URL', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}
