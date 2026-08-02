import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AccountTransferService } from './account-transfer.service';
import { AccountGroupController } from './account-group.controller';
import { AccountGroupService } from './account-group.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformSdkModule } from '../platform-sdk/platform-sdk.module';
import {
  OAuthAuthorizeController,
  OAuthCallbackController,
} from './oauth.controller';

@Module({
  imports: [AuditModule, PlatformSdkModule],
  controllers: [
    AccountController,
    AccountGroupController,
    OAuthAuthorizeController,
    OAuthCallbackController,
  ],
  providers: [AccountService, AccountGroupService, AccountTransferService],
  exports: [AccountService, AccountGroupService, AccountTransferService],
})
export class AccountModule {}
