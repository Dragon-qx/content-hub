'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Card, Input, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import {
  HEALTH_TONE,
  PLATFORMS,
  Paginated,
  SocialAccount,
  TeamHealthSummary,
} from '@/lib/types';

export default function AccountsPage() {
  const [rows, setRows] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [platform, setPlatform] = useState('WECHAT_OFFICIAL');
  const [accountId, setAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [appid, setAppid] = useState('');
  const [secret, setSecret] = useState('');
  const [teamId, setTeamId] = useState('default-team');

  // Health monitoring (PRD §3.2).
  const [health, setHealth] = useState<TeamHealthSummary | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Paginated<SocialAccount>>(
        '/accounts?skip=0&take=50',
      );
      setRows(res.items);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const res = await api.get<TeamHealthSummary>(
        `/health-monitor/teams/${teamId}`,
      );
      setHealth(res);
    } catch {
      setHealth(null);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/accounts', {
        teamId,
        platform,
        accountId,
        accountName,
        appid,
        secret,
      });
      setShowForm(false);
      setAccountId('');
      setAccountName('');
      setAppid('');
      setSecret('');
      await load();
      await loadHealth();
    } finally {
      setSubmitting(false);
    }
  };

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      // POST /health-monitor/teams/:teamId/run evaluates the team and broadcasts
      // an in-app notification for every degraded account.
      const res = await api.post<{ notified: number }>(
        `/health-monitor/teams/${teamId}/run`,
      );
      await loadHealth();
      if (res.notified > 0) {
        // Surface in the banner so the user sees the check did something.
        alert(`Health check complete: ${res.notified} account(s) need attention. Team notified.`);
      } else {
        alert('Health check complete: all accounts healthy.');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Bind and manage social platform accounts"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={runHealthCheck} disabled={checking}>
              {checking ? 'Checking…' : 'Run health check'}
            </Button>
            <Button onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : '+ Bind account'}
            </Button>
          </div>
        }
      />

      {health && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-slate-600">
              Account health
            </span>
            <Badge tone="success">{health.totals.healthy} healthy</Badge>
            <Badge tone="warning">{health.totals.warning} warning</Badge>
            <Badge tone="danger">{health.totals.critical} critical</Badge>
            <span className="ml-auto text-xs text-slate-400">
              {health.totals.total} account(s) · evaluated{' '}
              {new Date(health.evaluatedAt).toLocaleString()}
            </span>
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Account ID"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
            />
            <Input
              placeholder="Account name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              required
            />
            <Input
              placeholder="App ID / Key"
              value={appid}
              onChange={(e) => setAppid(e.target.value)}
            />
            <Input
              placeholder="Secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <Input
              placeholder="Team ID"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            />
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Binding…' : 'Bind account'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <Table<SocialAccount>
          rows={rows}
          emptyMessage="No accounts bound yet."
          columns={[
            { key: 'name', header: 'Account', render: (r) => r.accountName },
            {
              key: 'platform',
              header: 'Platform',
              render: (r) => r.platform,
            },
            {
              key: 'followers',
              header: 'Followers',
              render: (r) => (r.followerCount ?? 0).toLocaleString(),
            },
            {
              key: 'health',
              header: 'Health',
              render: (r) => {
                const found = health?.accounts.find((a) => a.accountId === r.id);
                if (!found) return <span className="text-slate-400">—</span>;
                const critical = found.signals.filter(
                  (s) => s.severity === 'critical',
                ).length;
                const warnings = found.signals.filter(
                  (s) => s.severity === 'warning',
                ).length;
                const label =
                  found.health === 'HEALTHY'
                    ? 'Healthy'
                    : `${critical}C / ${warnings}W`;
                return <Badge tone={HEALTH_TONE[found.health]}>{label}</Badge>;
              },
            },
          ]}
        />
      )}
    </div>
  );
}
