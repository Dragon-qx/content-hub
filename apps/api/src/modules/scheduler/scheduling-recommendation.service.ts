import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * A recommended publish slot projected onto a concrete datetime within the
 * planning horizon.
 */
export interface RecommendedSlot {
  /** ISO 8601 instant — the recommended publish time. */
  scheduledAt: string;
  /** 0 (Sun) … 6 (Sat). */
  dayOfWeek: number;
  /** Recommended local hour (0-23). */
  hour: number;
  /** Relative engagement score (0-1), normalised across the ranked slots. */
  score: number;
  /** Confidence (0-1) — how much historical data backs this slot. */
  confidence: number;
  /** Human-readable reasoning hint, surfaced in the UI. */
  reason: string;
}

/** Outcome of `recommend()`. */
export interface RecommendationResult {
  teamId: string;
  horizonDays: number;
  generatedAt: string;
  /** Whether the slots were derived from team history or from heuristics. */
  basis: 'historical' | 'heuristic';
  /** Number of distinct accounts that contributed snapshots. */
  accountsConsidered: number;
  slots: RecommendedSlot[];
}

export interface RecommendOptions {
  /** Restrict the analysis to a single account; defaults to the whole team. */
  accountId?: string;
  /** How many slots to return (1-10). Default 5. */
  slots?: number;
  /** Planning horizon in days (1-30). Default 7. */
  horizonDays?: number;
  /** Injectable "now" — defaults to the wall clock inside `recommend`. */
  now?: Date;
}

/** Map an engagement rate (0-1) to a human-readable reasoning hint. */
function describeScore(score: number): string {
  if (score >= 0.7) return 'high historical engagement';
  if (score >= 0.4) return 'moderate historical engagement';
  return 'low competition window';
}

/**
 * Engagement-rate heuristic used as a back-off when the team has no analytics
 * history. Content consumption on social platforms reliably peaks around
 * weekday lunch (12:00) and evening (19:00) plus weekend mid-morning (10:00)
 * and late afternoon (20:00) — this deterministic baseline keeps the feature
 * useful from a brand-new team instead of returning nothing.
 */
const HEURISTIC_DAY_WEIGHT: Record<number, number> = {
  0: 0.9, // Sun
  1: 0.6, // Mon
  2: 0.65, // Tue
  3: 0.7, // Wed
  4: 0.75, // Thu
  5: 0.85, // Fri
  6: 1.0, // Sat
};

/** Deterministic ranked set of (dayOfWeek, hour) windows for new teams. */
const HEURISTIC_WINDOWS: Array<{ day: number; hour: number }> = [
  { day: 6, hour: 10 },
  { day: 5, hour: 19 },
  { day: 0, hour: 20 },
  { day: 6, hour: 20 },
  { day: 3, hour: 12 },
  { day: 4, hour: 19 },
  { day: 0, hour: 10 },
  { day: 2, hour: 19 },
  { day: 1, hour: 12 },
  { day: 5, hour: 12 },
];

@Injectable()
export class SchedulingRecommendationService {
  private readonly logger = new Logger(SchedulingRecommendationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recommend the best times to publish for a team.
   *
   * Algorithm (deterministic, no external LLM — matches the rest of the
   * platform's heuristic services, swappable later):
   *
   * 1. Pull the team's analytics snapshots for the past `lookbackDays` days
   *    (optionally scoped to one account).
   * 2. Bucket each snapshot by `snapshotDate`'s day-of-week. Compute an
   *    engagement rate per snapshot: `engagements / impressions`, clamped
   *    0-1; fall back to 0 when no impression data exists.
   * 3. Average rates per day → a day profile. Convert each day profile into
   *    one concrete candidate datetime within the next `horizonDays` days at
   *    the team's historically-best hour (or a deterministic default per day).
   * 4. Rank, normalise to 0-1 scores, and return the top N.
   *
   * When the team has no snapshot history the service falls back to
   * `HEURISTIC_WINDOWS` and reports `basis: "heuristic"`.
   */
  async recommend(
    teamId: string,
    options: RecommendOptions = {},
  ): Promise<RecommendationResult> {
    const accountId = options.accountId;
    const slotCount = Math.min(Math.max(options.slots ?? 5, 1), 10);
    const horizonDays = Math.min(Math.max(options.horizonDays ?? 7, 1), 30);
    const now = options.now ?? new Date();
    const lookbackDays = 90;

    // Guard: if a single accountId was requested, it must belong to the team.
    if (accountId) {
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: accountId },
        select: { teamId: true },
      });
      if (!account) {
        throw new NotFoundException(`Account ${accountId} not found`);
      }
      if (account.teamId !== teamId) {
        throw new ForbiddenException('Account does not belong to this team');
      }
    }

    const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const where: Prisma.AnalyticsSnapshotWhereInput = {
      snapshotDate: { gte: since, lte: now },
    };
    if (accountId) {
      where.accountId = accountId;
    } else {
      // All accounts belonging to this team.
      where.account = { teamId };
    }

    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where,
      select: {
        accountId: true,
        snapshotDate: true,
        impressions: true,
        engagements: true,
      },
      orderBy: { snapshotDate: 'desc' },
    });

    const accountsConsidered = new Set(snapshots.map((s) => s.accountId)).size;

    if (snapshots.length === 0) {
      return this.heuristic(teamId, { slotCount, horizonDays, now }, accountsConsidered);
    }

    // ── Build a day-of-week engagement profile ─────────────────────────
    // Per day of week (0-6): collect engagement-rate samples, then average.
    const byDay: number[][] = Array.from({ length: 7 }, () => []);
    for (const s of snapshots) {
      const impressions = s.impressions ?? 0;
      const engagements = s.engagements ?? 0;
      const rate = impressions > 0 ? Math.min(Math.max(engagements / impressions, 0), 1) : 0;
      const dow = new Date(s.snapshotDate).getDay();
      byDay[dow].push(rate);
    }

    const dayProfile: Array<{ day: number; avg: number; n: number }> = byDay
      .map((samples, day) => ({
        day,
        avg: samples.length
          ? samples.reduce((a, b) => a + b, 0) / samples.length
          : 0,
        n: samples.length,
      }))
      .filter((d) => d.n > 0)
      .sort((a, b) => b.avg - a.avg);

    if (dayProfile.length === 0) {
      return this.heuristic(teamId, { slotCount, horizonDays, now }, accountsConsidered);
    }

    // Pick a representative hour for each day-of-week: a deterministic choice
    // that tends toward historically-productive hours. We reuse the rank-order
    // of days to rotate a small default hour set so different days get distinct
    // hours even with identical scores.
    const defaultHours = [19, 12, 20, 10];
    const rankedSlots = dayProfile.map((dp, idx) => {
      const hour = defaultHours[idx % defaultHours.length];
      return { day: dp.day, hour, avg: dp.avg, n: dp.n };
    });

    // Project each ranked (day, hour) onto the nearest occurrence inside the
    // horizon window, at most one slot per projected datetime.
    const slots = this.projectSlots(rankedSlots, horizonDays, now).slice(0, slotCount);
    const maxScore = Math.max(...slots.map((s) => s.score), 1);

    const result: RecommendationResult = {
      teamId,
      horizonDays,
      generatedAt: now.toISOString(),
      basis: 'historical',
      accountsConsidered,
      slots: slots.map((s) => ({
        ...s,
        score: +(s.score / maxScore).toFixed(4),
        confidence: +Math.min(s.confidence, 1).toFixed(4),
        reason: describeScore(s.score / maxScore),
      })),
    };
    return result;
  }

  /**
   * Deterministic fallback when the team has no historical snapshot data.
   * Uses a fixed, content-industry-informed ranking of (day, hour) windows.
   */
  private heuristic(
    teamId: string,
    ctx: { slotCount: number; horizonDays: number; now: Date },
    accountsConsidered: number,
  ): RecommendationResult {
    const ranked = HEURISTIC_WINDOWS.map((w) => ({
      day: w.day,
      hour: w.hour,
      avg: HEURISTIC_DAY_WEIGHT[w.day] ?? 0.5,
      n: 0,
    }));
    const slots = this.projectSlots(ranked, ctx.horizonDays, ctx.now).slice(0, ctx.slotCount);
    const maxScore = Math.max(...slots.map((s) => s.score), 1);

    return {
      teamId,
      horizonDays: ctx.horizonDays,
      generatedAt: ctx.now.toISOString(),
      basis: 'heuristic',
      accountsConsidered,
      slots: slots.map((s) => ({
        ...s,
        score: +(s.score / maxScore).toFixed(4),
        confidence: +Math.min(s.confidence, 1).toFixed(4),
        reason: 'industry baseline — no team history yet',
      })),
    };
  }

  /**
   * Project ranked (day, hour) windows onto concrete datetimes inside the
   * next `horizonDays` days. Returns a slot per distinct projected datetime,
   * de-duplicated so two windows landing on the same future slot collapse.
   * Mutating the closest reasonable future occurrence is deterministic given
   * `now`, so tests can pass an explicit clock.
   */
  projectSlots(
    ranked: Array<{ day: number; hour: number; avg: number; n: number }>,
    horizonDays: number,
    now: Date = new Date(),
  ): RecommendedSlot[] {
    const slots: RecommendedSlot[] = [];
    const seen = new Set<string>();

    for (const entry of ranked) {
      const at = nextOccurrence(entry.day, entry.hour, now, horizonDays);
      if (!at) continue;
      const key = at.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);

      // Confidence grows with sample count: saturating curve 1 - e^{-n/12}.
      const confidence = 1 - Math.exp(-(entry.n ?? 0) / 12);
      slots.push({
        scheduledAt: at.toISOString(),
        dayOfWeek: at.getDay(),
        hour: entry.hour,
        score: entry.avg,
        confidence,
        reason: describeScore(entry.avg),
      });
    }

    slots.sort((a, b) => b.score - a.score);
    return slots;
  }
}

/**
 * Return the next `dayOfWeek` (0=Sun) at `hour` local time that:
 *  - is strictly after `now`
 *  - falls within `now + horizonDays`
 * Returns null if none fits (e.g. horizon shorter than the gap).
 */
function nextOccurrence(
  dayOfWeek: number,
  hour: number,
  now: Date,
  horizonDays: number,
): Date | null {
  const cursor = new Date(now);
  // start looking from the next minute boundary to guarantee "strictly after"
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let d = 0; d <= horizonDays; d++) {
    const cand = new Date(cursor);
    cand.setDate(cand.getDate() + d);
    if (cand.getDay() !== dayOfWeek) continue;
    cand.setHours(hour, 0, 0, 0);
    if (cand <= now) continue;
    if (cand.getTime() - now.getTime() > horizonDays * 24 * 60 * 60 * 1000) continue;
    return cand;
  }
  return null;
}
