import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AuditModule } from '../audit/audit.module';
import {
  OAuthAuthorizeController,
  OAuthCallbackController,
} from './oauth.controller';

@Module({
  imports: [AuditModule],
  controllers: [
    AccountController,
    OAuthAuthorizeController,
    OAuthCallbackController,
  ],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
