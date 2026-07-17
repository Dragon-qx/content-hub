'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, Button, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { MediaAsset, Paginated } from '@/lib/types';

export default function MediaPage() {
  const [rows, setRows] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get<Paginated<MediaAsset>>('/media?skip=0&take=50');
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

  return (
    <div>
      <PageHeader title="Media" subtitle="Images, video, and audio assets" />

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((m) => (
            <Card key={m.id} className="overflow-hidden p-0">
              <div className="flex h-28 items-center justify-center bg-slate-100 text-3xl">
                {m.type === 'VIDEO' ? '🎬' : m.type === 'AUDIO' ? '🎵' : '🖼️'}
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium">{m.url.split('/').pop()}</div>
                <div className="mt-1 flex items-center justify-between">
                  <StatusBadge status={m.type} />
                  <span className="text-xs text-slate-400">{(m.fileSize / 1024).toFixed(0)} KB</span>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-400">
              No media yet. Use the upload API to add assets.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
