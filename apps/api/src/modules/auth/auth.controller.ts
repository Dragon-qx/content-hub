import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from './decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { MfaCodeDto, MfaLoginDto } from './dto/mfa.dto';
import { AuthService, LoginResult } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  /**
   * Complete an MFA-protected login. The client calls this after `/login`
   * returns `{ mfaRequired: true, mfaToken }`, redeeming the token + TOTP code
   * for session tokens.
   */
  @Post('mfa/login')
  mfaLogin(@Body() dto: MfaLoginDto) {
    return this.authService.mfaLogin(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  // --- MFA management (all require an authenticated session) -----------

  /** Begin MFA setup: returns a secret + provisioning URI to seed an app. */
  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  setupMfa(@CurrentUser() user: AuthUser) {
    return this.authService.setupMfa(user.userId);
  }

  /** Verify the seeded secret with a code, then enable MFA. */
  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  verifyMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.authService.enableMfa(user.userId, dto);
  }

  /** Disable MFA and clear the stored secret. */
  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  disableMfa(@CurrentUser() user: AuthUser) {
    return this.authService.disableMfa(user.userId);
  }

  /** Whether the current user has MFA enabled. */
  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  mfaStatus(@CurrentUser() user: AuthUser) {
    return this.authService.getStatus(user.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
