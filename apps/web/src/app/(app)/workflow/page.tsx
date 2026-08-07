'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { Workflow, Paginated } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function WorkflowPage() {
  const { user } = useAuth();
  const { t } = useT();
  const [rows, setRows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get<Paginated<Workflow>>('/workflow?skip=0&take=50');
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

  const act = async (id: string, action: 'approve' | 'reject') => {
    try {
      // Act as the currently authenticated user; fall back to an empty string
      // only if the session is somehow unavailable (the action will then be
      // rejected server-side as unauthorized).
      await api.post(`/workflow/${id}/${action}`, { approverId: user?.id ?? '', comment: '' });
      await load();
    } catch {
      // ignore for now
    }
  };

  return (
    <div className="pb-20 md:pb-8">
      <PageHeader title={t('workflow.title')} subtitle={t('workflow.subtitle')} />

      {loading ? (
        <div className="text-slate-400">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table<Workflow>
            rows={rows}
            emptyMessage={t('workflow.empty')}
            columns={[
              { key: 'id', header: t('workflow.column.id'), render: (r) => <span className="font-mono text-xs">{r.id}</span> },
              { key: 'content', header: t('workflow.column.content'), render: (r) => r.contentId ?? '—' },
              { key: 'status', header: t('workflow.column.status'), render: (r) => <StatusBadge status={r.status} /> },
              { key: 'created', header: t('workflow.column.created'), render: (r) => new Date(r.createdAt).toLocaleString() },
              {
                key: 'actions',
                header: t('workflow.column.actions'),
                render: (r) =>
                  r.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <Button variant="primary" onClick={() => act(r.id, 'approve')}>{t('workflow.approve')}</Button>
                      <Button variant="danger" onClick={() => act(r.id, 'reject')}>{t('workflow.reject')}</Button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
