'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';

interface Overview {
  followers: { value: number; change: string };
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

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [top, setTop] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [ov, tp] = await Promise.all([
          api.get<Overview>('/analytics/overview?days=30'),
          api.get<{ items: TopItem[] }>('/analytics/top-content?limit=5'),
        ]);
        setOverview(ov);
        setTop(tp.items ?? []);
      } catch {
        setOverview(null);
        setTop([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Performance across your platforms" />

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Followers', value: overview.followers.value, change: overview.followers.change },
              { label: 'Impressions', value: overview.impressions.value, change: overview.impressions.change },
              { label: 'Engagements', value: overview.engagements.value, change: overview.engagements.change },
              { label: 'Eng. rate', value: overview.engagementRate, change: '' },
            ].map((m) => (
              <Card key={m.label}>
                <div className="text-sm text-slate-500">{m.label}</div>
                <div className="mt-2 text-2xl font-semibold">{m.value}</div>
                {m.change && <div className="mt-1 text-xs text-emerald-600">{m.change}</div>}
              </Card>
            ))}
          </div>

          <Card className="mt-6">
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
        </>
      ) : (
        <Card>
          <p className="text-sm text-slate-400">Connect an account to see analytics.</p>
        </Card>
      )}
    </div>
  );
}
