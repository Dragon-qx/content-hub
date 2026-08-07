import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { MemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class TeamAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assert that the user is an active member of the team.
   * Throws NotFoundException if team doesn't exist or user is not a member.
   */
  async assertUserInTeam(userId: string, teamId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member) {
      // Use NotFound to avoid leaking team existence
      throw new NotFoundException('Resource not found or access denied');
    }
  }

  /**
   * Assert that the user has at least the required role in the team.
   */
  async assertUserRole(
    userId: string,
    teamId: string,
    minRole: MemberRole,
  ): Promise<void> {
    const roleHierarchy: Record<MemberRole, number> = {
      VIEWER: 0,
      EDITOR: 1,
      ADMIN: 2,
    };
    const member = await this.prisma.member.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member || roleHierarchy[member.role] < roleHierarchy[minRole]) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  /**
   * Assert that a resource belongs to the team.
   * The resource is identified by its `teamId` field.
   */
  async assertResourceInTeam(
    resourceTeamId: string | null | undefined,
    teamId: string,
  ): Promise<void> {
    if (resourceTeamId !== teamId) {
      throw new NotFoundException('Resource not found or access denied');
    }
  }

  /**
   * Find a social account by id and assert it belongs to the team.
   */
  async getAccountInTeam(accountId: string, teamId: string) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, teamId },
    });
    if (!account) {
      throw new NotFoundException('Resource not found or access denied');
    }
    return account;
  }

  /**
   * Find a content by id and assert it belongs to the team.
   */
  async getContentInTeam(contentId: string, teamId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, teamId },
    });
    if (!content) {
      throw new NotFoundException('Resource not found or access denied');
    }
    return content;
  }

  /**
   * Find a media asset by id and assert it belongs to the team (via content).
   */
  async getMediaInTeam(mediaId: string, teamId: string) {
    const media = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId },
      include: { content: true },
    });
    if (!media || media.content?.teamId !== teamId) {
      throw new NotFoundException('Resource not found or access denied');
    }
    return media;
  }

  /**
   * Find a publish job by id and assert it belongs to the team (via content).
   */
  async getJobInTeam(jobId: string, teamId: string) {
    const job = await this.prisma.publishJob.findFirst({
      where: { id: jobId },
    });
    if (!job) {
      throw new NotFoundException('Resource not found or access denied');
    }
    const content = await this.prisma.content.findFirst({
      where: { id: job.contentId, teamId },
    });
    if (!content) {
      throw new NotFoundException('Resource not found or access denied');
    }
    return job;
  }

  /**
   * Find a receipt by id and assert it belongs to the team (via content).
   */
  async getReceiptInTeam(receiptId: string, teamId: string) {
    const receipt = await this.prisma.publishReceipt.findFirst({
      where: { id: receiptId },
    });
    if (!receipt) {
      throw new NotFoundException('Resource not found or access denied');
    }
    const content = await this.prisma.content.findFirst({
      where: { id: receipt.contentId, teamId },
    });
    if (!content) {
      throw new NotFoundException('Resource not found or access denied');
    }
    return receipt;
  }

  /**
   * Get the first team a user belongs to.
   */
  async firstTeamForUser(userId: string): Promise<string | null> {
    const member = await this.prisma.member.findFirst({
      where: { userId },
      select: { teamId: true },
    });
    return member?.teamId ?? null;
  }

  /**
   * Resolve the effective team ID for a user-scoped request.
   * If a teamId is provided, validates membership. Otherwise, falls back to the user's first team.
   */
  async resolveTeamId(userId: string, teamId?: string | null): Promise<string> {
    if (teamId) {
      await this.assertUserInTeam(userId, teamId);
      return teamId;
    }
    const firstTeam = await this.firstTeamForUser(userId);
    if (!firstTeam) {
      throw new NotFoundException('User is not a member of any team');
    }
    return firstTeam;
  }
}
