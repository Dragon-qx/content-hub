import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MinLength } from 'class-validator';

/** Code submitted to verify or complete an MFA-protected login. */
export class MfaCodeDto {
  @ApiProperty({ description: '6-digit TOTP code', length: 6, example: '123456' })
  @IsString()
  @Length(6, 6, { message: '验证码必须为 6 位数字' })
  code: string;
}

/**
 * The first login step returns an opaque, short-lived token when the account
 * has MFA enabled. The client redeems it (plus a TOTP code) at /auth/mfa/login.
 */
export class MfaLoginDto {
  @ApiProperty({ description: 'Short-lived token returned by /auth/login when MFA is required' })
  @IsString()
  @MinLength(1)
  mfaToken: string;

  @ApiProperty({ description: '6-digit TOTP code', length: 6, example: '123456' })
  @IsString()
  @Length(6, 6, { message: '验证码必须为 6 位数字' })
  code: string;
}

/** Response when MFA is enabled on the account and a code is required. */
export interface MfaRequiredView {
  mfaRequired: true;
  mfaToken: string;
}

/** Response shape returned at setup time so the user can seed their app. */
export interface MfaSetupView {
  secret: string;
  otpauthUrl: string;
}
