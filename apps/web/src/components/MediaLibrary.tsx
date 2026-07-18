'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MediaAsset, Paginated } from '@/lib/types';
import { Button } from '@/lib/ui';

/**
 * Media library picker. Browses uploaded media assets and reports the chosen
 * one to `onSelect`. Supports filtering by type and an inline upload so a newly
 * captured asset is available without leaving the picker.
 */
interface MediaLibraryProps {
  /** Bound content id so uploaded assets stay associated with the content. */
  contentId?: string;
  onSelect: (asset: MediaAsset) => void;
  onClose: () => void;
}

export default function MediaLibrary({ contentId, onSelect, onClose }: MediaLibraryProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState<'IMAGE' | 'VIDEO' | ''>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ skip: '0', take: '24' });
      if (type) qs.set('type', type);
      const res = await api.get<Paginated<MediaAsset>>(`/media?${qs.toString()}`);
      setAssets(res.items);
      setTotal(res.total);
    } catch {
      setAssets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await api.upload<MediaAsset>('/media/upload', file, {
        ...(contentId ? { contentId } : {}),
      });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 md:px-5">
            <h3 className="text-sm font-semibold text-slate-900">Media library</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col gap-2 px-4 pb-3 md:flex-row md:items-center md:justify-end md:px-5">
            <div className="flex gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as '' | 'IMAGE' | 'VIDEO')}
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-primary md:w-auto"
              >
                <option value="">All</option>
                <option value="IMAGE">Images</option>
                <option value="VIDEO">Videos</option>
              </select>
              <Button
                disabled={uploading}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*,video/*';
                  input.onchange = () => {
                    const f = input.files?.[0];
                    if (f) void upload(f);
                  };
                  input.click();
                }}
              >
                {uploading ? 'Uploading…' : '+ Upload'}
              </Button>
            </div>
          </div>
        </div>

        {error && <div className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
          ) : assets.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No media yet. Upload an image or video to get started.
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-400">{total} item{total === 1 ? '' : 's'}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {assets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect(a)}
                    className="group flex flex-col items-stretch overflow-hidden rounded-lg border border-slate-200 hover:border-primary focus:border-primary focus:outline-none"
                  >
                    <div className="flex aspect-square items-center justify-center bg-slate-50">
                      {a.type === 'IMAGE' && a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt={a.url} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-slate-400">{a.type}</span>
                      )}
                    </div>
                    <div className="truncate px-2 py-1 text-center text-[11px] text-slate-500 group-hover:text-primary">
                      {a.url.replace(/.*\//, '')}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
