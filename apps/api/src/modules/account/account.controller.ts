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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { AccountService } from './account.service';
import { BindAccountDto, ListAccountsQuery } from './dto/account.dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly audit: AuditService,
  ) {}

  @ApiOperation({ summary: 'List accounts', description: 'Lists accounts for a team, or for the caller when no team is supplied.' })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAccountsQuery) {
    const { skip, take } = query;
    if (query.teamId) {
      return this.accountService.listForTeam(query.teamId, { skip, take });
    }
    return this.accountService.listForUser(user.userId, { skip, take });
  }

  @ApiOperation({ summary: 'Get account by id' })
  @ApiParam({ name: 'id', description: 'Account id' })
  @ApiOkResponse({ description: 'Account detail.' })
  @ApiNotFoundResponse({ description: 'Account not found.' })
  @Get(':id')
  get(@Param('id') id: string) {
    return this.accountService.get(id);
  }

  @ApiOperation({ summary: 'Bind a platform account', description: 'Stores credentials for a social platform account under a team.' })
  @ApiCreatedResponse({ description: 'Account bound.' })
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

  @ApiOperation({ summary: 'Sync account metrics / posts', description: 'Pulls fresh data from the platform adapter into a snapshot.' })
  @ApiParam({ name: 'id', description: 'Account id' })
  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.accountService.sync(id);
  }

  @ApiOperation({ summary: 'Update account credentials' })
  @ApiParam({ name: 'id', description: 'Account id' })
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

  @ApiOperation({ summary: 'Unbind account', description: 'Removes the platform account and its credentials.' })
  @ApiParam({ name: 'id', description: 'Account id' })
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
