'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Input, Select, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { PLATFORMS, PublishJob, Paginated } from '@/lib/types';
import { useT } from '@/lib/i18n';

export default function SchedulerPage() {
  const { t } = useT();
  const [rows, setRows] = useState<PublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [contentId, setContentId] = useState('');
  const [platform, setPlatform] = useState('WECHAT_OFFICIAL');
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
        platform,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      setShowForm(false);
      setContentId('');
      setPlatform('WECHAT_OFFICIAL');
      setScheduledAt('');
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-20 md:pb-8">
      <PageHeader
        title={t('scheduler.title')}
        subtitle={t('scheduler.subtitle')}
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? t('common.cancel') : t('scheduler.scheduleJob')}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input placeholder={t('scheduler.contentId')} value={contentId} onChange={(e) => setContentId(e.target.value)} required />
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)} required>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? t('scheduler.scheduling') : t('scheduler.schedule')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table<PublishJob>
            rows={rows}
            emptyMessage={t('scheduler.empty')}
            columns={[
              { key: 'id', header: t('scheduler.column.job'), render: (r) => <span className="font-mono text-xs">{r.id}</span> },
              { key: 'content', header: t('scheduler.column.content'), render: (r) => <span className="font-mono text-xs">{r.contentId}</span> },
              { key: 'status', header: t('scheduler.column.status'), render: (r) => <StatusBadge status={r.status} /> },
              { key: 'scheduled', header: t('scheduler.column.scheduled'), render: (r) => new Date(r.scheduledAt).toLocaleString() },
              { key: 'retries', header: t('scheduler.column.retries'), render: (r) => r.retryCount },
            ]}
          />
        </div>
      )}
    </div>
  );
}
