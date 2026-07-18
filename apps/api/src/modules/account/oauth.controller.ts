import { BadRequestException, Body, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Controller } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { AccountService } from './account.service';
import { OAuthAuthorizeDto } from './dto/oauth.dto';

/**
 * OAuth2 authorization-code binding for social accounts.
 *
 *  POST/GET /accounts/oauth/:platform/authorize  (authed)  → { authUrl }
 *  GET       /accounts/oauth/:platform/callback   (public)  → 302 → frontend
 *
 * The authorize step is gated by JWT; the callback is not — the platform
 * redirects the user's browser straight to it. All context needed to finish
 * the binding is carried in the signed `state` token, so the callback stays
 * stateless. On success it redirects back to the SPA's accounts page with an
 * `oauth=success` flag the UI turns into a toast; failures redirect with
 * `oauth=error&message=…`.
 */

/** Resolves the SPA origin used to build the post-bind redirect. */
function frontendOrigin(config: ConfigService): string {
  return (
    config.get<string>('FRONTEND_URL') ??
    config.get<string>('OAUTH_SUCCESS_REDIRECT') ??
    'http://localhost:3001'
  );
}

function buildRedirect(config: ConfigService, query: Record<string, string>): string {
  const params = new URLSearchParams(query).toString();
  return `${frontendOrigin(config)}/accounts?${params}`;
}

@ApiTags('Accounts / OAuth')
@Controller('accounts/oauth')
export class OAuthAuthorizeController {
  constructor(
    private readonly accountService: AccountService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Build the provider authorize URL. Accepts the binding context (teamId, app
   * credentials) as a JSON body — these are sensitive values that don't belong
   * in a query string. (A GET variant also exists for a plain link-based flow.)
   */
  @ApiOperation({ summary: 'Start OAuth2 binding (POST)', description: 'Returns the provider authorize URL for the frontend to redirect to. Accepts credentials in the body (recommended).' })
  @ApiParam({ name: 'platform', description: 'Target platform' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':platform/authorize')
  async authorize(
    @CurrentUser() user: AuthUser,
    @Param('platform') platform: string,
    @Body() dto: OAuthAuthorizeDto,
  ) {
    // `platform` is also a validated path param; align it with the DTO so a
    // mismatch between path and body can't be smuggled through.
    return this.accountService.authorizeOAuth(
      { ...dto, platform: dto.platform || platform },
      user.userId,
    );
  }

  @ApiOperation({ summary: 'Start OAuth2 binding (GET)', description: 'GET variant for a plain link-based authorize flow.' })
  @ApiParam({ name: 'platform', description: 'Target platform' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':platform/authorize')
  authorizeGet(
    @CurrentUser() user: AuthUser,
    @Param('platform') platform: string,
    @Query() dto: OAuthAuthorizeDto,
  ) {
    return this.authorize(user, platform, dto);
  }
}

@ApiTags('Accounts / OAuth')
@Controller('accounts/oauth')
export class OAuthCallbackController {
  constructor(
    private readonly accountService: AccountService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Platform redirect target. Stateless: the sealed `state` carries the
   * binding context. Always answers with a 302 to the frontend so the browser
   * lands back in the SPA; the SPA reads the oauth result from the querystring.
   */
  @ApiOperation({
    summary: 'OAuth2 callback (public)',
    description:
      'Platform redirect target. Redirects 302 back to the frontend with oauth=success|error in the querystring. Stateless — context is carried in the sealed `state`.',
  })
  @ApiParam({ name: 'platform', description: 'Target platform' })
  @Get(':platform/callback')
  async callback(
    @Param('platform') platform: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    if (!code || !state) {
      return res.redirect(
        302,
        buildRedirect(this.config, {
          oauth: 'error',
          platform,
          message: 'Missing authorization code or state',
        }),
      );
    }

    try {
      const { account, userId } = await this.accountService.callbackOAuth(
        platform,
        code,
        state,
      );
      await this.audit.log(
        'CREATE',
        userId,
        'Account',
        account.id,
        { platform, method: 'OAUTH2' },
        undefined,
      );
      return res.redirect(
        302,
        buildRedirect(this.config, {
          oauth: 'success',
          platform,
          account: account.id,
        }),
      );
    } catch (err) {
      const message =
        err instanceof BadRequestException ? err.message : 'OAuth binding failed';
      return res.redirect(
        302,
        buildRedirect(this.config, { oauth: 'error', platform, message }),
      );
    }
  }
}
