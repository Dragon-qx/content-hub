'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Content, AuditLog } from '@/lib/types';

interface DashboardStats {
  totalContent: number;
  pendingApprovals: number;
  scheduledJobs: number;
  recentActivity: AuditLog[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [content, workflow, jobs, audit] = await Promise.all([
          api.get<{ total: number }>('/contents?skip=0&take=1'),
          api.get<{ total: number }>('/workflow?status=PENDING&skip=0&take=1'),
          api.get<{ total: number }>('/scheduler?status=QUEUED&skip=0&take=1'),
          api.get<{ items: AuditLog[] }>('/audit?skip=0&take=8'),
        ]);
        setStats({
          totalContent: content.total,
          pendingApprovals: workflow.total,
          scheduledJobs: jobs.total,
          recentActivity: audit.items,
        });
      } catch {
        setStats({ totalContent: 0, pendingApprovals: 0, scheduledJobs: 0, recentActivity: [] });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cards = [
    { label: 'Total content', value: stats?.totalContent ?? '—' },
    { label: 'Pending approvals', value: stats?.pendingApprovals ?? '—' },
    { label: 'Scheduled jobs', value: stats?.scheduledJobs ?? '—' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your content operations" />
      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {cards.map((c) => (
              <Card key={c.label}>
                <div className="text-sm text-slate-500">{c.label}</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{c.value}</div>
              </Card>
            ))}
          </div>
          <Card className="mt-6">
            <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
            {stats?.recentActivity.length ? (
              <ul className="divide-y divide-slate-100">
                {stats.recentActivity.map((log) => (
                  <li key={log.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">{log.action}</span>
                    <span className="text-slate-400">{log.entityType}:{log.entityId}</span>
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
