import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  Platform,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BindAccountDto } from './dto/account.dto';
import { WechatOfficialAdapter } from '@content-hub/platform-sdk';

const PUBLIC_SELECT = {
  id: true,
  teamId: true,
  platform: true,
  accountId: true,
  accountName: true,
  accountHandle: true,
  status: true,
  followerCount: true,
  followingCount: true,
  postCount: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicAccount = Prisma.SocialAccountGetPayload<{
  select: typeof PUBLIC_SELECT;
}>;

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForTeam(teamId: string): Promise<PublicAccount[]> {
    return this.prisma.socialAccount.findMany({
      where: { teamId },
      select: PUBLIC_SELECT,
    });
  }

  async listForUser(userId: string): Promise<PublicAccount[]> {
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);
    if (teamIds.length === 0) {
      return [];
    }
    return this.prisma.socialAccount.findMany({
      where: { teamId: { in: teamIds } },
      select: PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicAccount> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  // 根据平台自动组合 credentials JSON
  private composeCredentials(dto: BindAccountDto): Record<string, unknown> {
    const p = dto.platform;
    let creds: Record<string, unknown> = {};

    if (p === Platform.WECHAT_OFFICIAL || p === Platform.WECHAT_VIDEO) {
      creds = {
        type: 'wechat_official',
        appid: dto.appid || '',
        secret: dto.secret || '',
        rawId: dto.rawId || '',
      };
    } else if (p === Platform.DOUYIN) {
      creds = {
        type: 'douyin',
        clientKey: dto.clientKey || '',
        clientSecret: dto.clientSecret || '',
        callbackUrl: dto.callbackUrl || '',
      };
    } else if (p === Platform.XIAOHONGSHU || p === Platform.WEIBO) {
      creds = {
        type: p === Platform.XIAOHONGSHU ? 'xiaohongshu' : 'weibo',
        appKey: dto.appKey || '',
        appSecret: dto.appSecret || '',
      };
    } else if (p === Platform.BILIBILI) {
      creds = {
        type: 'bilibili',
        appKey: dto.appKey || '',
        accessKey: dto.accessKey || '',
        secretKey: dto.appSecret || '',
      };
    } else if (p === Platform.TWITTER) {
      creds = {
        type: 'twitter',
        bearerToken: dto.bearerToken || '',
        apiKey: dto.apiKey || '',
        apiSecret: dto.apiSecret || '',
      };
    } else if (p === Platform.YOUTUBE) {
      creds = {
        type: 'youtube',
        clientId: dto.clientId || '',
        clientSecret: dto.clientSecretYouTube || '',
        channelId: dto.channelId || '',
      };
    }

    // 如果前端直接传入了结构化的 credentials JSON，直接使用它
    if (dto.credentials && Object.keys(dto.credentials).length > 0) {
      creds = { ...creds, ...dto.credentials };
    }

    return creds;
  }

  async bind(teamId: string, dto: BindAccountDto): Promise<PublicAccount> {
    if (!Object.values(Platform).includes(dto.platform as Platform)) {
      throw new BadRequestException('Unsupported platform');
    }

    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        platform_accountId: { platform: dto.platform, accountId: dto.accountId },
      },
    });
    if (existing) {
      throw new BadRequestException('This social account is already bound');
    }

    const credentials = this.composeCredentials(dto);

    return this.prisma.socialAccount.create({
      data: {
        teamId,
        platform: dto.platform,
        accountId: dto.accountId,
        accountName: dto.accountName,
        accountHandle: dto.accountHandle,
        credentials: credentials as Prisma.InputJsonValue,
        status: AccountStatus.ACTIVE,
      },
      select: PUBLIC_SELECT,
    });
  }

  async sync(id: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // 微信公众号：调用真实 API
    if (
      account.platform === Platform.WECHAT_OFFICIAL &&
      account.credentials &&
      typeof account.credentials === 'object'
    ) {
      const creds = account.credentials as Record<string, unknown>;
      if (creds.appid && creds.secret) {
        try {
          const adapter = new WechatOfficialAdapter({
            appid: creds.appid as string,
            secret: creds.secret as string,
            rawId: (creds.rawId as string) || account.accountId,
          });
          // 验证并获取 token
          const token = await adapter.getAccessToken();
          // 获取粉丝数
          const followerCount = await adapter.getFollowerCount();
          // 更新数据库
          const updated = await this.prisma.socialAccount.update({
            where: { id },
            data: {
              followerCount: followerCount,
              lastSyncedAt: new Date(),
            },
            select: PUBLIC_SELECT,
          });
          return {
            success: true,
            platform: account.platform,
            accessTokenObtained: !!token,
            followerCount: followerCount,
            account: updated,
          };
        } catch (err) {
          this.logger.warn(`WeChat sync failed for ${id}: ${err.message}`);
          const msg = err.message?.includes('48001') ? '公众号未认证，该功能需要微信认证公众号' : `微信 API 调用失败: ${err.message}`;
          throw new BadRequestException(msg);
        }
      }
    }

    // 其他平台暂不支持实时同步
    return {
      success: false,
      message: `${account.platform} 暂不支持实时同步`,
    };
  }

  async unbind(id: string) {
    await this.get(id);
    await this.prisma.socialAccount.delete({ where: { id } });
    return { deleted: true, id };
  }
}
