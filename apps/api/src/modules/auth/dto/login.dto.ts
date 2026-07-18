import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'User email address', example: 'alice@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password', example: 'password123' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'A valid refresh token' })
  @IsString()
  @MinLength(1)
  refreshToken: string;
}
