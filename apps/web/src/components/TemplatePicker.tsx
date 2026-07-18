'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Input } from '@/lib/ui';
import { ContentTemplate, Paginated, TemplateDraftSeed } from '@/lib/types';

/**
 * Pick a team template and apply it to seed a draft. Fetches the team's
 * templates, lets the user search, and on select calls the backend
 * `apply` endpoint, invoking `onApply` with the resulting draft seed.
 */
export default function TemplatePicker({
  teamId,
  onApply,
  onCancel,
}: {
  teamId: string;
  onApply: (seed: TemplateDraftSeed) => void;
  onCancel: () => void;
}) {
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ teamId, skip: '0', take: '50' });
        if (search.trim()) qs.set('search', search.trim());
        const res = await api.get<Paginated<ContentTemplate>>(`/templates?${qs.toString()}`);
        if (active) setTemplates(res.items);
      } catch (err: any) {
        if (active) setError(err?.message ?? 'Failed to load templates.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [teamId, search]);

  const choose = async (t: ContentTemplate) => {
    setApplying(t.id);
    setError(null);
    try {
      const seed = await api.post<TemplateDraftSeed>(`/templates/${t.id}/apply`, { teamId });
      onApply(seed);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to apply template.');
    } finally {
      setApplying(null);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Load from template</h3>
        <Button variant="secondary" onClick={onCancel}>
          Close
        </Button>
      </div>
      <Input
        placeholder="Search templates…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading ? (
        <p className="text-sm text-slate-400">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-slate-400">
          No templates for this team yet. Save any piece of content as a template to reuse it.
        </p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-100 p-2 sm:flex-row sm:items-center sm:justify-between sm:px-3 sm:py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-700 sm:text-sm">{t.title}</div>
                <div className="text-[10px] text-slate-400 sm:text-xs">
                  {t.contentType}
                  {t.tags.length > 0 && <> · {t.tags.join(', ')}</>}
                </div>
              </div>
              <Button disabled={applying === t.id} onClick={() => choose(t)}>
                {applying === t.id ? 'Loading…' : 'Use'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
