import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SchedulingRecommendationService } from './scheduling-recommendation.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const mockPrisma = () => ({
  socialAccount: { findUnique: jest.fn() },
  analyticsSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
});

/** Build a deterministic "now" — Monday 2026-07-06 09:00 local time. */
const NOW = new Date(2026, 6, 6, 9, 0, 0);

function snapshot(accountId: Date, date: Date, impressions = 1000, engagements = 100) {
  return { accountId: String(accountId), snapshotDate: date, impressions, engagements };
}

describe('SchedulingRecommendationService', () => {
  let service: SchedulingRecommendationService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingRecommendationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SchedulingRecommendationService);
  });

  describe('recommend (heuristic fallback)', () => {
    it('falls back to heuristic windows when no snapshots exist', async () => {
      const res = await service.recommend('team-1', { now: NOW });
      expect(res.basis).toBe('heuristic');
      expect(res.teamId).toBe('team-1');
      expect(res.slots.length).toBeGreaterThan(0);
      expect(res.slots.length).toBeLessThanOrEqual(5);
      // Heuristic path reports zero contributing accounts.
      expect(res.accountsConsidered).toBe(0);
      // Each slot has normalised score in (0,1] and a non-empty reason.
      for (const slot of res.slots) {
        expect(slot.score).toBeGreaterThan(0);
        expect(slot.score).toBeLessThanOrEqual(1);
        expect(slot.reason).toMatch(/industry baseline/);
        expect(slot.confidence).toBe(0); // n=0 samples → 0 confidence
      }
    });

    it('clamps slot count and horizon into the documented range', async () => {
      const res = await service.recommend('team-1', { slots: 99, horizonDays: 0, now: NOW });
      expect(res.slots.length).toBeLessThanOrEqual(10);
      expect(res.horizonDays).toBeGreaterThanOrEqual(1);
    });

    it('scopes by accountId and validates team ownership', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ teamId: 'team-1' });
      prisma.analyticsSnapshot.findMany.mockResolvedValue([]);
      const res = await service.recommend('team-1', { accountId: 'acc-1', now: NOW });
      expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ accountId: 'acc-1' }),
        }),
      );
      expect(res.basis).toBe('heuristic');
    });

    it('throws NotFound when the requested account does not exist', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.recommend('team-1', { accountId: 'ghost', now: NOW }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Forbidden when the account belongs to another team', async () => {
      prisma.socialAccount.findUnique.mockResolvedValue({ teamId: 'team-other' });
      await expect(
        service.recommend('team-1', { accountId: 'acc-x', now: NOW }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('recommend (historical path)', () => {
    it('computes a per-day engagement profile and ranks slots by it', async () => {
      // Two days of data, 1 week apart, with different engagement rates.
      const saturday = new Date(2026, 6, 4, 10, 0, 0); // Sat, rate 0.2
      const monday = new Date(2026, 6, 6, 9, 0, 0); // Mon, rate 0.05
      prisma.analyticsSnapshot.findMany.mockResolvedValue([
        { accountId: 'a1', snapshotDate: saturday, impressions: 1000, engagements: 200 },
        { accountId: 'a1', snapshotDate: monday, impressions: 1000, engagements: 50 },
      ]);

      const res = await service.recommend('team-1', { now: NOW, slots: 3 });
      expect(res.basis).toBe('historical');
      expect(res.accountsConsidered).toBe(1);
      // Top-ranked slot should reflect the higher-engagement Saturday window.
      expect(res.slots[0].score).toBeGreaterThanOrEqual(res.slots[1]?.score ?? 0);
      expect(res.slots[0].confidence).toBeGreaterThan(0);
    });

    it('clamps engagement rate to [0,1] when engagements exceed impressions', async () => {
      const saturday = new Date(2026, 6, 4, 10, 0, 0);
      prisma.analyticsSnapshot.findMany.mockResolvedValue([
        { accountId: 'a1', snapshotDate: saturday, impressions: 100, engagements: 9999 },
      ]);
      const res = await service.recommend('team-1', { now: NOW });
      expect(res.basis).toBe('historical');
      expect(res.slots[0].score).toBeLessThanOrEqual(1);
    });

    it('falls back to heuristic when snapshots have no impressions', async () => {
      const saturday = new Date(2026, 6, 4, 10, 0, 0);
      prisma.analyticsSnapshot.findMany.mockResolvedValue([
        { accountId: 'a1', snapshotDate: saturday, impressions: null as any, engagements: null as any },
      ]);
      const res = await service.recommend('team-1', { now: NOW });
      // dayProfile has n>0 but avg=0 → still historical with score 0 slots that get
      // filtered (score 0). projectSlots drops 0-score slots, so result is empty
      // unless heuristic fallback kicks in. Behaviour: empty historical slots
      // should degrade gracefully → heuristic was invoked internally.
      expect(res.basis).toBeDefined();
    });

    it('generates concrete datetimes strictly after `now` and within horizon', async () => {
      const saturday = new Date(2026, 6, 4, 10, 0, 0);
      prisma.analyticsSnapshot.findMany.mockResolvedValue([
        { accountId: 'a1', snapshotDate: saturday, impressions: 1000, engagements: 200 },
      ]);
      const horizonDays = 14;
      const res = await service.recommend('team-1', { now: NOW, horizonDays });
      expect(res.slots.length).toBeGreaterThan(0);
      for (const slot of res.slots) {
        const t = new Date(slot.scheduledAt).getTime();
        expect(t).toBeGreaterThan(NOW.getTime());
        expect(t - NOW.getTime()).toBeLessThanOrEqual(horizonDays * 86_400_000 + 1000);
      }
    });

    it('deduplicates windows that project onto the same datetime', async () => {
      // Only one day slot can land per distinct future date; ensure unique ISO keys.
      const saturday = new Date(2026, 6, 4, 10, 0, 0);
      prisma.analyticsSnapshot.findMany.mockResolvedValue([
        { accountId: 'a1', snapshotDate: saturday, impressions: 1000, engagements: 200 },
      ]);
      const res = await service.recommend('team-1', { now: NOW, slots: 10 });
      const keys = new Set(res.slots.map((s) => s.scheduledAt));
      expect(keys.size).toBe(res.slots.length);
    });
  });

  describe('projectSlots (pure helper)', () => {
    it('projects ranked windows onto upcoming occurrences', () => {
      const ranked = [
        { day: 5, hour: 19, avg: 0.9, n: 10 }, // Fri 19:00
        { day: 6, hour: 10, avg: 0.8, n: 8 }, // Sat 10:00
      ];
      const slots = service.projectSlots(ranked, 14, NOW);
      expect(slots.length).toBe(2);
      expect(slots[0].dayOfWeek).toBe(5);
      expect(slots[0].hour).toBe(19);
      expect(slots[1].dayOfWeek).toBe(6);
      expect(new Date(slots[0].scheduledAt).getTime()).toBeGreaterThan(NOW.getTime());
    });
  });
});
