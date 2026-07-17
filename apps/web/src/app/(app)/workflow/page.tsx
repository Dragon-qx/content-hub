'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { Workflow, Paginated } from '@/lib/types';

export default function WorkflowPage() {
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
      await api.post(`/workflow/${id}/${action}`, { approverId: 'current-user', comment: '' });
      await load();
    } catch {
      // ignore for now
    }
  };

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Review and decide on pending workflows" />

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <Table<Workflow>
          rows={rows}
          emptyMessage="No workflows."
          columns={[
            { key: 'id', header: 'ID', render: (r) => <span className="font-mono text-xs">{r.id}</span> },
            { key: 'content', header: 'Content', render: (r) => r.contentId ?? '—' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'created', header: 'Created', render: (r) => new Date(r.createdAt).toLocaleString() },
            {
              key: 'actions',
              header: 'Actions',
              render: (r) =>
                r.status === 'PENDING' ? (
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => act(r.id, 'approve')}>Approve</Button>
                    <Button variant="danger" onClick={() => act(r.id, 'reject')}>Reject</Button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
