import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ImportRowResult } from './account.service';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import {
  AccountService,
  BatchImportSummary,
} from './account.service';
import { AccountTransferService } from './account-transfer.service';
import { BindAccountDto, ListAccountsQuery } from './dto/account.dto';
import { ImportAccountsDto } from './dto/import-accounts.dto';
import {
  DecideTransferDto,
  InitiateTransferDto,
  ListTransfersQueryDto,
} from './dto/account-transfer.dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly transfers: AccountTransferService,
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

  @ApiOperation({
    summary: 'Batch import accounts from a CSV upload',
    description:
      'Accepts a RFC 4180 CSV file (columns: platform, accountId, accountName, ' +
      'accountHandle, plus per-platform credential keys such as appid/secret, ' +
      'clientKey/clientSecret, appKey/appSecret, or a JSON `credentials` column). ' +
      'Each row is bound independently — partial success is reported in the response.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV file containing one row per account' },
        teamId: { type: 'string', description: 'Team that owns the imported accounts' },
      },
      required: ['file', 'teamId'],
    },
  })
  @ApiCreatedResponse({
    description: 'Import summary including per-row success and failure details.',
    type: undefined,
  })
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @UploadedFile() file: { buffer?: Buffer; size?: number } | undefined,
    @Body('teamId') teamId: string | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ): Promise<BatchImportSummary> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No CSV file uploaded');
    }
    if (!teamId || teamId.trim().length === 0) {
      throw new BadRequestException('teamId is required');
    }
    // Defend against absurdly large uploads — 500k cells (~5 MB) is generous.
    if (file.buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('CSV file too large (max 5 MB)');
    }

    const csv = file.buffer.toString('utf-8');
    const { rows, parseErrors } = this.accountService.parseImportCsv(csv);
    const summary = await this.accountService.batchImport(teamId, rows);
    summary.results.unshift(...parseErrors);

    await this.audit.log(
      'CREATE',
      user.userId,
      'Account',
      'batch-import',
      { total: summary.total, succeeded: summary.succeeded, failed: summary.failed },
      req.ip,
    );
    return summary;
  }

  @ApiOperation({
    summary: 'Batch import accounts from a JSON payload',
    description:
      'Accepts an array of records as JSON. Mirrors the CSV import but accepts ' +
      'pre-parsed, class-validated records. Use this from programmatic clients ' +
      'or when the caller already has structured data.',
  })
  @ApiCreatedResponse({ description: 'Import summary.' })
  @Post('import/json')
  async importJson(
    @Body() dto: ImportAccountsDto,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ): Promise<BatchImportSummary> {
    const rows = dto.records.map((r) => ({
      platform: r.platform,
      accountId: r.accountId,
      accountName: r.accountName,
      accountHandle: r.accountHandle,
      credentials: r.credentials,
    }));
    const summary = await this.accountService.batchImport(dto.teamId, rows);

    await this.audit.log(
      'CREATE',
      user.userId,
      'Account',
      'batch-import-json',
      { total: summary.total, succeeded: summary.succeeded, failed: summary.failed },
      req.ip,
    );
    return summary;
  }

  // ── Account handover ─────────────────────────────────────────────────
  // A two-phase transfer: a source-team ADMIN initiates ; a destination-team
  // ADMIN accepts (atomic account teamId rewrite + groupId reset) or rejects.
  // Cancellation is allowed for the initiator or a source-team ADMIN.

  @ApiOperation({
    summary: 'Initiate a team-to-team account handover',
    description:
      'Source-team ADMIN proposes transferring this account to another team. ' +
      'Creates a PENDING AccountTransfer. The destination team then accepts or rejects.',
  })
  @ApiParam({ name: 'id', description: 'Account id to transfer' })
  @ApiCreatedResponse({ description: 'Transfer proposal created (PENDING).' })
  @Post(':id/transfer')
  async initiateTransfer(
    @Param('id') id: string,
    @Body() dto: InitiateTransferDto,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    const account = await this.accountService.get(id);
    const transfer = await this.transfers.initiate(account.teamId, {
      accountId: id,
      toTeamId: dto.toTeamId,
      initiatorUserId: user.userId,
      note: dto.note,
    });
    await this.audit.log(
      'CREATE',
      user.userId,
      'AccountTransfer',
      transfer.id,
      { from: account.teamId, to: dto.toTeamId, account: id },
      req.ip,
    );
    return transfer;
  }

  @ApiOperation({
    summary: 'Decide a pending account handover (destination team)',
    description:
      'Destination-team ADMIN accepts (account moves to their team, groupId cleared) ' +
      'or rejects the transfer.',
  })
  @ApiParam({ name: 'id', description: 'Transfer id' })
  @Patch(':id/transfer')
  async decideTransfer(
    @Param('id') id: string,
    @Body() dto: DecideTransferDto,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    const transfer = await this.transfers.decide({
      transferId: id,
      actingUserId: user.userId,
      decision: dto.decision,
    });
    await this.audit.log(
      'UPDATE',
      user.userId,
      'AccountTransfer',
      id,
      { decision: dto.decision, status: transfer.status },
      req.ip,
    );
    return transfer;
  }

  @ApiOperation({
    summary: 'Cancel a pending account handover',
    description: 'Allows the original initiator or a source-team ADMIN to withdraw a PENDING transfer.',
  })
  @ApiParam({ name: 'id', description: 'Transfer id' })
  @Delete(':id/transfer')
  async cancelTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    const transfer = await this.transfers.cancel(id, user.userId);
    await this.audit.log(
      'UPDATE',
      user.userId,
      'AccountTransfer',
      id,
      { action: 'cancel', status: transfer.status },
      req.ip,
    );
    return transfer;
  }

  @ApiOperation({
    summary: 'List account handovers involving a team',
    description:
      'Returns transfers filtered by direction (incoming/outgoing/all) and optional status. ' +
      'Caller must be a member of the relevant team(s).',
  })
  @Get('transfers')
  listTransfers(
    @Query() query: ListTransfersQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    // The service lists by teamId; the frontend supplies the team via query.
    // We default to the caller's first team when omitted for convenience.
    const teamId = (query as any).teamId;
    if (!teamId) {
      return { items: [], total: 0, note: 'teamId query is required' };
    }
    return this.transfers.listForTeam(teamId, {
      direction: query.direction,
      status: query.status as any,
    });
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
