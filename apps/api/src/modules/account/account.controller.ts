import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { AccountService } from './account.service';
import { BindAccountDto, ListAccountsQuery } from './dto/account.dto';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAccountsQuery) {
    const { skip, take } = query;
    if (query.teamId) {
      return this.accountService.listForTeam(query.teamId, { skip, take });
    }
    return this.accountService.listForUser(user.userId, { skip, take });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.accountService.get(id);
  }

  @Post()
  async bind(
    @CurrentUser() user: AuthUser,
    @Body() dto: BindAccountDto,
    @Req() req: { ip?: string },
  ) {
    const account = await this.accountService.bind(dto.teamId, dto);
    await this.audit.log(
      'CREATE',
      user.userId,
      'Account',
      account.id,
      { platform: dto.platform, accountId: dto.accountId },
      req.ip,
    );
    return account;
  }

  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.accountService.sync(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: Partial<BindAccountDto>,
    @Req() req: { ip?: string },
  ) {
    const updated = await this.accountService.update(id, dto);
    await this.audit.log(
      'UPDATE',
      user.userId,
      'Account',
      id,
      { changed: dto },
      req.ip,
    );
    return updated;
  }

  @Delete(':id')
  async unbind(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    const result = await this.accountService.unbind(id);
    await this.audit.log('DELETE', user.userId, 'Account', id, null, req.ip);
    return result;
  }
}
