'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Input, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { PublishJob, Paginated } from '@/lib/types';

export default function SchedulerPage() {
  const [rows, setRows] = useState<PublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [contentId, setContentId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<Paginated<PublishJob>>('/scheduler?skip=0&take=50');
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
      await api.post('/scheduler', {
        contentId,
        platform: 'WECHAT_OFFICIAL',
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      setShowForm(false);
      setContentId('');
      setScheduledAt('');
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Scheduler"
        subtitle="Schedule and monitor publish jobs"
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Schedule job'}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input placeholder="Content ID" value={contentId} onChange={(e) => setContentId(e.target.value)} required />
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Scheduling…' : 'Schedule'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <Table<PublishJob>
          rows={rows}
          emptyMessage="No scheduled jobs."
          columns={[
            { key: 'id', header: 'Job', render: (r) => <span className="font-mono text-xs">{r.id}</span> },
            { key: 'content', header: 'Content', render: (r) => <span className="font-mono text-xs">{r.contentId}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'scheduled', header: 'Scheduled', render: (r) => new Date(r.scheduledAt).toLocaleString() },
            { key: 'retries', header: 'Retries', render: (r) => r.retryCount },
          ]}
        />
      )}
    </div>
  );
}
