'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Input, Select, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { PLATFORMS, Paginated, SocialAccount } from '@/lib/types';

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

  const load = async () => {
    try {
      const res = await api.get<Paginated<SocialAccount>>('/accounts?skip=0&take=50');
      setRows(res.items);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/accounts', { teamId, platform, accountId, accountName, appid, secret });
      setShowForm(false);
      setAccountId('');
      setAccountName('');
      setAppid('');
      setSecret('');
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Bind and manage social platform accounts"
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Bind account'}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
            <Input placeholder="Account ID" value={accountId} onChange={(e) => setAccountId(e.target.value)} required />
            <Input placeholder="Account name" value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
            <Input placeholder="App ID / Key" value={appid} onChange={(e) => setAppid(e.target.value)} />
            <Input placeholder="Secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
            <Input placeholder="Team ID" value={teamId} onChange={(e) => setTeamId(e.target.value)} />
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
            { key: 'platform', header: 'Platform', render: (r) => r.platform },
            { key: 'followers', header: 'Followers', render: (r) => (r.followerCount ?? 0).toLocaleString() },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
    </div>
  );
}
