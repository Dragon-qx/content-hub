import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Platform } from '@content-hub/platform-sdk';

/**
 * Kick off the OAuth2 authorization-code flow for a platform account.
 *
 * The caller supplies the team, the platform's OAuth *app* credentials
 * (client key + secret) and an optional display name. The backend mints a
 * signed `state` token carrying this context and returns the provider's
 * authorize URL for the frontend to redirect the browser to. The platform
 * later redirects back to the callback; because that second hop arrives
 * without a JWT, the sealed state is how the callback recovers the context.
 */
export class OAuthAuthorizeDto {
  @ApiProperty({ description: 'Team that will own the bound account' })
  @IsString()
  @MinLength(1)
  teamId: string;

  @ApiProperty({ description: 'Target platform', enum: Platform })
  @IsString()
  platform: Platform;

  /** OAuth app client key / app key (the developer-registered app). */
  @ApiProperty({ description: 'OAuth app client key' })
  @IsString()
  @MinLength(1)
  appKey: string;

  /** OAuth app client secret / app secret. */
  @ApiProperty({ description: 'OAuth app client secret' })
  @IsString()
  @MinLength(1)
  appSecret: string;

  /** Human-readable label for the account; defaults to the platform name. */
  @ApiPropertyOptional({ description: 'Display name for the account', example: 'Brand Official' })
  @IsOptional()
  @IsString()
  accountName?: string;

  /**
   * Optional explicit external account id. When omitted, the id returned by
   * the platform during code exchange drives the binding.
   */
  @ApiPropertyOptional({ description: 'Pre-known external account id' })
  @IsOptional()
  @IsString()
  accountId?: string;

  /**
   * Absolute URL the platform should redirect back to with the auth code. When
   * omitted the adapter's built-in redirect is used (handy for local testing).
   */
  @ApiPropertyOptional({ description: 'Explicit OAuth redirect URI override' })
  @IsOptional()
  @IsString()
  redirectUri?: string;
}
