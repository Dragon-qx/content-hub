import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from './decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { MfaCodeDto, MfaLoginDto, MfaRequiredView, MfaSetupView } from './dto/mfa.dto';
import { AuthService, LoginResult } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new account', description: 'Creates a user. Returns access + refresh tokens on success.' })
  @ApiOkResponse({ description: 'Account created' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({
    summary: 'Log in',
    description:
      'Returns access + refresh tokens when MFA is off, or `{ mfaRequired: true, mfaToken }` when it is on.',
  })
  @ApiOkResponse({ description: 'Session tokens (or MFA challenge).' })
  @ApiBadRequestResponse({ description: 'Validation error.' })
  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  /**
   * Complete an MFA-protected login. The client calls this after `/login`
   * returns `{ mfaRequired: true, mfaToken }`, redeeming the token + TOTP code
   * for session tokens.
   */
  @ApiOperation({ summary: 'Redeem an MFA login (second step)' })
  @Post('mfa/login')
  mfaLogin(@Body() dto: MfaLoginDto) {
    return this.authService.mfaLogin(dto);
  }

  @ApiOperation({ summary: 'Refresh an access token' })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  // --- MFA management (all require an authenticated session) -----------

  /** Begin MFA setup: returns a secret + provisioning URI to seed an app. */
  @ApiOperation({ summary: 'Begin MFA setup', description: 'Returns a secret + otpauth:// URI to seed an authenticator app.' })
  @ApiBearerAuth()
  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  setupMfa(@CurrentUser() user: AuthUser): Promise<MfaSetupView> {
    return this.authService.setupMfa(user.userId);
  }

  /** Verify the seeded secret with a code, then enable MFA. */
  @ApiOperation({ summary: 'Verify and enable MFA', description: 'Confirms the seeded secret with a 6-digit code.' })
  @ApiBearerAuth()
  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  verifyMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.authService.enableMfa(user.userId, dto);
  }

  /** Disable MFA and clear the stored secret. */
  @ApiOperation({ summary: 'Disable MFA' })
  @ApiBearerAuth()
  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  disableMfa(@CurrentUser() user: AuthUser) {
    return this.authService.disableMfa(user.userId);
  }

  /** Whether the current user has MFA enabled. */
  @ApiOperation({ summary: 'Check MFA status', description: 'Returns `{ mfaEnabled }` for the current user.' })
  @ApiBearerAuth()
  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  mfaStatus(@CurrentUser() user: AuthUser) {
    return this.authService.getStatus(user.userId);
  }

  @ApiOperation({ summary: 'Current session user' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Current user principal.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
