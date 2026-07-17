'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card, Input, Select, Badge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import MarkdownEditor from '@/components/MarkdownEditor';
import { Table } from '@/components/Table';
import {
  Content,
  Paginated,
  ContentStatus,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  STATUS_LABELS,
} from '@/lib/types';

export default function ContentPage() {
  const [rows, setRows] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Filters — both supported by the backend `findAll` query.
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ContentStatus>('');

  // Create form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] = useState('TEXT');
  const [teamId, setTeamId] = useState('default-team');
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ skip: '0', take: '20' });
      if (search.trim()) qs.set('search', search.trim());
      if (status) qs.set('status', status);
      const res = await api.get<Paginated<Content>>(`/contents?${qs.toString()}`);
      setRows(res.items);
      setTotal(res.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Reload when filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await api.post('/contents', { title, body, contentType, teamId, tags });
      setTitle('');
      setBody('');
      setTagsInput('');
      setShowForm(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle={`${total} items`}
        actions={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ New content'}
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Search">
            <Input
              placeholder="Search title or body…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as '' | ContentStatus)}>
              <option value="">All statuses</option>
              {CONTENT_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <MarkdownEditor
              value={body}
              onChange={setBody}
              placeholder="Write your content (Markdown supported)…"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select value={contentType} onChange={(e) => setContentType(e.target.value)}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Team ID" />
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Tags (comma-separated)"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Create'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <Table<Content>
          rows={rows}
          emptyMessage="No content yet. Create your first piece."
          columns={[
            {
              key: 'title',
              header: 'Title',
              render: (r) => (
                <Link href={`/contents/${r.id}`} className="font-medium text-primary hover:underline">
                  {r.title}
                </Link>
              ),
            },
            {
              key: 'tags',
              header: 'Tags',
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.tags?.length ? r.tags.map((t) => <Badge key={t.id}>{t.name}</Badge>) : <span className="text-slate-400">—</span>}
                </div>
              ),
            },
            { key: 'type', header: 'Type', render: (r) => <span className="text-slate-500">{r.contentType}</span> },
            { key: 'status', header: 'Status', render: (r) => <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{STATUS_LABELS[r.status] ?? r.status}</span> },
            { key: 'updated', header: 'Updated', render: (r) => new Date(r.updatedAt).toLocaleString() },
          ]}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1 text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
