import { IsString, Length, MinLength } from 'class-validator';

/** Code submitted to verify or complete an MFA-protected login. */
export class MfaCodeDto {
  @IsString()
  @Length(6, 6, { message: '验证码必须为 6 位数字' })
  code: string;
}

/**
 * The first login step returns an opaque, short-lived token when the account
 * has MFA enabled. The client redeems it (plus a TOTP code) at /auth/mfa/login.
 */
export class MfaLoginDto {
  @IsString()
  @MinLength(1)
  mfaToken: string;

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
