'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Card, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import TrendChart from '@/components/TrendChart';
import {
  ANALYTICS_METRICS,
  AnalyticsMetric,
  AuditLog,
  HEALTH_TONE,
  METRIC_LABELS,
  TeamHealthSummary,
  TrendPeriod,
  TREND_PERIODS,
} from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Shapes (mirror the un-enveloped analytics/health responses).              */
/* -------------------------------------------------------------------------- */

interface OverviewMetric {
  value: number;
  change: string;
}

interface Overview {
  followers: OverviewMetric;
  impressions: OverviewMetric;
  engagements: OverviewMetric;
  engagementRate: string;
}

interface TopItem {
  title: string;
  platform: string;
  impressions: number;
  engagements: number;
  engagementRate: string;
}

interface HistoryPoint {
  date: string;
  value: number;
}

interface Liveness {
  code: number;
  message: string;
  data: { status: string; service: string; timestamp: string };
}

/* -------------------------------------------------------------------------- */
/*  Small presentational helpers                                              */
/* -------------------------------------------------------------------------- */

function KpiCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string | number;
  change?: string;
}) {
  const negative = change?.startsWith('-');
  return (
    <Card className="p-3 md:p-5">
      <div className="text-xs md:text-sm text-slate-500 truncate">{label}</div>
      <div className="mt-2 text-xl md:text-3xl font-semibold text-slate-900 truncate">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {change && (
        <div
          className={`mt-1 text-xs font-medium ${
            negative ? 'text-red-500' : 'text-emerald-600'
          }`}
        >
          {change} vs prev.
        </div>
      )}
    </Card>
  );
}

const HEALTH_LABEL: Record<string, string> = {
  HEALTHY: 'Healthy',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
};

function HealthPill({ summary }: { summary: TeamHealthSummary | null }) {
  if (!summary) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-300" /> No accounts
      </span>
    );
  }
  const { healthy, warning, critical, total } = summary.totals;
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <Badge tone="success">
        {healthy}/{total} healthy
      </Badge>
      {warning > 0 && <Badge tone="warning">{warning} warning</Badge>}
      {critical > 0 && <Badge tone="danger">{critical} critical</Badge>}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [top, setTop] = useState<TopItem[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [health, setHealth] = useState<TeamHealthSummary | null>(null);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [live, setLive] = useState<Liveness | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<AnalyticsMetric>('impressions');
  const [period, setPeriod] = useState<TrendPeriod>('30d');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      // Resolve the user's team from their accounts so we can surface the
      // account-health rollup. Everything else is independent and runs in
      // parallel.
      const accountsRes = await api.get<{ items: { teamId: string }[] }>(
        '/accounts?skip=0&take=50',
      );
      const teamId = accountsRes.items?.[0]?.teamId;

      const [ov, tp, hist, aud, healthRes] = await Promise.all([
        api.get<Overview>('/analytics/overview?days=30'),
        api.get<{ items: TopItem[] }>('/analytics/top-content?limit=5'),
        api.get<{ data: HistoryPoint[] }>(
          `/analytics/history?metric=${metric}&period=${period}`,
        ),
        api.get<{ items: AuditLog[] }>('/audit?skip=0&take=8'),
        teamId
          ? api.get<TeamHealthSummary>(`/health-monitor/teams/${teamId}`)
          : Promise.resolve(null),
      ]);

      setOverview(ov);
      setTop(tp.items ?? []);
      setHistory(hist.data ?? []);
      setActivity(aud.items ?? []);
      setHealth(healthRes);
    } catch {
      // Surface a graceful empty state rather than a blank screen.
      setOverview(null);
      setTop([]);
      setHistory([]);
      setActivity([]);
      setHealth(null);
    } finally {
      setLoading(false);
      setUpdatedAt(new Date().toLocaleTimeString());
    }
  }, [metric, period]);

  // Liveness probe is independent of the metric/period selectors.
  const ping = useCallback(async () => {
    try {
      const h = await api.get<Liveness>('/health');
      setLive(h);
    } catch {
      setLive(null);
    }
  }, []);

  useEffect(() => {
    load();
    ping();
  }, [load, ping]);

  // Auto-refresh every 30s per DASHBOARD-PRD §1.
  useEffect(() => {
    timer.current = setInterval(() => {
      load();
      ping();
    }, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load, ping]);

  const liveOk = live?.data?.status === 'ok';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        subtitle="Analytics hub — your content operations at a glance"
        actions={
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${
                  liveOk ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              API {liveOk ? 'OK' : 'Down'}
            </span>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load();
                ping();
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 min-h-[44px]"
            >
              Refresh
            </button>
            {updatedAt && (
              <span className="text-xs text-slate-400">Updated {updatedAt}</span>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            <KpiCard
              label="Followers"
              value={overview?.followers.value ?? '—'}
              change={overview?.followers.change}
            />
            <KpiCard
              label="Impressions"
              value={overview?.impressions.value ?? '—'}
              change={overview?.impressions.change}
            />
            <KpiCard
              label="Engagements"
              value={overview?.engagements.value ?? '—'}
              change={overview?.engagements.change}
            />
            <KpiCard label="Eng. rate" value={overview?.engagementRate ?? '—'} />
          </div>

          {/* Trend chart */}
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 md:gap-3">
              <h2 className="text-base font-semibold">Trend</h2>
              <div className="flex gap-2">
                <Select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as AnalyticsMetric)}
                  className="max-w-[180px]"
                >
                  {ANALYTICS_METRICS.map((m) => (
                    <option key={m} value={m}>
                      {METRIC_LABELS[m]}
                    </option>
                  ))}
                </Select>
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  {TREND_PERIODS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-2 text-sm ${
                        period === p
                          ? 'bg-primary text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <TrendChart data={history} height={240} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Top content */}
            <Card>
              <h2 className="mb-3 text-base font-semibold">Top content</h2>
              {top.length ? (
                <ul className="divide-y divide-slate-100">
                  {top.map((item, i) => (
                    <li
                      key={`${item.title}-${i}`}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-slate-700">{item.title}</div>
                        <div className="text-xs text-slate-400">{item.platform}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-slate-700">
                          {item.impressions.toLocaleString()} impr.
                        </div>
                        <div className="text-xs text-slate-400">
                          {item.engagements.toLocaleString()} eng.
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No published content yet.</p>
              )}
            </Card>

            {/* Account health */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Account health</h2>
                <HealthPill summary={health} />
              </div>
              {health?.accounts.length ? (
                <ul className="divide-y divide-slate-100">
                  {health.accounts.slice(0, 6).map((a) => (
                    <li
                      key={a.accountId}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-slate-700">{a.accountName}</div>
                        <div className="text-xs text-slate-400">{a.platform}</div>
                      </div>
                      <Badge tone={HEALTH_TONE[a.health]}>{HEALTH_LABEL[a.health]}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">
                  Bind a platform account to start monitoring health.
                </p>
              )}
            </Card>
          </div>

          {/* Recent activity */}
          <Card>
            <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
            {activity.length ? (
              <ul className="divide-y divide-slate-100">
                {activity.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-slate-700">{log.action}</span>
                    <span className="text-slate-400">
                      {log.entityType}:{log.entityId}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No recent activity.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
