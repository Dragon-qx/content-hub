'use client';

import { useEffect, useState } from 'react';
import { api, downloadFile } from '@/lib/api';
import { Badge, Button, Card, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import TrendChart from '@/components/TrendChart';
import {
  AnalyticsMetric,
  ANALYTICS_METRICS,
  Anomaly,
  ANOMALY_SEVERITY_TONE,
  ANOMALY_TYPE_LABELS,
  ContentRanking,
  CONTENT_TIER_LABELS,
  CONTENT_TIER_TONE,
  METRIC_LABELS,
  TopContentView,
  TrendPeriod,
  TREND_PERIODS,
} from '@/lib/types';

interface Overview {
  followers: { value: number; change: string };
  following: { value: number; change: string };
  impressions: { value: number; change: string };
  engagements: { value: number; change: string };
  engagementRate: string;
}

interface PlatformBreakdown {
  platform: string;
  followers: number;
  percentage: number;
}

interface DashboardData {
  totalFollowers: number;
  platformBreakdown: PlatformBreakdown[];
}

interface HistoryPoint {
  date: string;
  value: number;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ranking, setRanking] = useState<ContentRanking | null>(null);
  const [rankView, setRankView] = useState<TopContentView>('top');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [metric, setMetric] = useState<AnalyticsMetric>('impressions');
  const [period, setPeriod] = useState<TrendPeriod>('30d');
  const [trendLoading, setTrendLoading] = useState(false);

  // Anomaly detection results (PRD §3.5) — scanned on demand / on load.
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyError, setAnomalyError] = useState<string | null>(null);

  const scanAnomalies = async () => {
    setAnomalyLoading(true);
    setAnomalyError(null);
    try {
      const res = await api.post<{
        scanned?: number;
        results?: { accountId: string; anomalies: number }[];
        anomalies?: Anomaly[];
      }>('/analytics/anomalies/scan', { notify: false });
      // A single-account scan returns anomalies inline; a full scan returns a
      // summary. There is no single combined list for "all accounts", so we
      // surface the count and keep any inline anomalies.
      const inline = res.anomalies ?? [];
      setAnomalies(inline);
      if (!res.anomalies && res.results) {
        setAnomalyError(
          `Scanned ${res.scanned ?? 0} account(s). Run per-account to view details.`,
        );
      }
    } catch {
      setAnomalyError('Anomaly scan failed');
      setAnomalies([]);
    } finally {
      setAnomalyLoading(false);
    }
  };

  // Overview + top content + platform breakdown.
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [ov, rank, dash] = await Promise.all([
          api.get<Overview>('/analytics/overview?days=30'),
          api.get<ContentRanking>('/analytics/top-content?limit=10&view=top'),
          api.get<DashboardData>('/analytics/dashboard'),
        ]);
        setOverview(ov);
        setRanking(rank);
        setDashboard(dash);
      } catch {
        setOverview(null);
        setRanking(null);
        setDashboard(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Reload the ranking when the Top/Bottom view toggle changes.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<ContentRanking>(
          `/analytics/top-content?limit=10&view=${rankView}`,
        );
        setRanking(res);
      } catch {
        setRanking(null);
      }
    };
    load();
  }, [rankView]);

  // Trend data — reloads when the metric or period changes.
  useEffect(() => {
    const load = async () => {
      setTrendLoading(true);
      try {
        const res = await api.get<{ data: HistoryPoint[] }>(
          `/analytics/history?metric=${metric}&period=${period}`,
        );
        setHistory(res.data ?? []);
      } catch {
        setHistory([]);
      } finally {
        setTrendLoading(false);
      }
    };
    load();
  }, [metric, period]);

  const exportCsv = async () => {
    await downloadFile(`/analytics/history/export?metric=${metric}&period=${period}`, `analytics-${metric}-${period}.csv`);
  };

  const maxPlatform = dashboard?.platformBreakdown
    ? Math.max(...dashboard.platformBreakdown.map((p) => p.followers), 1)
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        subtitle="Performance across your platforms"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={scanAnomalies} disabled={anomalyLoading}>
              {anomalyLoading ? 'Scanning…' : 'Scan anomalies'}
            </Button>
            <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          </div>
        }
      />

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : overview ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Followers', value: overview.followers.value, change: overview.followers.change },
              { label: 'Impressions', value: overview.impressions.value, change: overview.impressions.change },
              { label: 'Engagements', value: overview.engagements.value, change: overview.engagements.change },
              { label: 'Eng. rate', value: overview.engagementRate, change: '' },
            ].map((m) => (
              <Card key={m.label}>
                <div className="text-sm text-slate-500">{m.label}</div>
                <div className="mt-2 text-2xl font-semibold">{m.value.toLocaleString()}</div>
                {m.change && (
                  <div className={`mt-1 text-xs ${m.change.startsWith('-') ? 'text-red-500' : 'text-emerald-600'}`}>
                    {m.change} vs prev.
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Anomaly detection panel (PRD §3.5) */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Anomaly detection</h2>
                {anomalies.length > 0 && (
                  <Badge tone="danger">{anomalies.length} firing</Badge>
                )}
              </div>
              <Button variant="ghost" onClick={scanAnomalies} disabled={anomalyLoading}>
                {anomalyLoading ? 'Scanning…' : 'Refresh'}
              </Button>
            </div>
            {anomalyError && !anomalies.length ? (
              <p className="text-sm text-slate-400">{anomalyError}</p>
            ) : anomalies.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {anomalies.map((a, i) => (
                  <li
                    key={`${a.type}-${a.metric}-${i}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone={ANOMALY_SEVERITY_TONE[a.severity]}>
                        {ANOMALY_TYPE_LABELS[a.type]}
                      </Badge>
                      <span className="text-slate-700">{a.message}</span>
                    </div>
                    <span
                      className={`shrink-0 text-xs ${
                        a.changePercent < 0 ? 'text-red-500' : 'text-emerald-600'
                      }`}
                    >
                      {a.changePercent > 0 ? '+' : ''}
                      {a.changePercent}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">
                No anomalies detected. Run a scan to analyse recent metric history.
              </p>
            )}
          </Card>

          {/* Trend chart with selectors */}
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Trend</h2>
              <div className="flex gap-2">
                <Select value={metric} onChange={(e) => setMetric(e.target.value as AnalyticsMetric)} className="max-w-[180px]">
                  {ANALYTICS_METRICS.map((m) => (
                    <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                  ))}
                </Select>
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  {TREND_PERIODS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-2 text-sm ${period === p ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {trendLoading ? (
              <div className="text-sm text-slate-400">Loading trend…</div>
            ) : (
              <TrendChart data={history} height={240} />
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Platform breakdown */}
            <Card>
              <h2 className="mb-3 text-base font-semibold">Platform breakdown</h2>
              {dashboard?.platformBreakdown?.length ? (
                <div className="flex flex-col gap-3">
                  {dashboard.platformBreakdown.map((p) => (
                    <div key={p.platform}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-slate-700">{p.platform}</span>
                        <span className="text-slate-500">
                          {p.followers.toLocaleString()} ({p.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((p.followers / maxPlatform) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No platform data yet.</p>
              )}
            </Card>

            {/* Content ranking — Top / Bottom auto-marking (PRD §3.5) */}
            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">Content ranking</h2>
                  {ranking && (
                    <Badge tone="neutral">
                      {ranking.summary.top}/{ranking.summary.mid}/{ranking.summary.bottom} top/mid/low
                    </Badge>
                  )}
                </div>
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  {(['top', 'bottom'] as TopContentView[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setRankView(v)}
                      className={`px-3 py-1.5 text-xs font-medium ${
                        rankView === v
                          ? 'bg-primary text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {v === 'top' ? 'Top' : 'Bottom'}
                    </button>
                  ))}
                </div>
              </div>
              {ranking?.items.length ? (
                <ul className="divide-y divide-slate-100">
                  {ranking.items.map((p) => (
                    <li
                      key={p.contentId}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-right text-xs text-slate-400">#{p.rank}</span>
                        <Badge tone={CONTENT_TIER_TONE[p.tier]}>
                          {CONTENT_TIER_LABELS[p.tier]}
                        </Badge>
                        <div>
                          <div className="font-medium text-slate-700">{p.title}</div>
                          <div className="text-xs text-slate-400">{p.platform}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div>{p.impressions.toLocaleString()} imp</div>
                        <div className="text-xs text-slate-400">{p.engagementRate}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No published content yet.</p>
              )}
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <p className="text-sm text-slate-400">Connect an account to see analytics.</p>
        </Card>
      )}
    </div>
  );
}
