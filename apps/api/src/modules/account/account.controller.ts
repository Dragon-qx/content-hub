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
import { BindAccountDto, ListAccountsQuery } from './dto/account.dto';
import { ImportAccountsDto } from './dto/import-accounts.dto';

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
