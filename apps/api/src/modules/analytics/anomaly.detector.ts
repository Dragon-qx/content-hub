import { AnalyticsMetric } from './analytics.service';

/**
 * Anomaly detection engine — pure, dependency-free so it can be unit-tested in
 * isolation. Mirrors the PRD §3.5 "异常检测引擎" rules verbatim:
 *
 *   1. 突降告警：某指标较 7 日均值下降 > 50%
 *   2. 突增告警：某指标较 7 日均值上升 > 200%
 *   3. 持续下滑：连续 3 天下降趋势
 *   4. 断崖式下跌：单周期下降 > 80%  (PRD says 单小时; snapshots are daily,
 *      so we apply it between consecutive snapshots)
 *   5. 粉丝异常：单日掉粉 > 粉丝总数 5%
 *
 * The rules are intentionally deterministic thresholds. They run per-metric
 * over a sorted time series of {date, value} points (one per day).
 */

/** A single daily sample of a numeric metric. */
export interface SeriesPoint {
  date: string; // ISO date (YYYY-MM-DD)
  value: number;
}

/** Classification of how severe an anomaly is — drives the UI badge colour. */
export type AnomalySeverity = 'critical' | 'warning';

/** The kind of anomaly detected. */
export type AnomalyType =
  | 'DROP_SPIKE' // 突降告警
  | 'SURGE' // 突增告警
  | 'SUSTAINED_DECLINE' // 持续下滑
  | 'CLIFF_DROP' // 断崖式下跌
  | 'FOLLOWER_LOSS'; // 粉丝异常

/** A detected deviation from the expected trend. */
export interface Anomaly {
  type: AnomalyType;
  metric: AnalyticsMetric;
  severity: AnomalySeverity;
  /** Human-readable message (zh + en) for the UI and notifications. */
  message: string;
  /** The most recent (triggering) value. */
  currentValue: number;
  /** The value it is being compared against (7-day avg or previous point). */
  baselineValue: number;
  /** Signed percentage change vs baseline, e.g. -52 means a 52% drop. */
  changePercent: number;
  /** The date (YYYY-MM-DD) the anomaly was observed on. */
  date: string;
}

// ── Thresholds (kept as named constants so tests + tuning share one source) ──

/** A drop below 50% of the 7-day baseline fires DROP_SPIKE. */
const DROP_SPIKE_FRACTION = 0.5;
/** A rise above 200% (3x) of the 7-day baseline fires SURGE. */
const SURGE_MULTIPLIER = 3.0;
/** Consecutive declining *transitions* needed to fire SUSTAINED_DECLINE.
 *  Three downward transitions span four data points (3 consecutive declines). */
const SUSTAINED_DECLINE_TRANSITIONS = 3;
/** A single-period drop exceeding this fraction fires CLIFF_DROP. */
const CLIFF_DROP_FRACTION = 0.8;
/** A single-day follower loss exceeding this fraction of the total fires FOLLOWER_LOSS. */
const FOLLOWER_LOSS_FRACTION = 0.05;
/** How many trailing points make up the "7-day baseline". */
const BASELINE_WINDOW = 7;
/** Minimum baseline points before we trust the baseline (need a real average). */
const MIN_BASELINE_POINTS = 3;

const pct = (change: number, base: number): number =>
  base > 0 ? Math.round((change / base) * 1000) / 10 : 0;

/** Stable sort by date ascending (handles equal dates deterministically). */
function byDateAsc(a: SeriesPoint, b: SeriesPoint): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/**
 * Detect anomalies for one metric's daily series. Returns zero or more
 * anomalies (a single series can trigger several rules at once).
 */
export function detectAnomaliesForMetric(
  series: SeriesPoint[],
  metric: AnalyticsMetric,
): Anomaly[] {
  const out: Anomaly[] = [];
  if (series.length < 2) return out;

  const sorted = [...series].sort(byDateAsc);
  const latest = sorted[sorted.length - 1];
  const earliest = sorted[0];

  // Baseline = average of the trailing window *excluding* the latest point,
  // so we're comparing today against the recent past.
  const baselineWindow = sorted.slice(
    Math.max(0, sorted.length - 1 - BASELINE_WINDOW),
    sorted.length - 1,
  );
  const baseline =
    baselineWindow.length >= MIN_BASELINE_POINTS
      ? baselineWindow.reduce((acc, p) => acc + (p.value ?? 0), 0) /
        baselineWindow.length
      : NaN;

  const isBaselineValid = Number.isFinite(baseline) && baseline > 0;

  // ── Rule 1 & 2: 7-day baseline drop / surge ──────────────────────────────
  if (isBaselineValid) {
    const changePercent = pct(latest.value - baseline, baseline);
    if (latest.value < baseline * DROP_SPIKE_FRACTION) {
      out.push({
        type: 'DROP_SPIKE',
        metric,
        severity: 'critical',
        message: `${labelFor(metric)}较7日均值下降 ${Math.abs(changePercent)}%，触发突降告警`,
        currentValue: latest.value,
        baselineValue: Math.round(baseline),
        changePercent,
        date: latest.date,
      });
    } else if (latest.value > baseline * SURGE_MULTIPLIER) {
      out.push({
        type: 'SURGE',
        metric,
        severity: 'warning',
        message: `${labelFor(metric)}较7日均值上升 ${changePercent}%，触发突增告警`,
        currentValue: latest.value,
        baselineValue: Math.round(baseline),
        changePercent,
        date: latest.date,
      });
    }
  }

  // ── Rule 4: CLIFF_DROP — single-period drop > 80% ────────────────────────
  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    if (prev.value > 0 && latest.value <= prev.value * (1 - CLIFF_DROP_FRACTION)) {
      const changePercent = pct(latest.value - prev.value, prev.value);
      out.push({
        type: 'CLIFF_DROP',
        metric,
        severity: 'critical',
        message: `${labelFor(metric)}单周期断崖下跌 ${Math.abs(changePercent)}%（${prev.value} → ${latest.value}）`,
        currentValue: latest.value,
        baselineValue: prev.value,
        changePercent,
        date: latest.date,
      });
    }
  }

  // ── Rule 3: SUSTAINED_DECLINE — 3+ consecutive declining transitions ─────
  {
    let transitions = 0; // consecutive downward steps ending at i
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].value < sorted[i - 1].value) transitions += 1;
      else transitions = 0;
    }
    if (transitions >= SUSTAINED_DECLINE_TRANSITIONS) {
      // Compare the end of the run against its start for a concrete percentage.
      const startIdx = sorted.length - 1 - transitions;
      const runStart = sorted[startIdx];
      const changePercent = pct(latest.value - runStart.value, runStart.value);
      out.push({
        type: 'SUSTAINED_DECLINE',
        metric,
        severity: 'warning',
        message: `${labelFor(metric)}连续 ${transitions} 天持续下滑（${runStart.value} → ${latest.value}，${changePercent}%）`,
        currentValue: latest.value,
        baselineValue: runStart.value,
        changePercent,
        date: latest.date,
      });
    }
  }

  // ── Rule 5: FOLLOWER_LOSS — follower-specific single-day loss > 5% ───────
  if (
    metric === 'followerCount' &&
    sorted.length >= 2 &&
    earliest.value > 0
  ) {
    const prev = sorted[sorted.length - 2];
    const loss = prev.value - latest.value;
    if (loss > 0 && loss > prev.value * FOLLOWER_LOSS_FRACTION) {
      const changePercent = pct(-loss, prev.value);
      out.push({
        type: 'FOLLOWER_LOSS',
        metric,
        severity: 'critical',
        message: `粉丝单日掉粉 ${loss}（${Math.abs(changePercent)}%），超过 5% 阈值`,
        currentValue: latest.value,
        baselineValue: prev.value,
        changePercent,
        date: latest.date,
      });
    }
  }

  return out;
}

/** ZH label for a metric (used in messages + the frontend badge). */
export function labelFor(metric: AnalyticsMetric): string {
  const map: Record<AnalyticsMetric, string> = {
    followerCount: '粉丝数',
    followingCount: '关注数',
    postCount: '内容数',
    impressions: '曝光量',
    engagements: '互动量',
    likes: '点赞数',
    comments: '评论数',
    shares: '转发数',
    views: '播放量',
  };
  return map[metric] ?? metric;
}
