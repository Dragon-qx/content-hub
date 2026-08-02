import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ReportConfigDto, ReportFilterDto } from '../dto/report.dto';

const maxLimit = (n: number, ceiling: number) => Math.min(n, ceiling);

/** A draggable field surfaced in the report builder UI. */
export interface ReportField {
  id: string;
  label: string;
  category: 'account' | 'content' | 'engagement' | 'time' | 'dimension';
  type: 'number' | 'string' | 'date' | 'percent';
  description?: string;
}

/** Available fields for building a custom report (PRD §3.5). */
export const REPORT_AVAILABLE_FIELDS: ReportField[] = [
  { id: 'followerCount', label: 'Followers', category: 'account', type: 'number', description: 'Follower count' },
  { id: 'followingCount', label: 'Following', category: 'account', type: 'number', description: 'Following count' },
  { id: 'postCount', label: 'Posts', category: 'account', type: 'number', description: 'Post count' },
  { id: 'impressions', label: 'Impressions', category: 'content', type: 'number', description: 'Impression count' },
  { id: 'engagements', label: 'Engagements', category: 'content', type: 'number', description: 'Engagement count' },
  { id: 'likes', label: 'Likes', category: 'engagement', type: 'number', description: 'Like count' },
  { id: 'comments', label: 'Comments', category: 'engagement', type: 'number', description: 'Comment count' },
  { id: 'shares', label: 'Shares', category: 'engagement', type: 'number', description: 'Share count' },
  { id: 'views', label: 'Views', category: 'engagement', type: 'number', description: 'View count' },
  { id: 'engagementRate', label: 'Eng. rate', category: 'content', type: 'percent', description: 'Engagement rate (%)' },
  { id: 'snapshotDate', label: 'Snapshot date', category: 'time', type: 'date', description: 'Date of snapshot' },
  { id: 'publishedAt', label: 'Published', category: 'time', type: 'date', description: 'Publish time' },
  { id: 'platform', label: 'Platform', category: 'dimension', type: 'string', description: 'Social platform' },
  { id: 'accountName', label: 'Account', category: 'dimension', type: 'string', description: 'Account name' },
  { id: 'contentTitle', label: 'Content', category: 'dimension', type: 'string', description: 'Content title' },
];

/** A single generated row for a custom report. */
export interface ReportRow {
  [key: string]: string | number | null | Date;
}

/** Generated report data payload. */
export interface GeneratedReport {
  fields: ReportField[];
  rows: ReportRow[];
  totalCount: number;
  generatedAt: string;
}

/**
 * Analytics Report Service.
 *
 * Handles custom drag-and-drop report generation, persistence, and retrieval.
 * Extracted from AnalyticsService to keep services focused and maintainable.
 */
@Injectable()
export class AnalyticsReportService {
  private readonly logger = new Logger(AnalyticsReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Return the draggable field list grouped for the report builder UI. */
  getAvailableFields(): { categories: { category: string; fields: ReportField[] }[] } {
    const grouped = new Map<string, ReportField[]>();
    for (const f of REPORT_AVAILABLE_FIELDS) {
      const list = grouped.get(f.category) ?? [];
      list.push(f);
      grouped.set(f.category, list);
    }
    const categories = Array.from(grouped.entries()).map(([category, fields]) => ({
      category,
      fields,
    }));
    return { categories };
  }

  /**
   * Generate a report from the selected fields. Pulls data from both
   * AnalyticsSnapshot (account metrics) and PlatformPost (content metrics).
   */
  async generateReport(
    fieldIds: string[],
    filters?: ReportFilterDto[],
    groupBy?: string,
    sortBy?: string,
    sortDir: 'asc' | 'desc' = 'desc',
    limit = 100,
  ): Promise<GeneratedReport> {
    const fields = REPORT_AVAILABLE_FIELDS.filter((f) => fieldIds.includes(f.id));

    // Pull the latest snapshot per account + their recent posts.
    const accounts = await this.prisma.socialAccount.findMany({
      include: {
        analytics: { orderBy: { snapshotDate: 'desc' }, take: 1 },
      },
    });

    const posts = await this.prisma.platformPost.findMany({
      orderBy: { publishedAt: 'desc' },
      take: maxLimit(limit * 5, 2000),
      include: { content: { select: { title: true } } },
    });

    const rows: ReportRow[] = [];

    // Build a row per post (content-scope) and a per-account summary row.
    for (const post of posts) {
      const metrics = (post.metrics as Record<string, number>) || {};
      const impressions = metrics.impressions ?? 0;
      const likes = metrics.likes ?? 0;
      const comments = metrics.comments ?? 0;
      const shares = metrics.shares ?? 0;
      const engagements = likes + comments + shares;
      const engagementRate = impressions > 0
        ? +((engagements / impressions) * 100).toFixed(2)
        : 0;

      const row: ReportRow = {
        platform: post.platform,
        accountName: '-',
        contentTitle: post.content?.title ?? '(untitled)',
        impressions,
        engagements,
        likes,
        comments,
        shares,
        views: metrics.views ?? 0,
        engagementRate,
        publishedAt: post.publishedAt,
        snapshotDate: null,
        followerCount: null,
        followingCount: null,
        postCount: null,
      };
      rows.push(row);
    }

    // Per-account summary rows
    for (const acc of accounts) {
      const snap = acc.analytics?.[0];
      const row: ReportRow = {
        platform: acc.platform,
        accountName: acc.accountName,
        contentTitle: '-',
        followerCount: snap?.followerCount ?? acc.followerCount ?? 0,
        followingCount: snap?.followingCount ?? acc.followingCount ?? 0,
        postCount: snap?.postCount ?? acc.postCount ?? 0,
        impressions: snap?.impressions ?? 0,
        engagements: snap?.engagements ?? 0,
        likes: snap?.likes ?? 0,
        comments: snap?.comments ?? 0,
        shares: snap?.shares ?? 0,
        views: snap?.views ?? 0,
        engagementRate:
          snap && snap.impressions && snap.impressions > 0
            ? +((snap.engagements ?? 0 / snap.impressions) * 100).toFixed(2)
            : 0,
        snapshotDate: snap?.snapshotDate ?? null,
        publishedAt: null,
      };
      rows.push(row);
    }

    // Apply filters
    let filtered = rows;
    if (filters && filters.length > 0) {
      filtered = rows.filter((row) =>
        filters.every((f) => {
          const val = row[f.field];
          if (val === null || val === undefined) return false;
          switch (f.operator) {
            case 'eq': return String(val) === String(f.value);
            case 'neq': return String(val) !== String(f.value);
            case 'gt': return Number(val) > Number(f.value);
            case 'gte': return Number(val) >= Number(f.value);
            case 'lt': return Number(val) < Number(f.value);
            case 'lte': return Number(val) <= Number(f.value);
            case 'in': return Array.isArray(f.value) && f.value.includes(String(val));
            default: return true;
          }
        }),
      );
    }

    // Group-by: aggregate numeric values for unique values of the group-by field.
    if (groupBy) {
      const groups = new Map<string, ReportRow>();
      for (const row of filtered) {
        const key = String(row[groupBy] ?? 'unknown');
        const existing = groups.get(key);
        if (!existing) {
          groups.set(key, { ...row });
        } else {
          for (const f of fields) {
            if (f.type === 'number' && f.id !== groupBy) {
              const num = Number(row[f.id] ?? 0);
              existing[f.id] = (existing[f.id] as number) + num;
            }
          }
        }
      }
      filtered = Array.from(groups.values());
    }

    // Sort
    const effectiveSortBy = sortBy ?? fieldIds[0];
    if (effectiveSortBy) {
      filtered.sort((a, b) => {
        const av = a[effectiveSortBy];
        const bv = b[effectiveSortBy];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }

    const totalCount = filtered.length;
    filtered = filtered.slice(0, limit);

    return { fields, rows: filtered, totalCount, generatedAt: new Date().toISOString() };
  }

  /** Save or update a custom report configuration. */
  async saveReport(
    teamId: string,
    userId: string,
    config: ReportConfigDto & { id?: string; name: string },
  ) {
    const { id, name, description, fieldIds, filters, groupBy, sortBy, sortDir, limit } = config;
    const data = {
      teamId,
      name,
      description: description ?? null,
      fieldIds: fieldIds as string[],
      filtersJson: JSON.stringify(filters ?? []),
      groupBy: groupBy ?? null,
      sortBy: sortBy ?? null,
      sortDir: sortDir ?? 'desc',
      createdBy: userId,
    };

    if (id) {
      return this.prisma.customReport.update({ where: { id }, data });
    }
    return this.prisma.customReport.create({ data });
  }

  /** List saved reports for a team. */
  listReports(teamId: string) {
    return this.prisma.customReport.findMany({
      where: { teamId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        teamId: true,
        name: true,
        description: true,
        fieldIds: true,
        filtersJson: true,
        groupBy: true,
        sortBy: true,
        sortDir: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Fetch a single saved report. */
  async getReport(reportId: string) {
    const report = await this.prisma.customReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`Report ${reportId} not found`);
    return report;
  }

  /** Delete a saved report. */
  async deleteReport(reportId: string) {
    await this.getReport(reportId); // throws if missing
    await this.prisma.customReport.delete({ where: { id: reportId } });
    return { success: true, deletedId: reportId };
  }
}
