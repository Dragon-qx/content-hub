import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType, Wallet } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Default unit prices (minor-credits per operation). Overridable in memory. */
export const DEFAULT_PRICE_TABLE: Record<TransactionType, number> = {
  TOPUP: 0, // top-up is a balance add, not a charge
  REFUND: 0,
  PUBLISH: 10,
  SCHEDULE: 5,
  SYNC: 2,
  MEDIA_PROCESS: 8,
  AI_ASSIST: 3,
};

export interface PriceTable {
  /** Map TransactionType → minor-unit cost (0 = free). */
  prices: Record<TransactionType, number>;
}

export interface TopUpDto {
  /** Minor units (e.g. cents) to add. Must be > 0. */
  amount: number;
  note?: string;
}

export interface DebitOptions {
  type: TransactionType;
  refId?: string;
  note?: string;
  /** Fail the write if the resulting balance would drop below this floor. */
  minBalance?: number;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  /** Rate-card cache; replaceable later with a persistence-backed config. */
  private prices: Record<TransactionType, number> = { ...DEFAULT_PRICE_TABLE };

  constructor(private readonly prisma: PrismaService) {}

  /** Get or lazily create a wallet for a team. Idempotent. */
  async getOrCreateWallet(teamId: string): Promise<Wallet> {
    const existing = await this.prisma.wallet.findUnique({ where: { teamId } });
    if (existing) return existing;
    return this.prisma.wallet.create({
      data: { teamId, balance: 0, holdBalance: 0 },
    });
  }

  /** Current available balance (excludes held reservations). */
  async balance(teamId: string) {
    const w = await this.prisma.wallet.findUnique({ where: { teamId } });
    return {
      teamId,
      balance: w?.balance ?? 0,
      holdBalance: w?.holdBalance ?? 0,
      available: (w?.balance ?? 0) - (w?.holdBalance ?? 0),
      currency: w?.currency ?? 'CREDIT',
    };
  }

  /**
   * Credit the wallet. Wrapped in a transaction that also writes the ledger
   * entry so top-ups are always represented atomically.
   */
  async topUp(teamId: string, dto: TopUpDto) {
    if (!Number.isInteger(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('amount must be a positive integer');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { teamId },
        create: { teamId, balance: 0 },
        update: { balance: { increment: dto.amount } },
      });
      const entry = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.TOPUP,
          amount: dto.amount,
          balanceAfter: wallet.balance,
          note: dto.note ?? 'top-up',
        },
      });
      return { wallet, entry };
    });

    this.logger.log(`Wallet ${result.wallet.id}: +${dto.amount} (balance ${result.wallet.balance})`);
    return result;
  }

  /**
   * Charge an operation. Throws `ConflictException` when the team would fall
   * below the given floor (default 0). Returns null when the operation type
   * is free (price 0), without writing any row.
   */
  async debit(
    teamId: string,
    type: TransactionType,
    opts: Omit<DebitOptions, 'type'> = {},
  ): Promise<{ wallet: Wallet; entry: unknown } | null> {
    const price = this.prices[type] ?? 0;
    if (price <= 0) return null;

    const refId = opts.refId;
    const note = opts.note ?? type;
    const minFloor = opts.minBalance ?? 0;

    const wallet = await this.prisma.wallet.findUnique({ where: { teamId } });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for team ${teamId}`);
    }
    if (wallet.balance - price < minFloor) {
      throw new ConflictException(
        `Insufficient balance (${wallet.balance}) for ${type} (cost ${price})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: price } },
      });
      const entry = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount: -price,
          balanceAfter: updated.balance,
          refId,
          note,
        },
      });
      return { wallet: updated, entry };
    });
  }

  /**
   * Convenience wrapper: charge-or-skip. Returns true when the charge
   * succeeded, false when freed. Never throws for insufficient funds when
   * `lenient=true`, letting the caller decide whether to fail the operation.
   */
  async tryDebit(
    teamId: string,
    type: TransactionType,
    opts: Omit<DebitOptions, 'type'> & { lenient?: boolean } = {},
  ): Promise<boolean> {
    try {
      const r = await this.debit(teamId, type, opts);
      return r !== null;
    } catch (err) {
      if (opts.lenient && err instanceof ConflictException) {
        return false;
      }
      throw err;
    }
  }

  /** Paginated transaction history. */
  async listTransactions(
    teamId: string,
    { skip = 0, take = 20 }: { skip?: number; take?: number } = {},
  ) {
    const wallet = await this.prisma.wallet.findUnique({ where: { teamId } });
    if (!wallet) return { items: [], total: 0, skip, take };
    const where: Prisma.WalletTransactionWhereInput = { walletId: wallet.id };
    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  /** Swap the rate card (used for config service seeding / admin panel). */
  setPrices(prices: Partial<Record<TransactionType, number>>) {
    this.prices = { ...this.prices, ...prices };
  }

  getPrices(): Record<TransactionType, number> {
    return { ...this.prices };
  }
}
