import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TransactionType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { TeamAccessGuard } from '../common/team-access/team-access.guard';
import { WalletService } from './wallet.service';
import {
  DebitWalletDto,
  ListTransactionsQuery,
  TopUpWalletDto,
} from './dto/wallet.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TeamAccessGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @ApiOperation({ summary: 'Get wallet balance for a team' })
  @ApiOkResponse({ description: 'Current balance and currency.' })
  @Get(':teamId/balance')
  balance(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser) {
    return this.wallet.balance(teamId, user.userId);
  }

  @ApiOperation({ summary: 'Top-up a team wallet with credits' })
  @ApiCreatedResponse({ description: 'New balance after top-up.' })
  @Post(':teamId/top-up')
  topUp(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser, @Body() dto: TopUpWalletDto) {
    return this.wallet.topUp(teamId, dto, user.userId);
  }

  @ApiOperation({
    summary: 'Charge an operation against the wallet',
    description:
      'Debits the configured price for the given operation type. Returns 409 ' +
      'on insufficient balance, 204 for free operations.',
  })
  @ApiCreatedResponse({ description: 'Charge applied; new balance returned.' })
  @ApiConflictResponse({ description: 'Insufficient balance.' })
  @ApiNotFoundResponse({ description: 'Wallet not found.' })
  @Post(':teamId/debit')
  async debit(@Param('teamId') teamId: string, @CurrentUser() user: AuthUser, @Body() dto: DebitWalletDto) {
    const type = TransactionType[dto.type as keyof typeof TransactionType];
    if (!type) {
      throw new NotFoundException(`Unknown transaction type: ${dto.type}`);
    }
    const result = await this.wallet.debit(teamId, type, user.userId, {
      refId: dto.refId,
      note: dto.note,
    });
    if (!result) return { ok: true, charge: 0 };
    return { ok: true, balance: result.wallet.balance };
  }

  @ApiOperation({ summary: 'List wallet transactions (newest first)' })
  @ApiOkResponse({ description: 'Paginated ledger entries.' })
  @Get(':teamId/transactions')
  listTransactions(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListTransactionsQuery,
  ) {
    return this.wallet.listTransactions(teamId, user.userId, {
      skip: query.skip,
      take: query.take,
    });
  }

  @ApiOperation({ summary: 'Inspect current price table' })
  @ApiOkResponse({ description: 'Per-operation unit costs in minor-credits.' })
  @Get('prices')
  prices() {
    return this.wallet.getPrices();
  }

  /** Update one or more unit prices (owner/admin only). */
  @ApiOperation({ summary: 'Update price table entries' })
  @ApiOkResponse({ description: 'Resulting price table.' })
  @Patch('prices')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  setPrices(@Body() prices: Record<string, number>) {
    const parsed: Partial<Record<TransactionType, number>> = {};
    for (const [k, v] of Object.entries(prices)) {
      if (k in TransactionType && Number.isInteger(v)) {
        parsed[k as TransactionType] = v;
      }
    }
    this.wallet.setPrices(parsed);
    return this.wallet.getPrices();
  }
}
