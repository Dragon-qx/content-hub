'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Input, Select } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { MediaAsset, Paginated } from '@/lib/types';

type MediaFilter = '' | 'IMAGE' | 'VIDEO' | 'AUDIO';

const MEDIA_TYPES: { value: MediaFilter; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'AUDIO', label: 'Audio' },
];

const TYPE_ICON: Record<string, string> = {
  VIDEO: '🎬',
  AUDIO: '🎵',
  IMAGE: '🖼️',
};

export default function MediaPage() {
  const [rows, setRows] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Filters
  const [type, setType] = useState<MediaFilter>('');
  const [q, setQ] = useState('');

  // Upload form
  const [contentId, setContentId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ skip: '0', take: '50' });
      if (type) qs.set('type', type);
      if (q.trim()) qs.set('q', q.trim());
      const res = await api.get<Paginated<MediaAsset>>(`/media?${qs.toString()}`);
      setRows(res.items);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Reload when filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, q]);

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg('Choose a file first.');
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      // Use the shared API client so uploads share the auth header handling
      // (including the refresh-once seam) with the rest of the app.
      if (contentId.trim()) {
        await api.upload<{ id: string }>('/media/upload', file, {
          contentId: contentId.trim(),
        });
      } else {
        await api.upload<{ id: string }>('/media/upload', file);
      }
      if (fileRef.current) fileRef.current.value = '';
      setContentId('');
      setMsg('Upload complete.');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20 md:pb-8">
      <PageHeader title="Media" subtitle="Images, video, and audio assets" />

      {/* Upload */}
      <Card>
        <form onSubmit={upload} className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-600">File</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*,audio/*"
              className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>
          <div className="w-full md:w-56">
            <span className="mb-1 block text-sm font-medium text-slate-600">Content ID (optional)</span>
            <Input value={contentId} onChange={(e) => setContentId(e.target.value)} placeholder="Attach to content…" />
          </div>
          <Button type="submit" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
        {msg && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
      </Card>

      {/* Filters */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-600">Search</span>
            <Input placeholder="Search by file name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="sm:w-48">
            <span className="mb-1 block text-sm font-medium text-slate-600">Type</span>
            <Select value={type} onChange={(e) => setType(e.target.value as MediaFilter)}>
              {MEDIA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-400">
          No media yet. Upload your first asset above.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((m) => (
            <Card key={m.id} className="overflow-hidden p-0">
              <div className="flex h-28 items-center justify-center bg-slate-100 text-3xl">
                {TYPE_ICON[m.type] ?? '📁'}
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium" title={m.url}>{m.url.split('/').pop()}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{m.type}</span>
                  <span className="text-xs text-slate-400">{(m.fileSize / 1024).toFixed(0)} KB</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
