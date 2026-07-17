'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card, Badge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { Notification, NOTIFICATION_TONE, Paginated } from '@/lib/types';

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const qs = `/notifications?skip=0&take=50${filter === 'unread' ? '&unreadOnly=true' : ''}`;
      const res = await api.get<Paginated<Notification> & { unreadCount: number }>(qs);
      setRows(res.items ?? []);
      setUnread(res.unreadCount ?? 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const markAll = async () => {
    await api.patch('/notifications/read-all', {});
    await load();
  };

  const markOne = async (id: string) => {
    await api.patch(`/notifications/${id}/read`, {});
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread`}
        actions={
          unread > 0 ? (
            <Button variant="secondary" onClick={markAll}>Mark all read</Button>
          ) : undefined
        }
      />

      <Card className="mb-6">
        <div className="flex gap-2">
          <Button variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>All</Button>
          <Button variant={filter === 'unread' ? 'primary' : 'secondary'} onClick={() => setFilter('unread')}>Unread</Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <Table<Notification>
          rows={rows}
          emptyMessage={filter === 'unread' ? 'No unread notifications.' : 'No notifications.'}
          columns={[
            {
              key: 'type',
              header: 'Type',
              render: (r) => <Badge tone={NOTIFICATION_TONE[r.type]}>{r.type}</Badge>,
            },
            {
              key: 'title',
              header: 'Title',
              render: (r) => (
                <button onClick={() => markOne(r.id)} className="text-left hover:underline">
                  <div className={`text-sm ${r.read ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>{r.title}</div>
                  <div className="line-clamp-1 text-xs text-slate-400">{r.body}</div>
                  {r.link && <Link href={r.link} className="text-xs text-primary hover:underline">Open</Link>}
                </button>
              ),
            },
            { key: 'when', header: 'When', render: (r) => <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</span> },
            {
              key: 'state',
              header: 'State',
              render: (r) =>
                r.read ? (
                  <span className="text-xs text-slate-400">Read</span>
                ) : (
                  <Button variant="ghost" onClick={() => markOne(r.id)}>Mark read</Button>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
