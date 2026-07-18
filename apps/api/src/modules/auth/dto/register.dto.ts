import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'User email address', example: 'alice@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password (8-64 characters)', minLength: 8, maxLength: 64, example: 'password123' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64, { message: '密码最多 64 位' })
  password: string;

  @ApiProperty({ description: 'Display name', example: 'Alice' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}
