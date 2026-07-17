'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Input, Select, Textarea, StatusBadge } from '@/lib/ui';
import PageHeader from '@/components/PageHeader';
import { Table } from '@/components/Table';
import { Content, CONTENT_TYPES, Paginated } from '@/lib/types';

export default function ContentPage() {
  const [rows, setRows] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] = useState('TEXT');
  const [teamId, setTeamId] = useState('default-team');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<Paginated<Content>>('/contents?skip=0&take=20');
      setRows(res.items);
      setTotal(res.total);
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
      await api.post('/contents', { title, body, contentType, teamId });
      setTitle('');
      setBody('');
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

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Textarea
              placeholder="Write your content (Markdown supported)…"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select value={contentType} onChange={(e) => setContentType(e.target.value)}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Team ID" />
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
            { key: 'title', header: 'Title', render: (r) => r.title },
            { key: 'type', header: 'Type', render: (r) => <span className="text-slate-500">{r.contentType}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'updated', header: 'Updated', render: (r) => new Date(r.updatedAt).toLocaleString() },
          ]}
        />
      )}
    </div>
  );
}
