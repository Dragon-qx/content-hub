'use client';

import { useEffect, useState } from 'react';
import { api, downloadFile } from '@/lib/api';
import { Button, Card, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import TrendChart from '@/components/TrendChart';
import {
  AnalyticsMetric,
  ANALYTICS_METRICS,
  METRIC_LABELS,
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

interface TopItem {
  title: string;
  platform: string;
  impressions: number;
  engagements: number;
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
  const [top, setTop] = useState<TopItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [metric, setMetric] = useState<AnalyticsMetric>('impressions');
  const [period, setPeriod] = useState<TrendPeriod>('30d');
  const [trendLoading, setTrendLoading] = useState(false);

  // Overview + top content + platform breakdown.
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [ov, tp, dash] = await Promise.all([
          api.get<Overview>('/analytics/overview?days=30'),
          api.get<{ items: TopItem[] }>('/analytics/top-content?limit=5'),
          api.get<DashboardData>('/analytics/dashboard'),
        ]);
        setOverview(ov);
        setTop(tp.items ?? []);
        setDashboard(dash);
      } catch {
        setOverview(null);
        setTop([]);
        setDashboard(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
        actions={<Button variant="secondary" onClick={exportCsv}>Export CSV</Button>}
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

            {/* Top content */}
            <Card>
              <h2 className="mb-3 text-base font-semibold">Top content</h2>
              {top.length ? (
                <ul className="divide-y divide-slate-100">
                  {top.map((p, i) => (
                    <li key={i} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <div className="font-medium text-slate-700">{p.title}</div>
                        <div className="text-xs text-slate-400">{p.platform}</div>
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
