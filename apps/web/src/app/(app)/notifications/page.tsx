'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card, Badge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { Notification, NOTIFICATION_TONE, Paginated } from '@/lib/types';
import { useT } from '@/lib/i18n';

export default function NotificationsPage() {
  const { t } = useT();
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
    <div className="pb-20 md:pb-8">
      <PageHeader
        title={t('notifications.title')}
        subtitle={`${unread} ${t('notifications.unread')}`}
        actions={
          unread > 0 ? (
            <Button variant="secondary" onClick={markAll}>{t('notifications.markAllRead')}</Button>
          ) : undefined
        }
      />

      <Card className="mb-6">
        <div className="flex flex-wrap gap-2">
          <Button variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>{t('notifications.all')}</Button>
          <Button variant={filter === 'unread' ? 'primary' : 'secondary'} onClick={() => setFilter('unread')}>{t('notifications.unread')}</Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-slate-400">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table<Notification>
            rows={rows}
            emptyMessage={filter === 'unread' ? t('notifications.noUnread') : t('notifications.noNotifications')}
            columns={[
              {
                key: 'type',
                header: t('notifications.column.type'),
                render: (r) => <Badge tone={NOTIFICATION_TONE[r.type]}>{r.type}</Badge>,
              },
              {
                key: 'title',
                header: t('notifications.column.title'),
                render: (r) => (
                  <button onClick={() => markOne(r.id)} className="text-left hover:underline">
                    <div className={`text-sm ${r.read ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>{r.title}</div>
                    <div className="line-clamp-1 text-xs text-slate-400">{r.body}</div>
                    {r.link && <Link href={r.link} className="text-xs text-primary hover:underline">{t('notifications.open')}</Link>}
                  </button>
                ),
              },
              { key: 'when', header: t('notifications.column.when'), render: (r) => <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</span> },
              {
                key: 'state',
                header: t('notifications.column.state'),
                render: (r) =>
                  r.read ? (
                    <span className="text-xs text-slate-400">{t('notifications.read')}</span>
                  ) : (
                    <Button variant="ghost" onClick={() => markOne(r.id)}>{t('notifications.markRead')}</Button>
                  ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
