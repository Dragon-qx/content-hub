import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AccountTransferService } from './account-transfer.service';
import { AccountGroupController } from './account-group.controller';
import { AccountGroupService } from './account-group.service';
import { AuditModule } from '../audit/audit.module';
import {
  OAuthAuthorizeController,
  OAuthCallbackController,
} from './oauth.controller';

@Module({
  imports: [AuditModule],
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
