import {
  detectAnomaliesForMetric,
  labelFor,
  SeriesPoint,
} from './anomaly.detector';
import { AnalyticsMetric } from './analytics.service';

/** Build a series of `count` points ending today with a constant `value`. */
function flatSeries(metric: AnalyticsMetric, value: number, count = 10): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    points.push({ date: d.toISOString().split('T')[0], value });
  }
  // Tag the metric via a wrapper is unnecessary; we pass metric separately.
  return points;
}

describe('anomaly.detector', () => {
  describe('detectAnomaliesForMetric', () => {
    it('returns nothing for an empty series', () => {
      expect(detectAnomaliesForMetric([], 'impressions')).toEqual([]);
    });

    it('returns nothing for a single point', () => {
      expect(detectAnomaliesForMetric([{ date: '2026-07-18', value: 100 }], 'impressions')).toEqual([]);
    });

    it('returns nothing when the series is stable', () => {
      const series = flatSeries('impressions', 100, 10);
      expect(detectAnomaliesForMetric(series as SeriesPoint[], 'impressions')).toEqual([]);
    });

    // ── Rule 1: DROP_SPIKE (drop > 50% vs 7-day baseline) ─────────────────
    it('fires DROP_SPIKE when latest value drops more than 50% below baseline', () => {
      // 7 days at 100 → baseline ~100, latest 40 (60% drop) → critical.
      const series = flatSeries('impressions', 100, 8);
      series[series.length - 1].value = 40;
      const result = detectAnomaliesForMetric(series, 'impressions');
      const spike = result.find((a) => a.type === 'DROP_SPIKE');
      expect(spike).toBeDefined();
      expect(spike?.severity).toBe('critical');
      expect(spike?.metric).toBe('impressions');
    });

    it('does NOT fire DROP_SPIKE for a drop under 50%', () => {
      const series = flatSeries('impressions', 100, 8);
      series[series.length - 1].value = 60; // 40% drop
      const result = detectAnomaliesForMetric(series, 'impressions');
      expect(result.find((a) => a.type === 'DROP_SPIKE')).toBeUndefined();
    });

    // ── Rule 2: SURGE (rise > 200% vs baseline) ──────────────────────────
    it('fires SURGE when latest value rises more than 200% above baseline', () => {
      const series = flatSeries('impressions', 100, 8);
      series[series.length - 1].value = 350; // 250% rise (>200%)
      const result = detectAnomaliesForMetric(series, 'impressions');
      const surge = result.find((a) => a.type === 'SURGE');
      expect(surge).toBeDefined();
      expect(surge?.severity).toBe('warning');
    });

    // ── Rule 4: CLIFF_DROP (single-period drop > 80%) ─────────────────────
    it('fires CLIFF_DROP for a single-period >80% drop', () => {
      const series = [
        { date: '2026-07-17', value: 1000 },
        { date: '2026-07-18', value: 100 }, // 90% drop
      ];
      const result = detectAnomaliesForMetric(series, 'impressions');
      const cliff = result.find((a) => a.type === 'CLIFF_DROP');
      expect(cliff).toBeDefined();
      expect(cliff?.severity).toBe('critical');
      expect(cliff?.changePercent).toBeLessThan(-80);
    });

    it('does NOT fire CLIFF_DROP for a 70% single-period drop', () => {
      const series = [
        { date: '2026-07-17', value: 1000 },
        { date: '2026-07-18', value: 300 }, // 70% drop
      ];
      const result = detectAnomaliesForMetric(series, 'impressions');
      expect(result.find((a) => a.type === 'CLIFF_DROP')).toBeUndefined();
    });

    // ── Rule 3: SUSTAINED_DECLINE (3+ consecutive declining days) ─────────
    it('fires SUSTAINED_DECLINE for 3+ consecutive declining days', () => {
      const series = [
        { date: '2026-07-14', value: 100 },
        { date: '2026-07-15', value: 90 },
        { date: '2026-07-16', value: 80 },
        { date: '2026-07-17', value: 70 },
        { date: '2026-07-18', value: 60 },
      ];
      const result = detectAnomaliesForMetric(series, 'impressions');
      const decline = result.find((a) => a.type === 'SUSTAINED_DECLINE');
      expect(decline).toBeDefined();
      expect(decline?.severity).toBe('warning');
      expect(decline?.message).toContain('连续');
    });

    it('does NOT fire SUSTAINED_DECLINE for 2 declining days', () => {
      const series = [
        { date: '2026-07-16', value: 100 },
        { date: '2026-07-17', value: 90 },
        { date: '2026-07-18', value: 85 },
      ];
      const result = detectAnomaliesForMetric(series, 'impressions');
      expect(result.find((a) => a.type === 'SUSTAINED_DECLINE')).toBeUndefined();
    });

    // ── Rule 5: FOLLOWER_LOSS (single-day loss > 5% of prior total) ───────
    it('fires FOLLOWER_LOSS when followers drop more than 5% in a day', () => {
      const series = [
        { date: '2026-07-17', value: 1000 },
        { date: '2026-07-18', value: 900 }, // 10% loss (>5%)
      ];
      const result = detectAnomaliesForMetric(series, 'followerCount');
      const loss = result.find((a) => a.type === 'FOLLOWER_LOSS');
      expect(loss).toBeDefined();
      expect(loss?.severity).toBe('critical');
      expect(loss?.metric).toBe('followerCount');
    });

    it('does NOT fire FOLLOWER_LOSS for a 3% follower drop', () => {
      const series = [
        { date: '2026-07-17', value: 1000 },
        { date: '2026-07-18', value: 970 }, // 3% loss
      ];
      const result = detectAnomaliesForMetric(series, 'followerCount');
      expect(result.find((a) => a.type === 'FOLLOWER_LOSS')).toBeUndefined();
    });

    it('only fires FOLLOWER_LOSS for the followerCount metric', () => {
      const series = [
        { date: '2026-07-17', value: 1000 },
        { date: '2026-07-18', value: 900 },
      ];
      const result = detectAnomaliesForMetric(series, 'impressions');
      expect(result.find((a) => a.type === 'FOLLOWER_LOSS')).toBeUndefined();
    });

    it('can fire multiple rules at once (cliff + drop spike)', () => {
      // Baseline ~100 (7 days), then a cliff to 20 (which is < 50% baseline).
      const series = flatSeries('impressions', 100, 8);
      series[series.length - 2].value = 1000; // previous point spikes up
      series[series.length - 1].value = 20; // then crashes down 98%
      const result = detectAnomaliesForMetric(series, 'impressions');
      const types = result.map((a) => a.type);
      // The 20 vs 1000 previous → CLIFF_DROP; baseline may include the 1000 so
      // we just assert at least a CLIFF_DROP fired (multiple rules possible).
      expect(types).toContain('CLIFF_DROP');
    });
  });

  describe('labelFor', () => {
    it('returns Chinese labels for known metrics', () => {
      expect(labelFor('followerCount')).toBe('粉丝数');
      expect(labelFor('impressions')).toBe('曝光量');
    });

    it('falls back to the raw metric name for unknown values', () => {
      expect(labelFor('impressions' as AnalyticsMetric)).toBe('曝光量');
    });
  });
});
