import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, Prisma, TransferStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Why a transfer request was refused — surfaced as a typed error message. */
const MUST_BE_SRC_ADMIN = 'Only a source-team admin can initiate a transfer';
const MUST_BE_DST_ADMIN = 'Only a destination-team admin can decide a transfer';
const ACCOUNT_NOT_IN_SOURCE = 'Account does not belong to the source team';
const SAME_TEAM = 'Source and destination teams must differ';
const ACTIVE_CONFLICT = 'The account already has a pending transfer';

export interface InitiateTransferInput {
  accountId: string;
  toTeamId: string;
  initiatorUserId: string;
  note?: string;
}

export interface DecideTransferInput {
  transferId: string;
  actingUserId: string;
  decision: 'accept' | 'reject';
}

@Injectable()
export class AccountTransferService {
  private readonly logger = new Logger(AccountTransferService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Step 1 — initiate a handover. Validates that:
   *   • the account exists and belongs to the caller's team,
   *   • the caller is an ADMIN (or OWNER) of the source team,
   *   • source ≠ destination,
   *   • no PENDING transfer already exists for the account.
   *
   * @param sourceTeamId the team the account currently lives in
   */
  async initiate(
    sourceTeamId: string,
    input: InitiateTransferInput,
  ) {
    const { accountId, toTeamId, initiatorUserId, note } = input;

    if (sourceTeamId === toTeamId) {
      throw new BadRequestException(SAME_TEAM);
    }

    const account = await this.prisma.socialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    if (account.teamId !== sourceTeamId) {
      throw new ForbiddenException(ACCOUNT_NOT_IN_SOURCE);
    }

    await this.assertAdmin(initiatorUserId, sourceTeamId, MUST_BE_SRC_ADMIN);

    const active = await this.activeTransferFor(accountId);
    if (active) {
      throw new ConflictException(ACTIVE_CONFLICT);
    }

    const transfer = await this.prisma.accountTransfer.create({
      data: {
        accountId,
        fromTeamId: sourceTeamId,
        toTeamId,
        initiatorId: initiatorUserId,
        note: note?.trim() || null,
        status: TransferStatus.PENDING,
      },
    });

    this.logger.log(
      `Transfer ${transfer.id}: account ${accountId} team ${sourceTeamId} → ${toTeamId}`,
    );
    return transfer;
  }

  /**
   * Step 2 — the destination team decides. Accepting **atomically**:
   *   • flips the transfer row → ACCEPTED and stamps decidedById/At,
   *   • reassigns the account to the destination team and clears groupId
   *     (account groups are team-scoped, so a transferred account starts
   *     ungrouped in the new team).
   *
   * Both writes run in a transaction so we never end up with an account on
   * the new team and a stale PENDING transfer, or vice-versa.
   */
  async decide(input: DecideTransferInput) {
    const { transferId, actingUserId, decision } = input;

    const transfer = await this.prisma.accountTransfer.findUnique({
      where: { id: transferId },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (transfer.status !== TransferStatus.PENDING) {
      throw new ConflictException(`Transfer is already ${transfer.status.toLowerCase()}`);
    }

    await this.assertAdmin(actingUserId, transfer.toTeamId, MUST_BE_DST_ADMIN);

    const nextStatus =
      decision === 'accept' ? TransferStatus.ACCEPTED : TransferStatus.REJECTED;
    const stamp = new Date();

    if (decision === 'accept') {
      return this.prisma.$transaction(async (tx) => {
        const updatedTransfer = await tx.accountTransfer.update({
          where: { id: transferId },
          data: {
            status: nextStatus,
            decidedById: actingUserId,
            decidedAt: stamp,
          },
        });
        await tx.socialAccount.update({
          where: { id: transfer.accountId },
          data: { teamId: transfer.toTeamId, groupId: null },
        });
        return updatedTransfer;
      });
    }

    return this.prisma.accountTransfer.update({
      where: { id: transferId },
      data: { status: nextStatus, decidedById: actingUserId, decidedAt: stamp },
    });
  }

  /**
   * Cancel a still-pending transfer. Allowed for the original initiator or an
   * admin of the source team.
   */
  async cancel(transferId: string, actingUserId: string) {
    const transfer = await this.prisma.accountTransfer.findUnique({
      where: { id: transferId },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (transfer.status !== TransferStatus.PENDING) {
      throw new ConflictException(`Transfer is already ${transfer.status.toLowerCase()}`);
    }
    if (transfer.initiatorId !== actingUserId) {
      await this.assertAdmin(actingUserId, transfer.fromTeamId, MUST_BE_SRC_ADMIN);
    }

    return this.prisma.accountTransfer.update({
      where: { id: transferId },
      data: { status: TransferStatus.CANCELLED, decidedById: actingUserId, decidedAt: new Date() },
    });
  }

  /** Fetch the single active (PENDING) transfer for an account, if any. */
  activeTransferFor(accountId: string) {
    return this.prisma.accountTransfer.findFirst({
      where: { accountId, status: TransferStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Read a single transfer by id (throws if missing). */
  async get(transferId: string) {
    const transfer = await this.prisma.accountTransfer.findUnique({
      where: { id: transferId },
      include: {
        account: { select: { id: true, platform: true, accountName: true } },
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  /**
   * List transfers a team participates in. `direction` filters what the
   * caller sees:
   *   • 'outgoing' — transfers this team initiated (optionally filtered by
   *     status),
   *   • 'incoming' — transfers addressed to this team (the ones awaiting a
   *     destination-team admin's decision),
   *   • 'all' (default) — both.
   */
  listForTeam(
    teamId: string,
    opts: { direction?: 'incoming' | 'outgoing' | 'all'; status?: TransferStatus } = {},
  ) {
    const { direction = 'all', status } = opts;
    const where: Prisma.AccountTransferWhereInput = {};
    switch (direction) {
      case 'incoming':
        where.toTeamId = teamId;
        break;
      case 'outgoing':
        where.fromTeamId = teamId;
        break;
      default:
        where.OR = [{ fromTeamId: teamId }, { toTeamId: teamId }];
    }
    if (status) where.status = status;

    return this.prisma.accountTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        account: { select: { id: true, platform: true, accountName: true } },
      },
    });
  }

  /**
   * Confirm the user is a member of `teamId` with role ADMIN (or OWNER).
   * Throws ForbiddenException otherwise. Treats OWNER (system role) the same
   * as ADMIN for transfer authority.
   */
  private async assertAdmin(
    userId: string,
    teamId: string,
    message: string,
  ): Promise<void> {
    const membership = await this.prisma.member.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });

    const isOwner = await this.prisma.team.findFirst({
      where: { id: teamId, ownerId: userId },
      select: { id: true },
    });

    const isAdmin = !!membership && membership.role === MemberRole.ADMIN;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(message);
    }
  }
}
